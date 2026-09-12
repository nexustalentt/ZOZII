import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import AssistantHeader from './components/AssistantHeader'
import Composer from './components/Composer'
import ConnectionDialog from './components/ConnectionDialog'
import ResponsePanel, { type Exchange } from './components/ResponsePanel'
import {
  backendHasSession,
  backendLogin,
  backendLogout,
  backendRevalidate,
  backendRegister,
  backendSendPlanRequest,
  backendUsageHeartbeat,
  backendUsageStart,
  backendUsageStop,
  validateErrorMessage,
  type AccessState,
} from './lib/backend'
import { findOption } from './lib/options'
import { VoiceCapture, encodeWav, type VoiceCaptureError } from './lib/voiceCapture'
import { LoopbackCapture, type LoopbackCaptureError } from './lib/loopbackCapture'
import { applyWindowTransparency, loadTransparency, TRANSPARENCY_KEY } from './lib/transparency'
import type { AiProvider, AuthValidateResult } from './types/zozii'

const COMPACT_HEIGHT_FALLBACK = 350
const MAX_HEIGHT_FALLBACK = 620
const MIN_HEIGHT_FALLBACK = 52

type VoicePhase = 'idle' | 'listening' | 'processing'
type UtteranceSource = 'voice' | 'meeting'

const LISTEN_MEETING_KEY = 'hireme:listen-meeting'

const TRIAL_QUESTIONS_MAX = 10
const TRIAL_QUESTIONS_PREFIX = 'hireme:trial-questions'

function trialQuestionsKey(account: string | null): string {
  return account ? `${TRIAL_QUESTIONS_PREFIX}:${account}` : TRIAL_QUESTIONS_PREFIX
}

