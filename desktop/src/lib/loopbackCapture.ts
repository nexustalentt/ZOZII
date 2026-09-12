// System-audio (loopback) capture for meeting listening.
//
// Grabs the digital output mix of the current default output device
// (speakers or headphones) — which carries Teams/Zoom/Meet audio — via
// getDisplayMedia, auto-approved by the main-process display-media handler
// (audio: 'loopback'). Speech segments are detected with energy-based VAD
// tuned for clean conversation audio and handed to the caller as mono PCM.
// Nothing is persisted.

export type LoopbackCaptureError = 'no-audio' | 'failed'

interface LoopbackCaptureCallbacks {
  onUtterance: (pcm: Float32Array, sampleRate: number) => void
  onError: (error: LoopbackCaptureError) => void
}

// Digital audio is clean, but meeting loudness varies a lot between
// speakers and apps, so the threshold adapts to the measured background
// level instead of using a fixed value. Conversational turns are shorter
// than dictated questions, so the silence window stays moderately tight.
const SPEECH_RMS_MIN = 0.0025
const SPEECH_RMS_MAX = 0.05
const NOISE_FLOOR_FACTOR = 2.2
// The noise estimate starts low so quiet meeting audio is detected instead of
// being locked out, and adapts asymmetrically: falls fast toward real silence,
// rises only slowly so soft speech onset is never learned away as noise.
const NOISE_FLOOR_INIT = 0.0008
const NOISE_FLOOR_FALL_RATE_PER_SEC = 4
const NOISE_FLOOR_RISE_RATE_PER_SEC = 0.5
const CONTINUE_FACTOR = 0.45
const MIN_SPEECH_MS = 280
const SILENCE_MS = 1400
const MAX_UTTERANCE_MS = 90000

function blockMs(blockSize: number, sampleRate: number): number {
  return (blockSize / sampleRate) * 1000
}

export class LoopbackCapture {
  private readonly callbacks: LoopbackCaptureCallbacks
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private processor: ScriptProcessorNode | null = null

  private chunks: Float32Array[] = []
  private chunkLength = 0
  private speaking = false
  private silentBlocks = 0
  private active = false
  // Adaptive noise floor (EMA of RMS measured during non-speech audio).
  private noiseFloor = NOISE_FLOOR_INIT

  /** Current start-of-speech threshold, derived from the live noise floor. */
  private get startThreshold(): number {
    return Math.min(SPEECH_RMS_MAX, Math.max(SPEECH_RMS_MIN, this.noiseFloor * NOISE_FLOOR_FACTOR))
  }

  constructor(callbacks: LoopbackCaptureCallbacks) {
    this.callbacks = callbacks
  }

  async start(): Promise<void> {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          // Raw meeting audio — no browser processing on the loopback feed.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
    } catch (error) {
      this.callbacks.onError('failed')
      return
    }

    // Only the audio track is needed; drop video immediately.
    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) {
      for (const track of stream.getTracks()) track.stop()
      this.callbacks.onError('no-audio')
      return
    }
    for (const track of stream.getVideoTracks()) track.stop()

    this.stream = new MediaStream(audioTracks)
    this.active = true

    try {
      const context = new AudioContext()
      this.context = context
      const source = context.createMediaStreamSource(this.stream)
      // Request up to 2 input channels so stereo loopback can be downmixed.
      const processor = context.createScriptProcessor(4096, 2, 1)
      this.processor = processor

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer
        const left = input.getChannelData(0)
        const right =
          input.numberOfChannels > 1 ? input.getChannelData(1) : left
        this.handleBlock(left, right, context.sampleRate)
      }
      source.connect(processor)
      // ScriptProcessor only runs when connected to a destination.
      // Route through a muted GainNode to avoid echoing meeting audio through speakers again.
      const muteNode = context.createGain()
      muteNode.gain.value = 0
      processor.connect(muteNode)
      muteNode.connect(context.destination)

      // If the source disappears (meeting app closes, device switch), end cleanly.
      for (const track of audioTracks) {
        track.addEventListener('ended', () => this.stop(), { once: true })
      }
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

  /** Average the stereo channels to mono, then run VAD over the block. */
  private handleBlock(
    left: Float32Array,
    right: Float32Array,
    sampleRate: number,
  ): void {
    if (!this.active) return

    const length = Math.min(left.length, right.length)
    const mono = new Float32Array(length)
    let sumSquares = 0
    for (let i = 0; i < length; i += 1) {
      const sample = (left[i] + right[i]) / 2
      mono[i] = sample
      sumSquares += sample * sample
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, length))

    const perBlock = blockMs(length, sampleRate)

    if (!this.speaking && rms >= this.startThreshold) {
      this.speaking = true
      this.silentBlocks = 0
    } else if (this.speaking) {
      // Hysteresis: once speech starts it continues while above a lower
      // threshold, so soft speakers and trailing syllables are not cut off.
      if (rms >= this.startThreshold * CONTINUE_FACTOR) {
        this.silentBlocks = 0
      } else {
        this.silentBlocks += 1
      }
    } else {
      const perSec =
        rms < this.noiseFloor ? NOISE_FLOOR_FALL_RATE_PER_SEC : NOISE_FLOOR_RISE_RATE_PER_SEC
      const rate = Math.min(1, (perBlock / 1000) * perSec)
      this.noiseFloor += (rms - this.noiseFloor) * rate
    }

    if (!this.speaking && this.chunkLength > sampleRate * 2) {
      // Discard long stretches of pure silence/music/noise.
      this.chunks = []
      this.chunkLength = 0
      return
    }

    this.chunks.push(mono)
    this.chunkLength += length

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
    this.silentBlocks = 0

    if (!this.active || length < minSamples) return

    const merged = new Float32Array(length)
    let offset = 0
    for (const chunk of collected) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    this.callbacks.onUtterance(merged, sampleRate)
  }
}
