import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import * as signalR from '@microsoft/signalr'
import { api } from '../api'
import type { TicketResponse, QueueStatus, BranchService } from '../types'

function kioskPinKey(branchId: string) { return `fq_kiosk_pin_${branchId}` }

const HUB_URL = `${window.location.origin}/hubs/queue`
const RESET_SECS = 30
const FORM_IDLE_SECS = 60
const FORM_WARN_SECS = 10
const STATUS_POLL_MS = 30_000

type Screen = 'pin' | 'idle' | 'form' | 'ticket' | 'scanned' | 'csat' | 'closed' | 'served'

export function KioskPage() {
  const [params] = useSearchParams()
  const branchId = params.get('branch') ?? ''

  const storedPin = branchId ? localStorage.getItem(kioskPinKey(branchId)) : null
  const [screen, setScreen] = useState<Screen>(storedPin ? 'idle' : 'pin')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [hasKioskPin, setHasKioskPin] = useState(!!storedPin)
  const [kioskPin, setKioskPin] = useState<string | null>(storedPin)
  const [services, setServices] = useState<BranchService[]>([])
  const [serviceType, setServiceType] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ticket, setTicket] = useState<TicketResponse | null>(null)
  const [countdown, setCountdown] = useState(RESET_SECS)
  const [formIdleCount, setFormIdleCount] = useState(FORM_IDLE_SECS)
  const [branchStatus, setBranchStatus] = useState<QueueStatus | null>(null)
  const connRef = useRef<signalR.HubConnection | null>(null)
  const formTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load services and check branch status
  useEffect(() => {
    if (!branchId) return
    api.getServices(branchId)
      .then(s => {
        setServices(s)
        if (s.length > 0) setServiceType(s[0].name)
      })
      .catch(() => {})

    if (storedPin) return
    api.getBranch(branchId)
      .then(b => {
        setHasKioskPin(b.hasKioskPin)
        if (!b.isOpen) setScreen('closed')
        // Always stay on PIN screen — never auto-bypass to idle
      })
      .catch(() => {})
  }, [branchId]) // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setTicket(null)
    setScreen('idle')
    setName('')
    setPhone('')
    setError('')
    if (formTimerRef.current) { clearInterval(formTimerRef.current); formTimerRef.current = null }
  }

  const resetFormTimer = useCallback(() => {
    if (formTimerRef.current) clearInterval(formTimerRef.current)
    setFormIdleCount(FORM_IDLE_SECS)
    formTimerRef.current = setInterval(() => {
      setFormIdleCount(prev => {
        if (prev <= 1) { reset(); return FORM_IDLE_SECS }
        return prev - 1
      })
    }, 1000)
  }, [])

  // Live queue stats
  useEffect(() => {
    if (!branchId) return
    const poll = () => api.getStatusPublic(branchId).then(s => {
      setBranchStatus(s)
      if (!s.isOpen && screen === 'idle') setScreen('closed')
      if (s.isOpen && screen === 'closed') setScreen('idle')
    }).catch(() => {})
    poll()
    const t = setInterval(poll, STATUS_POLL_MS)
    return () => clearInterval(t)
  }, [branchId, screen])

  // Ticket countdown
  useEffect(() => {
    if (screen !== 'ticket') return
    setCountdown(RESET_SECS)
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { reset(); return RESET_SECS }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [screen])

  // SignalR per-ticket
  useEffect(() => {
    if (!ticket) return
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL).withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None).build()
    conn.on('TicketScanned', () => {
      setScreen('scanned')
      setTimeout(() => setScreen('csat'), 1500)
    })
    conn.onreconnected(() => { conn.invoke('JoinTicket', ticket.id).catch(() => {}) })
    conn.start().then(() => conn.invoke('JoinTicket', ticket.id)).catch(() => {})
    connRef.current = conn
    return () => { conn.stop(); connRef.current = null }
  }, [ticket])

  // CSAT auto-dismiss
  useEffect(() => {
    if (screen !== 'csat') return
    const t = setTimeout(reset, 8000)
    return () => clearTimeout(t)
  }, [screen])

  // Poll ticket status while showing ticket screen — transition to 'served' when done
  useEffect(() => {
    if (screen !== 'ticket' || !ticket) return
    const poll = setInterval(async () => {
      try {
        const t = await api.getTicket(ticket.id)
        if (t.status === 'served') setScreen('served')
      } catch { /* ignore */ }
    }, 4000)
    return () => clearInterval(poll)
  }, [screen, ticket])

  // Form inactivity
  useEffect(() => {
    if (screen !== 'form') {
      if (formTimerRef.current) { clearInterval(formTimerRef.current); formTimerRef.current = null }
      return
    }
    resetFormTimer()
    return () => { if (formTimerRef.current) { clearInterval(formTimerRef.current); formTimerRef.current = null } }
  }, [screen, resetFormTimer])

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault()
    const pin = pinInput.trim()
    if (!pin) return
    setLoading(true)
    setPinError('')
    try {
      await api.verifyKioskPin(branchId, pin)
      localStorage.setItem(kioskPinKey(branchId), pin)
      setKioskPin(pin)
      setScreen('idle')
    } catch {
      setPinError('Incorrect PIN. Please try again.')
      setPinInput('')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !branchId) return
    setLoading(true)
    setError('')
    try {
      const t = await api.kioskJoin(branchId, serviceType, name.trim(), phone.trim(), kioskPin ?? undefined)
      setTicket(t)
      setScreen('ticket')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not join queue. Try again.'
      if (msg.toLowerCase().includes('invalid kiosk pin') || msg.includes('401')) {
        localStorage.removeItem(kioskPinKey(branchId))
        setKioskPin(null)
        setScreen('pin')
        setPinError('Incorrect PIN. Please try again.')
        setPinInput('')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handlePhoneLookup() {
    if (!phone.trim() || name.trim()) return
    try {
      const result = await api.lookupCustomer(phone.trim())
      if (result.name) setName(result.name)
    } catch { /* silent */ }
  }

  function handleRate(rating: number) {
    if (ticket) api.rateTicket(ticket.id, rating).catch(() => {})
    setTimeout(reset, 800)
  }

  if (!branchId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-gray-500 text-center">Add <code>?branch=your-branch-id</code> to the URL.</p>
      </div>
    )
  }

  // ── Queue Closed ──────────────────────────────────────────────────────────
  if (screen === 'closed') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-8 text-center gap-6">
        <div className="text-[80px]">🔴</div>
        <div>
          <p className="text-white text-4xl font-black">Queue Closed</p>
          <p className="text-gray-400 text-xl mt-3">We are not accepting new customers right now.</p>
        </div>
        {branchStatus?.waitEstimate && (
          <p className="text-gray-500 text-lg">Please come back later.</p>
        )}
      </div>
    )
  }

  // ── PIN entry ─────────────────────────────────────────────────────────────
  if (screen === 'pin') {
    if (!hasKioskPin) {
      return (
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-8 text-center gap-6">
          <div className="text-[80px]">🔒</div>
          <p className="text-white text-3xl font-bold">Kiosk Locked</p>
          <p className="text-gray-400 text-lg max-w-xs">No kiosk PIN is set for this branch. Set one in the Staff app to activate this kiosk.</p>
          <a href="/staff" className="mt-4 px-8 py-4 rounded-2xl bg-teal-brand text-white text-xl font-bold">Staff Login</a>
        </div>
      )
    }
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-8">
        <form onSubmit={handlePinSubmit} className="w-full max-w-sm flex flex-col items-center gap-8">
          <div className="text-center">
            <div className="text-[80px] mb-4">🔒</div>
            <p className="text-white text-3xl font-bold">Kiosk Locked</p>
            <p className="text-gray-400 text-lg mt-2">Enter the kiosk PIN to continue</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            className="w-full text-center text-4xl font-bold tracking-widest border-2 border-gray-600 bg-gray-800 text-white rounded-2xl px-6 py-6 outline-none focus:border-teal-brand"
            placeholder="••••"
            value={pinInput}
            onChange={e => { setPinInput(e.target.value); setPinError('') }}
            autoFocus
          />
          {pinError && <p className="text-red-400 text-lg text-center">{pinError}</p>}
          <button
            type="submit"
            disabled={!pinInput.trim() || loading}
            className="w-full py-6 rounded-2xl bg-teal-brand hover:bg-teal-dark disabled:opacity-40 text-white text-2xl font-bold transition-all"
          >
            Unlock
          </button>
        </form>
      </div>
    )
  }

  // ── Idle / Attract ────────────────────────────────────────────────────────
  if (screen === 'idle') {
    return (
      <button
        onClick={() => setScreen('form')}
        className="min-h-screen w-full bg-teal-brand flex flex-col items-center justify-center gap-10 cursor-pointer select-none"
      >
        <div className="text-center text-white">
          <p className="text-teal-light text-lg font-medium uppercase tracking-widest mb-6">{branchId}</p>
          <div className="text-8xl font-black mb-4 animate-pulse">Touch to Begin</div>
          <p className="text-teal-light text-2xl">Join the queue</p>
        </div>
        {branchStatus && (
          <div className="flex gap-16 text-center text-white mt-4">
            <div>
              <div className="text-5xl font-black">{branchStatus.peopleWaiting}</div>
              <div className="text-teal-light text-lg mt-1">Waiting now</div>
            </div>
            {branchStatus.waitEstimate && (
              <div>
                <div className="text-5xl font-black">~{branchStatus.waitEstimate.estimatedMinutes}m</div>
                <div className="text-teal-light text-lg mt-1">Est. wait</div>
              </div>
            )}
          </div>
        )}
      </button>
    )
  }

  // ── Served ────────────────────────────────────────────────────────────────
  if (screen === 'served') {
    return <KioskServedScreen ticketNumber={ticket?.ticketNumber ?? 0} onReset={reset} />
  }

  // ── CSAT ──────────────────────────────────────────────────────────────────
  if (screen === 'csat') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-10 p-8 text-center">
        <p className="text-3xl font-bold text-gray-800">How was your experience?</p>
        <div className="flex gap-10">
          {(['😐', '🙂', '😊'] as const).map((emoji, i) => (
            <button
              key={i}
              onClick={() => handleRate(i + 1)}
              className="text-[90px] hover:scale-110 active:scale-95 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>
        <p className="text-gray-400 text-lg">Auto-closing in a moment…</p>
      </div>
    )
  }

  // ── Scanned ───────────────────────────────────────────────────────────────
  if (screen === 'scanned') {
    return (
      <div className="min-h-screen bg-green-500 flex flex-col items-center justify-center p-8 text-white text-center gap-6">
        <div className="text-[120px] leading-none">✓</div>
        <p className="text-4xl font-black">QR Scanned!</p>
        <p className="text-white/80 text-xl">See you at the counter.</p>
      </div>
    )
  }

  // ── Ticket / QR ───────────────────────────────────────────────────────────
  if (screen === 'ticket' && ticket) {
    const ticketUrl = `${window.location.origin}/ticket/${ticket.id}${ticket.viewToken ? `?vt=${ticket.viewToken}` : ''}`
    return (
      <div className="min-h-screen bg-teal-brand flex flex-col items-center justify-center p-8 text-white text-center gap-6">
        <p className="text-teal-light text-xl font-medium tracking-wide uppercase">Your Queue Number</p>
        <div className="text-[140px] font-black leading-none">{ticket.ticketNumber}</div>
        {ticket.priority && <span className="px-4 py-1 bg-amber-400 text-amber-900 rounded-full text-lg font-bold">⚡ Priority</span>}
        <p className="text-teal-light text-xl">{ticket.serviceType}&nbsp;·&nbsp;{ticket.customerName}</p>
        <div className="bg-white rounded-2xl p-6">
          <QRCodeSVG value={ticketUrl} size={200} fgColor="#0D7377" bgColor="#ffffff" level="M" />
          <p className="text-teal-dark text-base font-semibold mt-4">Scan to track on your phone</p>
        </div>
        {ticket.waitEstimate && (
          <p className="text-teal-light text-xl">Est. wait: ~{ticket.waitEstimate.estimatedMinutes} min</p>
        )}
        <div className="w-full max-w-sm">
          <div className="h-2 bg-teal-dark/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-1000"
              style={{ width: `${(countdown / RESET_SECS) * 100}%` }}
            />
          </div>
          <p className="text-teal-light text-base mt-2">Resetting in {countdown}s</p>
        </div>
        <button onClick={reset} className="px-10 py-4 bg-white/20 hover:bg-white/30 text-white font-semibold rounded-2xl text-lg transition-colors">
          Done
        </button>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  const showWarning = formIdleCount <= FORM_WARN_SECS

  return (
    <div
      className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto relative"
      onMouseMove={resetFormTimer}
      onTouchStart={resetFormTimer}
      onKeyDown={resetFormTimer}
    >
      {showWarning && (
        <div className="absolute inset-0 bg-gray-900/70 z-50 flex flex-col items-center justify-center gap-6 text-white text-center">
          <p className="text-3xl font-bold">Still there?</p>
          <p className="text-8xl font-black">{formIdleCount}</p>
          <button
            onClick={resetFormTimer}
            className="mt-2 px-10 py-5 bg-teal-brand text-white font-bold text-xl rounded-2xl"
          >
            I'm still here
          </button>
        </div>
      )}

      <div className="bg-teal-brand text-white px-8 pt-12 pb-8">
        <p className="text-teal-light text-base font-medium mb-1 uppercase tracking-wide">Queue Kiosk</p>
        <h1 className="text-4xl font-bold">{branchId}</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-8 py-8 gap-8">
        <div>
          <label className="block text-lg font-semibold text-gray-700 mb-4 uppercase tracking-wide">What do you need?</label>
          <div className="grid grid-cols-2 gap-4">
            {services.map(s => (
              <button
                key={s.id} type="button"
                onClick={() => { setServiceType(s.name); resetFormTimer() }}
                className={`py-6 px-4 rounded-2xl text-xl font-semibold border-2 transition-colors min-h-[80px] ${
                  serviceType === s.name
                    ? 'bg-teal-brand text-white border-teal-brand shadow-lg scale-[1.02]'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-teal-brand active:scale-95'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-lg font-semibold text-gray-700 mb-3 uppercase tracking-wide">Your name</label>
          <input
            className="w-full border-2 border-gray-200 focus:border-teal-brand rounded-2xl px-6 py-5 text-2xl text-gray-900 outline-none transition-colors"
            placeholder="Juan dela Cruz"
            value={name}
            onChange={e => { setName(e.target.value); resetFormTimer() }}
            required autoFocus
          />
        </div>

        <div>
          <label className="block text-lg font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Phone <span className="text-gray-400 font-normal normal-case">(optional — for SMS updates)</span>
          </label>
          <input
            className="w-full border-2 border-gray-200 focus:border-teal-brand rounded-2xl px-6 py-5 text-2xl text-gray-900 outline-none transition-colors"
            placeholder="09XX XXX XXXX" type="tel"
            value={phone}
            onChange={e => { setPhone(e.target.value); resetFormTimer() }}
            onBlur={handlePhoneLookup}
          />
        </div>

        {error && <div className="bg-red-50 text-red-600 rounded-2xl px-6 py-4 text-lg">{error}</div>}

        <div className="mt-auto">
          <button
            type="submit" disabled={!name.trim() || !serviceType || loading}
            className="w-full py-7 rounded-2xl bg-teal-brand hover:bg-teal-dark disabled:opacity-40 text-white text-3xl font-bold shadow-lg transition-all active:scale-95"
          >
            {loading ? 'Getting your number…' : 'Get My Queue Number'}
          </button>
        </div>
      </form>
    </div>
  )
}

const SERVED_RESET_SECS = 8

function KioskServedScreen({ ticketNumber, onReset }: { ticketNumber: number; onReset: () => void }) {
  const [countdown, setCountdown] = useState(SERVED_RESET_SECS)

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(t); onReset(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [onReset])

  return (
    <div className="min-h-screen bg-teal-brand flex flex-col items-center justify-center p-8 text-center text-white gap-6">
      <div className="text-[100px] leading-none">🎉</div>
      <div>
        <p className="text-5xl font-black">#{ticketNumber}</p>
        <p className="text-3xl font-bold mt-2">You've been served!</p>
        <p className="text-teal-light text-xl mt-2">Thank you for your patience.</p>
      </div>
      <button
        onClick={onReset}
        className="mt-4 bg-white text-teal-brand font-bold px-12 py-5 rounded-2xl shadow-lg text-2xl"
      >
        Done
      </button>
      <p className="text-teal-light text-lg">Next customer in {countdown}s…</p>
    </div>
  )
}