function loadTrialQuestions(account: string | null): number {
  const value = Number(localStorage.getItem(trialQuestionsKey(account)) ?? '0')
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function saveTrialQuestions(account: string | null, count: number): void {
  if (!account) return
  localStorage.setItem(trialQuestionsKey(account), String(Math.max(0, Math.floor(count))))
}

function clearTrialQuestions(account: string | null): void {
  localStorage.removeItem(trialQuestionsKey(account))
}

function errorAnswerText(message: string, provider: AiProvider): string {
  const providerName = provider === 'groq' ? 'API 1' : 'API 2'
  if (message === 'timeout') {
    return `**Request timed out.** ${providerName} did not respond in time. Please try again.`
  }
  if (message === 'auth') {
    return `**${providerName} rejected the key.** Use *Disconnect*, then *Add Connection* to connect with a valid key.`
  }
  if (message === 'bad-request') {
    return `**${providerName} rejected the request** (invalid request or payload). Please try again.`
  }
  if (message === 'model') {
    return `**${providerName} could not find the configured model.** It may have been retired — please update ZOZII.`
  }
  if (message === 'rate-limit') {
    return `**${providerName} rate limit reached.** Please wait a moment and try again.`
  }
  if (message === 'server') {
    return `**${providerName} server error.** Please try again in a moment.`
  }
  if (message === 'not-connected') {
    return `**Please connect ${providerName} first.**`
  }
  return `**Unable to reach ${providerName}.** Check your internet connection and try again.`
}

function micErrorText(error: VoiceCaptureError): string {
  if (error === 'no-microphone') return '**No microphone detected.**'
  if (error === 'permission-denied') return '**Microphone access is required for voice input.**'
  return '**Speech recognition failed. Please try again.**'
}

// Light cleanup only — trim, collapse repeated whitespace, drop empties.
// The recognized text is never rewritten or "corrected".
function cleanRecognizedText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

// Validates that recognized text is non-trivial speech and not pure noise/fillers.
function isMeaningfulQuestion(text: string): boolean {
  if (text.length < 2) return false
  const normalized = text.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")

  // Reject only if the ENTIRE recognized text is merely a conversational filler/noise hallucination
  const pureIgnoredPhrases = [
    'thank you',
    'thanks',
    'you are welcome',
    'youre welcome',
    'question detected',
    'a question detected',
    'thank you for watching',
    'please subscribe',
    'subscribe',
    'subtitles by',
    'downloaded from',
    'bye',
    'goodbye',
  ]

  if (pureIgnoredPhrases.some(phrase => normalized === phrase)) {
    return false
  }

  const words = text.split(/\s+/).filter((word) => /\p{L}{2,}|\p{N}/u.test(word))
  return words.length >= 1
}

export default function App(): React.JSX.Element {
  const [version, setVersion] = useState('0.1.0')
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [planType, setPlanType] = useState<string | null>(null)
  const [trialQuestionsUsed, setTrialQuestionsUsed] = useState(0)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showAccessModal, setShowAccessModal] = useState(false)
  const [accessModalMessage, setAccessModalMessage] = useState('')
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [listening, setListening] = useState(false)
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [groqConnected, setGroqConnected] = useState(false)
  const [aiProvider, setAiProvider] = useState<AiProvider>('groq')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [codeOnly, setCodeOnly] = useState(false)
  const [fullCode, setFullCode] = useState(false)
  const [hoverEnabled, setHoverEnabled] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [transparency, setTransparency] = useState<number>(loadTransparency)

  const handleTransparencyChange = useCallback((val: number) => {
    const clamped = Math.min(1, Math.max(0, val))
    setTransparency(clamped)
    localStorage.setItem(TRANSPARENCY_KEY, String(clamped))
    applyWindowTransparency(clamped)
  }, [])

  const [mousePos, setMousePos] = useState({ x: -100, y: -100 })
  const [mouseInWindow, setMouseInWindow] = useState(false)

  const codeOnlyRef = useRef(codeOnly)
  useEffect(() => {
    codeOnlyRef.current = codeOnly
  }, [codeOnly])

  const planTypeRef = useRef<string | null>(null)
  useEffect(() => {
    planTypeRef.current = planType
  }, [planType])

  const fullCodeRef = useRef(fullCode)
  useEffect(() => {
    fullCodeRef.current = fullCode
  }, [fullCode])

  const selectedIdsRef = useRef(selectedIds)
  useEffect(() => {
    selectedIdsRef.current = selectedIds
  }, [selectedIds])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY })
    }
    const handleMouseEnter = () => setMouseInWindow(true)
    const handleMouseLeave = () => setMouseInWindow(false)

    window.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseenter', handleMouseEnter)
    document.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseenter', handleMouseEnter)
      document.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [])
  const [listenMeeting, setListenMeeting] = useState<boolean>(
    () => localStorage.getItem(LISTEN_MEETING_KEY) !== '0',
  )

  const [maxHeight, setMaxHeight] = useState(MAX_HEIGHT_FALLBACK)
  const compactHeightRef = useRef(COMPACT_HEIGHT_FALLBACK)
  const minHeightRef = useRef(MIN_HEIGHT_FALLBACK)

  const frameRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastRequestedHeight = useRef<number | null>(null)
  const exchangesRef = useRef<Exchange[]>([])
  const pendingActionRef = useRef<(() => void) | null>(null)

  // Voice input state.
  const captureRef = useRef<VoiceCapture | null>(null)
  const loopbackRef = useRef<LoopbackCapture | null>(null)
  const loopbackNoticeShownRef = useRef(false)
  const voiceActiveRef = useRef(false)
  const voicePhaseRef = useRef<VoicePhase>('idle')
  const groqConnectedRef = useRef(groqConnected)
  const lastVoiceQuestionRef = useRef('')
  const lastMeetingQuestionRef = useRef('')

  useEffect(() => {
    voicePhaseRef.current = voicePhase
  }, [voicePhase])
  useEffect(() => {
    groqConnectedRef.current = groqConnected
  }, [groqConnected])
  useEffect(() => {
    localStorage.setItem(LISTEN_MEETING_KEY, listenMeeting ? '1' : '0')
  }, [listenMeeting])
  const listenMeetingRef = useRef(listenMeeting)
  useEffect(() => {
    listenMeetingRef.current = listenMeeting
  }, [listenMeeting])

  useEffect(() => {
    exchangesRef.current = exchanges
  }, [exchanges])

  // Session / Authentication management
  // On startup, if credentials were persisted securely, re-validate against
  // the backend so the app opens directly into an ACTIVE session.
  useEffect(() => {
    const validate = async (): Promise<void> => {
      try {
        const hasSession = await backendHasSession()
        if (!hasSession) {
          setShowLoginModal(true)
          return
        }
        const result = await backendRevalidate()
        applyValidation(
          result.status,
          result.access_expiry_time ?? null,
          result.remaining_seconds ?? null,
          result.user_id ?? undefined,
          result.plan_type ?? null,
        )
      } catch {
        setShowLoginModal(true)
      }
    }
    void validate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyValidation = useCallback(
    (
      _state: AccessState,
      _expiry: string | null,
      remaining: number | null,
      username?: string,
      plan?: string | null,
    ) => {
      setRemainingSeconds(remaining)
      setCurrentUser(_state === 'ACTIVE' ? username ?? currentUser : null)
      const nextPlan = plan ?? planTypeRef.current
      planTypeRef.current = nextPlan
      setPlanType(nextPlan)

      // A real (admin-granted) plan removes the trial question cap.
      const account = currentUser ?? username ?? null
      if (nextPlan === 'paid') {
        clearTrialQuestions(account)
        setTrialQuestionsUsed(0)
      } else if (nextPlan === 'trial') {
        // Reload the persisted per-account counter (survives restarts).
        setTrialQuestionsUsed(loadTrialQuestions(account))
      }

      if (_state === 'ACTIVE') {
        setShowLoginModal(false)
        setShowAccessModal(false)
        setShowPlanModal(false)
        // Stop listening if a prior non-active state had it disabled.
        if (username && currentUser && currentUser !== username) setListening(false)
        return
      }

      // Non-active statuses: stop listening and show the relevant message.
      voiceActiveRef.current = false
      captureRef.current?.stop()
      captureRef.current = null
      loopbackRef.current?.stop()
      loopbackRef.current = null
      setVoicePhase('idle')
      setListening(false)

      if (_state === 'NOT_FOUND') {
        setCurrentUser(null)
        setShowLoginModal(true)
        setShowAccessModal(false)
        setShowPlanModal(false)
        return
      }

      // An exhausted (or never-started) free trial prompts the user to request
      // a plan instead of the generic expiry notice. No "activation" step.
      if ((_state === 'EXPIRED' || _state === 'INACTIVE') && nextPlan === 'trial') {
        setShowAccessModal(false)
        setShowLoginModal(false)
        setShowPlanModal(true)
        return
      }

      setAccessModalMessage(validateErrorMessage(_state))
      setShowLoginModal(false)
      setShowAccessModal(true)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser],
  )

  // Periodically re-check access status with the backend so the admin can
  // suspend/block/expire a user live. Also flips state when access expires.
  useEffect(() => {
    if (!currentUser) return
    const interval = window.setInterval(() => {
      void backendRevalidate().then((result) => {
        applyValidation(
          result.status,
          result.access_expiry_time ?? null,
          result.remaining_seconds ?? null,
          result.user_id ?? undefined,
          result.plan_type ?? null,
        )
      })
    }, 30000)
    return () => window.clearInterval(interval)
  }, [currentUser, applyValidation])

  // While listening, bank usage every 15s so a crash loses at most one beat and
  // the admin's budget is consumed only for actual recording time.
  useEffect(() => {
    if (!listening) return
    const interval = window.setInterval(() => {
      void backendUsageHeartbeat().then((result) => {
        if (result.status !== 'ACTIVE') {
          applyValidation(
            result.status,
            result.access_expiry_time ?? null,
            result.remaining_seconds ?? null,
            undefined,
            result.plan_type ?? null,
          )
          return
        }
        setRemainingSeconds(result.remaining_seconds ?? null)
      })
    }, 15000)
    return () => window.clearInterval(interval)
  }, [listening, applyValidation])

  const handleLogout = useCallback(() => {
    // Bank any running usage before dropping credentials.
    if (voiceActiveRef.current) {
      void backendUsageStop().then((result) => {
        if (result.status !== 'ACTIVE') {
          applyValidation(
            result.status,
            result.access_expiry_time ?? null,
            result.remaining_seconds ?? null,
            undefined,
            result.plan_type ?? null,
          )
        }
      })
    }
    // Stop any active voice session safely
    voiceActiveRef.current = false
    if (captureRef.current) {
      captureRef.current.stop()
      captureRef.current = null
    }
    if (loopbackRef.current) {
      loopbackRef.current.stop()
      loopbackRef.current = null
    }
    setVoicePhase('idle')
    setListening(false)

    setExchanges([])
    setQuestion('')
    void backendLogout()
    setCurrentUser(null)
    setPlanType(null)
    planTypeRef.current = null
    setRemainingSeconds(null)
    setShowLoginModal(true)
    setShowAccessModal(false)
    setShowPlanModal(false)
    setAccessModalMessage('')
  }, [applyValidation])

  // Initial bridge data.
  useEffect(() => {
    let cancelled = false
    window.zozii?.getVersion().then((v) => {
      if (!cancelled) setVersion(v)
    })
    window.zozii?.getDisplayInfo().then((info) => {
      if (cancelled) return
      setMaxHeight(Math.max(info.minHeight, info.maxHeight))
      compactHeightRef.current = Math.min(info.compactHeight, info.maxHeight)
      minHeightRef.current = info.minHeight
    })
    void (async () => {
      const selected = await window.zozii?.aiGetProvider()
      const provider = selected?.provider ?? 'groq'
      const status = provider === 'groq'
        ? await window.zozii?.groqGetStatus()
        : await window.zozii?.geminiGetStatus()
      if (!cancelled) { setAiProvider(provider); setGroqConnected(status?.connected ?? false) }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Streamed answer events.
  useEffect(() => {
    const onChunk = ({ requestId, delta }: { requestId: number; delta: string }) => {
      setExchanges((current) =>
        current.map((exchange) =>
          exchange.id === requestId ? { ...exchange, answer: exchange.answer + delta } : exchange,
        ),
      )
    }
    const onDone = ({ requestId, full }: { requestId: number; full: string }) => {
      setExchanges((current) =>
        current.map((exchange) =>
          exchange.id === requestId
            ? { ...exchange, answer: full.length > 0 ? full : exchange.answer, done: true }
            : exchange,
        ),
      )
    }
    const onError = ({ requestId, message, provider }: { requestId: number; message: string; provider: AiProvider }) => {
      const text = errorAnswerText(message, provider)
      setExchanges((current) =>
        current.map((exchange) =>
          exchange.id === requestId
            ? {
                ...exchange,
                answer: `${exchange.answer}${exchange.answer.length > 0 ? '\n\n' : ''}${text}`,
                done: true,
              }
            : exchange,
        ),
      )
    }
    const offChunk = window.zozii?.onGroqChunk(onChunk)
    const offDone = window.zozii?.onGroqDone(onDone)
    const offError = window.zozii?.onGroqError((event) => onError({ ...event, provider: 'groq' }))
    const offGeminiChunk = window.zozii?.onGeminiChunk(onChunk)
    const offGeminiDone = window.zozii?.onGeminiDone(onDone)
    const offGeminiError = window.zozii?.onGeminiError((event) => onError({ ...event, provider: 'gemini' }))
    return () => {
      offChunk?.()
      offDone?.()
      offError?.()
      offGeminiChunk?.()
      offGeminiDone?.()
      offGeminiError?.()
    }
  }, [])

  useEffect(() => {
    return () => {
      captureRef.current?.stop()
      captureRef.current = null
    }
  }, [])

  // Session timer — runs while the microphone session is active.
  useEffect(() => {
    if (!listening) return
    const interval = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [listening])

  const appendVoiceNotice = useCallback(
    (answerText: string, source: UtteranceSource = 'voice'): void => {
      setExchanges((current) => [
        ...current,
        {
          id: Date.now() + Math.random(),
          question: source === 'meeting' ? '(Meeting)' : '(Voice)',
          answer: answerText,
          done: true,
        },
      ])
    },
    [],
  )

  // Submits through the exact same path as typed questions (history included).
  const sendToGroq = useCallback(
    (text: string): void => {
      const requestId = Date.now()
      const past = exchangesRef.current
        .filter((exchange) => exchange.done)
        .slice(-8)
        .map(({ question: q, answer }) => ({ question: q, answer }))
      const selectedLabels = selectedIdsRef.current
        .map((id) => findOption(id)?.label)
        .filter((label): label is string => label !== undefined)

      const payload = {
        requestId,
        question: text,
        selectedLabels,
        history: past,
        codeOnly: codeOnlyRef.current,
        fullCode: fullCodeRef.current,
      }
      if (aiProvider === 'gemini') void window.zozii?.geminiAsk(payload)
      else void window.zozii?.groqAsk(payload)
      setExchanges((current) => [...current, { id: requestId, question: text, answer: '', done: false }])
    },
    [aiProvider],
  )

  const submitQuestion = useCallback(
    (text: string): void => {
      if (!currentUser) {
        setShowLoginModal(true)
        return
      }
      // Trials are limited to 10 questions; ask for a plan once that's used up.
      if (planTypeRef.current === 'trial' && trialQuestionsUsed >= TRIAL_QUESTIONS_MAX) {
        setShowPlanModal(true)
        return
      }
      if (!groqConnected) {
        // No Groq request is sent while disconnected.
        const requestId = Date.now()
        setExchanges((current) => [
          ...current,
          { id: requestId, question: text, answer: errorAnswerText('not-connected', aiProvider), done: true },
        ])
        return
      }
      sendToGroq(text)
      if (planTypeRef.current === 'trial') {
        setTrialQuestionsUsed((count) => {
          const next = count + 1
          saveTrialQuestions(currentUser, next)
          return next
        })
      }
    },
    [currentUser, groqConnected, sendToGroq, aiProvider, trialQuestionsUsed],
  )

  const stopVoice = useCallback((): void => {
    const wasActive = voiceActiveRef.current
    voiceActiveRef.current = false
    captureRef.current?.stop()
    captureRef.current = null
    loopbackRef.current?.stop()
    loopbackRef.current = null
    setVoicePhase('idle')
    setListening(false)

    // Pause the usage meter: bank elapsed seconds and close the interval.
    if (wasActive) {
      void backendUsageStop().then((result) => {
        if (result.status !== 'ACTIVE') {
          applyValidation(
            result.status,
            result.access_expiry_time ?? null,
            result.remaining_seconds ?? null,
            undefined,
            result.plan_type ?? null,
          )
          return
        }
        setRemainingSeconds(result.remaining_seconds ?? null)
      })
    }
  }, [applyValidation])

  // Finalized utterance → speech-to-text → existing question input → existing
  // Groq chat handler. Only complete (final) utterances are ever submitted.
  // Handles both sources: 'voice' (microphone) and 'meeting' (system loopback).
  const handleUtterance = useCallback(
    async (pcm: Float32Array, sampleRate: number, source: UtteranceSource = 'voice'): Promise<void> => {
      if (!voiceActiveRef.current || voicePhaseRef.current !== 'listening') return

      const wav = encodeWav(pcm, sampleRate)
      let result
      try {
        result = await window.zozii?.transcribeSpeech(wav)
      } catch {
        result = undefined
      }

      if (!voiceActiveRef.current) return

      const text = result?.ok ? cleanRecognizedText(result.text ?? '') : ''
      const normalized = text.toLowerCase()
      const lastQuestionRef =
        source === 'meeting' ? lastMeetingQuestionRef : lastVoiceQuestionRef
      if (result === undefined || !result.ok) {
        // Silent for meeting audio: background noise segments fail softly.
        if (source === 'voice') {
          appendVoiceNotice(
            result?.reason === 'not-connected'
              ? errorAnswerText('not-connected', aiProvider)
              : result?.reason === 'unreliable' || result?.reason === 'empty'
                ? "**I couldn't clearly hear that. Please repeat.**"
                : '**Speech recognition failed. Please try again.**',
          )
        }
      } else if (!isMeaningfulQuestion(text)) {
        if (source === 'voice') {
          appendVoiceNotice("**I couldn't understand the question. Please try again.**")
        }
      } else if (normalized === lastQuestionRef.current) {
        // Same final speech result as the previous question — submit exactly
        // once, never repeatedly for the same completed utterance.
      } else {
        // Route through the existing question input → existing chat handler,
        // exactly like a typed submission. Clear the input afterwards so the
        // composer is ready for the next question.
        setQuestion('')
        submitQuestion(text)
        lastQuestionRef.current = normalized
      }
    },
    [appendVoiceNotice, submitQuestion, aiProvider],
  )

  const handleLoopbackError = useCallback(
    (error: LoopbackCaptureError): void => {
      loopbackRef.current = null
      // Meeting listening is best-effort: surface one notice, keep mic-only.
      if (!loopbackNoticeShownRef.current && voiceActiveRef.current) {
        loopbackNoticeShownRef.current = true
        appendVoiceNotice(
          error === 'no-audio'
            ? '*Meeting audio capture is unavailable on this system — continuing with microphone only.*'
            : '*Meeting audio capture failed — continuing with microphone only.*',
          'meeting',
        )
      }
    },
    [appendVoiceNotice],
  )

  const handleCaptureError = useCallback(
    (error: VoiceCaptureError): void => {
      voiceActiveRef.current = false
      captureRef.current = null
      setVoicePhase('idle')
      setListening(false)
      appendVoiceNotice(micErrorText(error))
    },
    [appendVoiceNotice],
  )

  const beginVoiceListening = useCallback(async (): Promise<void> => {
    // Ensure the usage meter is open; only open wallets get to record.
    let usage: AuthValidateResult | null = null
    try {
      usage = await backendUsageStart()
    } catch {
      usage = null
    }
    if (!usage || usage.status !== 'ACTIVE') {
      applyValidation(
        usage?.status ?? 'NOT_FOUND',
        usage?.access_expiry_time ?? null,
        usage?.remaining_seconds ?? null,
        undefined,
        usage?.plan_type ?? null,
      )
      return
    }
    setRemainingSeconds(usage.remaining_seconds ?? null)
    setElapsedSeconds(0)
    lastVoiceQuestionRef.current = ''
    lastMeetingQuestionRef.current = ''
    loopbackNoticeShownRef.current = false
    const capture = new VoiceCapture({
      onUtterance: (pcm, sampleRate) => void handleUtterance(pcm, sampleRate, 'voice'),
      onError: handleCaptureError,
    })
    captureRef.current = capture
    voiceActiveRef.current = true
    void capture.start().then(() => {
      if (!voiceActiveRef.current || captureRef.current !== capture) return
      // Meeting listening: capture the system output mix (loopback) in
      // parallel so participant speech is transcribed and answered too.
      if (listenMeetingRef.current && !loopbackRef.current) {
        const loopback = new LoopbackCapture({
          onUtterance: (pcm, sampleRate) => void handleUtterance(pcm, sampleRate, 'meeting'),
          onError: handleLoopbackError,
        })
        loopbackRef.current = loopback
        void loopback.start()
      }
      setVoicePhase('listening')
      setListening(true)
    })
  }, [handleUtterance, handleCaptureError, handleLoopbackError, applyValidation])

  const handleToggleListening = useCallback((): void => {
    if (!currentUser) {
      setShowLoginModal(true)
      return
    }
    if (voicePhaseRef.current !== 'idle') {
      stopVoice()
      return
    }
    if (!groqConnected) {
      pendingActionRef.current = beginVoiceListening
      setDialogOpen(true)
      return
    }
    beginVoiceListening()
  }, [currentUser, groqConnected, beginVoiceListening, stopVoice])

  useEffect(() => {
    const unsub = window.zozii?.onToggleListening(() => {
      handleToggleListening()
    })
    return () => unsub?.()
  }, [handleToggleListening])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        const activeEl = document.activeElement
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
          return
        }
        e.preventDefault()
        handleToggleListening()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleToggleListening])

  const handleProviderChange = useCallback(async (provider: AiProvider): Promise<void> => {
    const result = await window.zozii?.aiSetProvider(provider)
    if (!result?.ok) return
    const status = provider === 'groq'
      ? await window.zozii?.groqGetStatus()
      : await window.zozii?.geminiGetStatus()
    setAiProvider(provider)
    setGroqConnected(status?.connected ?? false)
    groqConnectedRef.current = status?.connected ?? false
  }, [])

  const handleConnected = useCallback((provider: AiProvider): void => {
    setAiProvider(provider)
    setGroqConnected(true)
    groqConnectedRef.current = true
    const action = pendingActionRef.current
    pendingActionRef.current = null
    if (action) action()
  }, [])

  const handleDisconnect = useCallback((): void => {
    // Stop any active voice session safely before dropping the connection.
    stopVoice()
    pendingActionRef.current = null
    if (aiProvider === 'gemini') void window.zozii?.geminiDisconnect()
    else void window.zozii?.groqDisconnect()
    setGroqConnected(false)
    groqConnectedRef.current = false
  }, [stopVoice, aiProvider])

  const handleSelectionChange = useCallback((ids: string[]) => setSelectedIds(ids), [])

  const resetConversation = useCallback((): void => {
    setExchanges([])
  }, [])

  const trialLeft = Math.max(0, TRIAL_QUESTIONS_MAX - trialQuestionsUsed)
  const questionsRemaining = planType === 'trial' ? trialLeft : null

  // Grow the floating window downward to fit the answer, clamped by the
  // main-process limits (~60% of the screen height). Never full-screen.
  useLayoutEffect(() => {
    if (isCollapsed) {
      lastRequestedHeight.current = 52
      void window.zozii?.setWindowSize(null, 52)
      return
    }

    const frame = frameRef.current
    if (!frame) return

    if (exchanges.length === 0) {
      lastRequestedHeight.current = compactHeightRef.current
      void window.zozii?.setWindowSize(null, compactHeightRef.current)
      return
    }

    const header = frame.querySelector<HTMLElement>('.assistant-header')
    const panel = frame.querySelector<HTMLElement>('.main-panel-card')
    const inner = frame.querySelector<HTMLElement>('.response-inner')
    const composer = frame.querySelector<HTMLElement>('.composer-container')
    if (!header || !panel || !inner || !composer) return

    const desired =
      header.offsetHeight +
      panel.offsetHeight +
      16
    const clamped = Math.round(
      Math.max(minHeightRef.current, Math.min(desired, maxHeight)),
    )
    if (lastRequestedHeight.current !== null && Math.abs(clamped - lastRequestedHeight.current) < 2) {
      return
    }
    lastRequestedHeight.current = clamped
    void window.zozii?.setWindowSize(null, clamped)
  }, [exchanges, maxHeight, isCollapsed])

  // Reset back to the compact height when the conversation is cleared.
  useLayoutEffect(() => {
    if (isCollapsed) return
    if (exchanges.length > 0) return
    if (lastRequestedHeight.current === null) return
    lastRequestedHeight.current = null
    void window.zozii?.setWindowSize(null, compactHeightRef.current)
  }, [exchanges, isCollapsed])

  // Keep the latest answer in view while it streams.
  useEffect(() => {
    const scroll = scrollRef.current
    if (scroll && exchanges.length > 0) scroll.scrollTop = scroll.scrollHeight
  }, [exchanges])

  return (
    <div
      className={`glass-frame${hoverEnabled && !mouseInWindow ? ' glass-frame--hover-dimmed' : ''}`}
      ref={frameRef}
    >
      <AssistantHeader
        listening={listening}
        processing={voicePhase === 'processing'}
        elapsedSeconds={elapsedSeconds}
        version={version}
        groqConnected={groqConnected}
        aiProvider={aiProvider}
        selectedIds={selectedIds}
        listenMeeting={listenMeeting}
        hoverEnabled={hoverEnabled}
        isCollapsed={isCollapsed}
        onToggleHover={() => setHoverEnabled((prev) => !prev)}
        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
        onListenMeetingChange={setListenMeeting}
        onSelectionChange={handleSelectionChange}
        onToggleListening={handleToggleListening}
        onResetConversation={resetConversation}
        onAddConnection={() => setDialogOpen(true)}
        onDisconnect={handleDisconnect}
        remainingSeconds={remainingSeconds}
        questionsRemaining={questionsRemaining}
        onLogout={handleLogout}
      />

      {!isCollapsed && (
        <div className="main-panel-card">
          <Composer
            value={question}
            disabled={voicePhase === 'processing'}
            transparency={transparency}
            onTransparencyChange={handleTransparencyChange}
            onValueChange={setQuestion}
            onSubmit={submitQuestion}
            codeOnly={codeOnly}
            onCodeOnlyChange={(checked) => {
              setCodeOnly(checked)
              if (checked) setFullCode(false)
            }}
            fullCode={fullCode}
            onFullCodeChange={(checked) => {
              setFullCode(checked)
              if (checked) setCodeOnly(false)
            }}
          />

          <div className="panel-divider" />

          <main className="response-area">
            <div className="response-scroll" ref={scrollRef}>
              <div className="response-inner">
                <ResponsePanel exchanges={exchanges} />
              </div>
            </div>
          </main>
        </div>
      )}

      <ConnectionDialog
        open={dialogOpen}
        provider={aiProvider}
        onClose={() => setDialogOpen(false)}
        onProviderChange={handleProviderChange}
        onConnected={handleConnected}
      />

      <LoginRegisterModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={(username, _expiry, remaining, plan) => {
          setCurrentUser(username)
          planTypeRef.current = plan ?? null
          setPlanType(plan ?? null)
          setTrialQuestionsUsed(plan === 'trial' ? loadTrialQuestions(username) : 0)
          setRemainingSeconds(remaining)
          setShowLoginModal(false)
          setShowAccessModal(false)
          setShowPlanModal(false)
        }}
      />

      <AccessStatusModal
        open={showAccessModal}
        message={accessModalMessage}
        onClose={handleLogout}
      />

      <PlanRequestModal
        open={showPlanModal}
        onClose={() => setShowPlanModal(false)}
      />

      {mouseInWindow && (
        <CustomStealthCursor x={mousePos.x} y={mousePos.y} />
      )}
    </div>
  )
}

function CustomStealthCursor({ x, y }: { x: number; y: number }): React.JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        pointerEvents: 'none',
        zIndex: 99999,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="cursor-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b7cf7" />
            <stop offset="100%" stopColor="#2ee6c8" />
          </linearGradient>
        </defs>
        <path
          d="M4.5 3V20.5L9.8 14.7H17.8L4.5 3Z"
          fill="url(#cursor-grad)"
          stroke="rgba(255, 255, 255, 0.9)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

interface LoginRegisterModalProps {
  open: boolean
  onClose: () => void
  onLoginSuccess: (
    username: string,
    expiry: string | null,
    remaining: number | null,
    planType: string | null,
  ) => void
}

function LoginRegisterModal({ open, onClose, onLoginSuccess }: LoginRegisterModalProps): React.JSX.Element | null {
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastOpen, setLastOpen] = useState(open)

  useEffect(() => {
    if (open && !lastOpen) {
      setError('')
      setBusy(false)
    }
    setLastOpen(open)
  }, [open, lastOpen])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setError('')
    const trimmedUser = username.trim()
    const trimmedEmail = email.trim()

    if (isRegister) {
      if (!trimmedEmail || !password) {
        setError('Please fill in all fields.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
      if (password.length < 4) {
        setError('Password must be at least 4 characters.')
        return
      }

      setBusy(true)
      void (async () => {
        // The email is the identity: register with it as both username and email.
        const res = await backendRegister(trimmedEmail, password, name.trim(), trimmedEmail)
        if (!res.ok) {
          setError(res.error ?? 'Registration failed.')
          setBusy(false)
          return
        }
        // Registration succeeded and auto-logged-in (credentials cached).
        const val = await backendLogin(trimmedEmail, password)
        setBusy(false)
        if (val.status === 'ACTIVE') {
          onLoginSuccess(
            val.user_id || trimmedEmail,
            val.access_expiry_time ?? null,
            val.remaining_seconds ?? null,
            val.plan_type ?? null,
          )
        } else {
          setError(validateErrorMessage(val.status) || 'Registration succeeded, but the free trial did not start. Please log in again.')
        }
      })()
      return
    }

    // Login
    if (!trimmedUser || !password) {
      setError('Please fill in all fields.')
      return
    }
    setBusy(true)
    void (async () => {
      const val = await backendLogin(trimmedUser, password)
      if (val.status === 'ACTIVE') {
        onLoginSuccess(
          val.user_id || trimmedUser,
          val.access_expiry_time ?? null,
          val.remaining_seconds ?? null,
          val.plan_type ?? null,
        )
      } else {
        setError(
          val.status === 'NOT_FOUND'
            ? 'Invalid username or password. Please register.'
            : validateErrorMessage(val.status),
        )
      }
      setBusy(false)
    })()
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <div className="dialog-header">
          <h2 className="dialog-title">{isRegister ? 'Register Account' : 'Login to zozii'}</h2>
          <button type="button" className="dialog-close-x" onClick={onClose} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2.2 2.2l7.6 7.6M9.8 2.2l-7.6 7.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form className="auth-dialog-form" onSubmit={handleSubmit}>
          {isRegister ? (
            <>
              <div className="auth-input-group">
                <label className="auth-label">Email</label>
                <input
                  type="email"
                  className="auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  autoComplete="email"
                />
              </div>
              <div className="auth-input-group">
                <label className="auth-label">Name (optional)</label>
                <input
                  type="text"
                  className="auth-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                />
              </div>
            </>
          ) : (
            <div className="auth-input-group">
              <label className="auth-label">Email or username</label>
              <input
                type="text"
                className="auth-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your email"
                autoComplete="username"
              />
            </div>
          )}

          <div className="auth-input-group">
            <label className="auth-label">Password</label>
            <input
              type="password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </div>

          {isRegister && (
            <>
              <div className="auth-input-group">
                <label className="auth-label">Confirm Password</label>
                <input
                  type="password"
                  className="auth-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                />
              </div>
              <p className="auth-hint" style={{ margin: 0 }}>
                New accounts start with a <strong>free 10-minute / 10-question trial</strong> — start using it right away!
              </p>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-button" disabled={busy}>
            {busy ? 'Please wait…' : isRegister ? 'Register' : 'Login'}
          </button>

          <button
            type="button"
            className="auth-toggle-link"
            disabled={busy}
            onClick={() => {
              setIsRegister(!isRegister)
              setError('')
            }}
          >
            {isRegister ? 'Already have an account? Login' : "Don't have an account? Register"}
          </button>

          <button
            type="button"
            className="auth-toggle-link"
            style={{ marginTop: '8px', opacity: 0.85, fontSize: '12px' }}
            onClick={() => void window.zozii?.openExternal('https://zozii-iota.vercel.app/')}
          >
            🌐 Visit ZOZII Website (zozii-iota.vercel.app)
          </button>
        </form>
      </div>
    </div>
  )
}

interface AccessStatusModalProps {
  open: boolean
  message: string
  onClose: () => void
}

function AccessStatusModal({ open, message, onClose }: AccessStatusModalProps): React.JSX.Element | null {
  if (!open) return null

  return (
    <div className="dialog-backdrop">
      <div className="dialog" style={{ textAlign: 'center', padding: '24px 20px', position: 'relative' }}>
        <div className="dialog-header">
          <h2 className="dialog-title" style={{ color: 'var(--danger)', width: '100%' }}>
            Access Restricted
          </h2>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '8px 0 16px' }}>
          {message}
        </p>

        <button type="button" className="auth-button" onClick={onClose}>
          Logout
        </button>
      </div>
    </div>
  )
}

interface PlanRequestModalProps {
  open: boolean
  onClose: () => void
}

const PLAN_REQUEST_PRESETS = [
  { label: '5 minutes', minutes: 5 },
  { label: '10 minutes', minutes: 10 },
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
]

function PlanRequestModal({ open, onClose }: PlanRequestModalProps): React.JSX.Element | null {
  const [selected, setSelected] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastOpen, setLastOpen] = useState(open)

  useEffect(() => {
    if (open && !lastOpen) {
      setSelected(null)
      setCustom('')
      setSent(false)
      setBusy(false)
      setError('')
    }
    setLastOpen(open)
  }, [open, lastOpen])

  if (!open) return null

  const customMinutes = Number(custom)
  const activePreset = selected != null
    ? PLAN_REQUEST_PRESETS.find((p) => p.minutes === selected)?.minutes ?? null
    : null

  const handleSend = (): void => {
    const minutes = activePreset ?? customMinutes
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError('Please choose a duration or enter a custom amount.')
      return
    }
    setBusy(true)
    setError('')
    void backendSendPlanRequest(minutes).then(
      (res) => {
        if (!res.ok) {
          setError(res.error ?? 'Request failed. Please try again.')
          setBusy(false)
          return
        }
        setSent(true)
        setBusy(false)
      },
      () => {
        setError('Request failed. Please try again.')
        setBusy(false)
      },
    )
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <div className="dialog-header">
          <h2 className="dialog-title">Get More Access</h2>
          <button type="button" className="dialog-close-x" onClick={onClose} aria-label="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2.2 2.2l7.6 7.6M9.8 2.2l-7.6 7.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '8px 4px 4px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', margin: '0 0 16px' }}>
              <strong style={{ color: 'var(--accent)' }}>Request sent!</strong>
              <br />
              Your admin has been notified and will grant your time shortly.
            </p>
            <button type="button" className="auth-button" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="auth-hint" style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.55', margin: '0 0 14px' }}>
              Your free trial (5 minutes or 10 questions) is finished. No worries — pick how much
              more time you'd like and hit <strong>Send</strong>. Your admin will grant it for you.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '12px' }}>
              {PLAN_REQUEST_PRESETS.map((p) => (
                <button
                  key={p.minutes}
                  type="button"
                  className={`preset-chip${activePreset === p.minutes ? ' chip--active' : ''}`}
                  style={{ justifyContent: 'center' }}
                  onClick={() => { setSelected(p.minutes); setError('') }}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className={`preset-chip${activePreset == null && custom.length > 0 ? ' chip--active' : ''}`}
                style={{ justifyContent: 'center' }}
                onClick={() => setSelected(null)}
              >
                Custom
              </button>
            </div>

            <div className="auth-input-group">
              <label className="auth-label">Custom minutes (optional)</label>
              <input
                type="number"
                min={1}
                className="auth-input"
                placeholder="e.g. 45"
                value={custom}
                onChange={(e) => { setCustom(e.target.value); setSelected(null); setError('') }}
              />
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button type="button" className="auth-button" disabled={busy} onClick={handleSend}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
