// Microphone capture with adaptive energy-based voice activity detection.
// Audio is only captured while explicitly started; nothing is persisted.
export type VoiceCaptureError = 'no-microphone' | 'permission-denied' | 'failed'

interface VoiceCaptureCallbacks {
  onUtterance: (pcm: Float32Array, sampleRate: number) => void
  onError: (error: VoiceCaptureError) => void
}

// // Absolute floor so pure-digital-silence streams never trigger speech, and an
// absolute ceiling so extreme noise spikes cannot lock out real speech.
const SPEECH_RMS_MIN = 0.002
const SPEECH_RMS_MAX = 0.04
// Speech must rise this far above the measured background noise to start.
const NOISE_FLOOR_FACTOR = 2.2
// The noise estimate starts low (NOT at the threshold floor) so quiet speech
// spoken immediately after Start is detected instead of being locked out.
const NOISE_FLOOR_INIT = 0.0008
// Background level adapts asymmetrically: it falls quickly toward real
// silence but rises only slowly, so un-detected soft speech onset is never
// learned away as "noise" (which would permanently raise the threshold).
const NOISE_FLOOR_FALL_RATE_PER_SEC = 4
const NOISE_FLOOR_RISE_RATE_PER_SEC = 0.5
// Once speech has started it continues while above this fraction of the start
// threshold — soft word endings and trailing syllables are not cut off.
const CONTINUE_FACTOR = 0.45
const MIN_SPEECH_MS = 250
// Responsive end-of-speech window so conversational questions are captured
// quickly without unnecessary lag or cutting off natural speech.
const SILENCE_MS = 1400
const MAX_UTTERANCE_MS = 60000
// Quiet utterances are gently amplified before transcription so Whisper
// receives consistent levels. Normal/loud recordings are left untouched.
const NORMALIZE_PEAK_TARGET = 0.6
const NORMALIZE_PEAK_TRIGGER = 0.25

function blockMs(blockSize: number, sampleRate: number): number {
  return (blockSize / sampleRate) * 1000
}

/**
 * Resamples mono Float32 audio to a target sample rate (default 16000 Hz) using linear interpolation.
 * Whisper performs best with 16kHz mono audio.
 */
export function resamplePcm(pcm: Float32Array, sourceSampleRate: number, targetSampleRate = 16000): Float32Array {
  if (sourceSampleRate === targetSampleRate || pcm.length === 0) return pcm
  const ratio = sourceSampleRate / targetSampleRate
  const targetLength = Math.round(pcm.length / ratio)
  const result = new Float32Array(targetLength)
  for (let i = 0; i < targetLength; i++) {
    const srcIndex = i * ratio
    const indexFloor = Math.floor(srcIndex)
    const indexCeil = Math.min(indexFloor + 1, pcm.length - 1)
    const fraction = srcIndex - indexFloor
    result[i] = pcm[indexFloor] * (1 - fraction) + pcm[indexCeil] * fraction
  }
  return result
}

export function encodeWav(pcm: Float32Array, sampleRate: number): Uint8Array {
  const targetSampleRate = 16000
  const audioData = sampleRate === targetSampleRate ? pcm : resamplePcm(pcm, sampleRate, targetSampleRate)
  const bytesPerSample = 2
  const dataSize = audioData.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // mono channel
  view.setUint32(24, targetSampleRate, true) // 16000 Hz
  view.setUint32(28, targetSampleRate * bytesPerSample, true) // byte rate
  view.setUint16(32, bytesPerSample, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < audioData.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, audioData[i]))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += bytesPerSample
  }
  return new Uint8Array(buffer)
}

export class VoiceCapture {
  private readonly callbacks: VoiceCaptureCallbacks
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private processor: ScriptProcessorNode | null = null

  private chunks: Float32Array[] = []
  private chunkLength = 0
  private speaking = false
  private speechBlocks = 0
  private silentBlocks = 0
  private active = false
  // Adaptive noise floor (EMA of RMS measured during non-speech audio).
  private noiseFloor = NOISE_FLOOR_INIT

  /** Current start-of-speech threshold, derived from the live noise floor. */
  private get startThreshold(): number {
    return Math.min(SPEECH_RMS_MAX, Math.max(SPEECH_RMS_MIN, this.noiseFloor * NOISE_FLOOR_FACTOR))
  }

  constructor(callbacks: VoiceCaptureCallbacks) {
    this.callbacks = callbacks
  }

  async start(): Promise<void> {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          // Automatic gain control lifts quiet microphones so normal-volume
          // speech is reliably captured without the user speaking loudly.
          autoGainControl: true,
        },
      })
    } catch (error) {
      if (error instanceof DOMException) {
        if (
          error.name === 'NotFoundError' ||
          error.name === 'DevicesNotFoundError' ||
          error.name === 'OverconstrainedError'
        ) {
          this.callbacks.onError('no-microphone')
          return
        }
        if (
          error.name === 'NotAllowedError' ||
          error.name === 'PermissionDeniedError' ||
          error.name === 'SecurityError'
        ) {
          this.callbacks.onError('permission-denied')
          return
        }
      }
      this.callbacks.onError('failed')
      return
    }

    this.stream = stream
    this.active = true

    try {
      const context = new AudioContext()
      this.context = context
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      this.processor = processor

      processor.onaudioprocess = (event) => {
        this.handleBlock(event.inputBuffer.getChannelData(0), context.sampleRate)
      }
      source.connect(processor)
      // ScriptProcessor only runs when connected to a destination.
      // Route through a muted GainNode to avoid mic audio playing through speakers.
      const muteNode = context.createGain()
      muteNode.gain.value = 0
      processor.connect(muteNode)
      muteNode.connect(context.destination)
    } catch {
      this.stop()
      this.callbacks.onError('failed')
    }
  }

  stop(): void {
    this.active = false
    if (this.processor) {
      this.processor.onaudioprocess = null
      this.processor.disconnect()
      this.processor = null
    }
    if (this.context) {
      void this.context.close().catch(() => undefined)
      this.context = null
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop()
      this.stream = null
    }
    this.chunks = []
    this.chunkLength = 0
    this.noiseFloor = NOISE_FLOOR_INIT
  }

  isActive(): boolean {
    return this.active
  }

  private handleBlock(data: Float32Array, sampleRate: number): void {
    if (!this.active) return

    let sumSquares = 0
    for (let i = 0; i < data.length; i += 1) sumSquares += data[i] * data[i]
    const rms = Math.sqrt(sumSquares / data.length)

    const perBlock = blockMs(data.length, sampleRate)

    // Hysteresis: a higher threshold starts speech, a lower one keeps it
    // going. This reliably captures normal and soft conversational speech
    // without chopping off quiet word endings.
    if (!this.speaking && rms >= this.startThreshold) {
      this.speaking = true
      this.speechBlocks = 1
      this.silentBlocks = 0
    } else if (this.speaking) {
      this.speechBlocks += 1
      if (rms >= this.startThreshold * CONTINUE_FACTOR) {
        this.silentBlocks = 0
      } else {
        this.silentBlocks += 1
      }
    } else {
      // Non-speech audio updates the background noise estimate so the
      // threshold adapts to the room (quiet mic or noisy environment).
      // Falls fast toward true silence, rises slowly so speech onsets are
      // never absorbed into the noise floor.
      const perSec =
        rms < this.noiseFloor ? NOISE_FLOOR_FALL_RATE_PER_SEC : NOISE_FLOOR_RISE_RATE_PER_SEC
      const rate = Math.min(1, (perBlock / 1000) * perSec)
      this.noiseFloor += (rms - this.noiseFloor) * rate
    }

    if (!this.speaking && this.chunkLength > sampleRate * 2) {
      // Discard long stretches of pure background noise.
      this.chunks = []
      this.chunkLength = 0
      return
    }

    this.chunks.push(new Float32Array(data))
    this.chunkLength += data.length

    const totalMs = (this.chunkLength / sampleRate) * 1000
    const silenceEnded =
      this.speaking && this.silentBlocks >= Math.ceil(SILENCE_MS / perBlock)
    const hitCap = totalMs >= MAX_UTTERANCE_MS

    if (silenceEnded || hitCap) {
      this.finalize(sampleRate)
    }
  }

  private finalize(sampleRate: number): void {
    const minSamples = (sampleRate * MIN_SPEECH_MS) / 1000
    const collected = this.chunks
    const length = this.chunkLength
    this.chunks = []
    this.chunkLength = 0
    this.speaking = false
    this.speechBlocks = 0
    this.silentBlocks = 0

    if (!this.active || length < minSamples) return

    const merged = new Float32Array(length)
    let offset = 0
    for (const chunk of collected) {
      merged.set(chunk, offset)
      offset += chunk.length
    }

    // Quiet utterances are gently amplified toward a consistent level so the
    // recognizer hears them clearly. Normal/loud audio is never altered.
    let loudest = 0
    for (let i = 0; i < merged.length; i += 1) {
      const abs = Math.abs(merged[i])
      if (abs > loudest) loudest = abs
    }
    if (loudest > 0 && loudest < NORMALIZE_PEAK_TRIGGER) {
      const gain = Math.min(NORMALIZE_PEAK_TARGET / loudest, 8)
      for (let i = 0; i < merged.length; i += 1) merged[i] *= gain
    }

    this.callbacks.onUtterance(merged, sampleRate)
  }
}
