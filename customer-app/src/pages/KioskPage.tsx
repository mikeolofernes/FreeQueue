import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import * as signalR from '@microsoft/signalr'
import { api } from '../api'
import type { TicketResponse, QueueStatus } from '../types'

function kioskPinKey(branchId: string) { return `fq_kiosk_pin_${branchId}` }

const HUB_URL = `${window.location.origin}/hubs/queue`
const SERVICE_TYPES = ['Consultation', 'Cashier', 'New Account', 'Deposit', 'Withdrawal']
const RESET_SECS = 30
const FORM_IDLE_SECS = 60
const FORM_WARN_SECS = 10
const STATUS_POLL_MS = 30_000

type Screen = 'pin' | 'idle' | 'form' | 'ticket' | 'scanned' | 'csat'

export function KioskPage() {
  const [params] = useSearchParams()
  const branchId = params.get('branch') ?? ''

  const storedPin = branchId ? localStorage.getItem(kioskPinKey(branchId)) : null
  const [screen, setScreen] = useState<Screen>(storedPin ? 'idle' : 'pin')
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [hasKioskPin, setHasKioskPin] = useState(!!storedPin)
  const [kioskPin, setKioskPin] = useState<string | null>(storedPin)
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0])
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

  // Check if branch requires a kiosk PIN (only when we don't already have one stored)
  useEffect(() => {
    if (!branchId || storedPin) return
    api.getBranch(branchId)
      .then(b => {
        setHasKioskPin(b.hasKioskPin)
        if (!b.hasKioskPin) setScreen('idle')
      })
      .catch(() => {})
  }, [branchId]) // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setTicket(null)
    setScreen('idle')
    setServiceType(SERVICE_TYPES[0])
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

  // Live queue stats for idle attract screen
  useEffect(() => {
    if (!branchId) return
    const poll = () => api.getStatusPublic(branchId).then(setBranchStatus).catch(() => {})
    poll()
    const t = setInterval(poll, STATUS_POLL_MS)
    return () => clearInterval(t)
  }, [branchId])

  // Ticket screen countdown
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

  // SignalR per-ticket group
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

  // CSAT auto-dismiss after 8s
  useEffect(() => {
    if (screen !== 'csat') return
    const t = setTimeout(reset, 8000)
    return () => clearTimeout(t)
  }, [screen])

  // Form inactivity timer
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
      // Validate PIN by attempting a dry-run — use a probe join request won't work,
      // so we verify by checking against the API on actual join. Instead, we store
      // the PIN and let the first kiosk-join call reject it if wrong.
      // For immediate feedback: try the branch endpoint and trust the PIN attempt;
      // the join will fail with 401 if wrong.
      localStorage.setItem(kioskPinKey(branchId), pin)
      setKioskPin(pin)
      setScreen('idle')
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
        // PIN was wrong — clear stored PIN and force re-entry
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

  // ── PIN entry ─────────────────────────────────────────────────────────────
  if (screen === 'pin' && hasKioskPin) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-8">
        <form onSubmit={handlePinSubmit} className="w-full max-w-xs flex flex-col items-center gap-6">
          <div className="text-center">
            <div className="text-5xl mb-4">🔒</div>
            <p className="text-white text-2xl font-bold">Kiosk Locked</p>
            <p className="text-gray-400 text-sm mt-1">Enter the kiosk PIN to continue</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            className="w-full text-center text-3xl font-bold tracking-widest border-2 border-gray-600 bg-gray-800 text-white rounded-xl px-5 py-4 outline-none focus:border-teal-brand"
            placeholder="••••"
            value={pinInput}
            onChange={e => { setPinInput(e.target.value); setPinError('') }}
            autoFocus
          />
          {pinError && <p className="text-red-400 text-sm text-center">{pinError}</p>}
          <button
            type="submit"
            disabled={!pinInput.trim() || loading}
            className="w-full py-4 rounded-xl bg-teal-brand hover:bg-teal-dark disabled:opacity-40 text-white text-lg font-bold transition-all"
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
        className="min-h-screen w-full bg-teal-brand flex flex-col items-center justify-center gap-8 cursor-pointer select-none"
      >
        <div className="text-center text-white">
          <p className="text-teal-light text-sm font-medium uppercase tracking-widest mb-4">{branchId}</p>
          <div className="text-7xl font-black mb-2 animate-pulse">Touch to Begin</div>
          <p className="text-teal-light text-lg">Join the queue</p>
        </div>
        {branchStatus && (
          <div className="flex gap-12 text-center text-white mt-4">
            <div>
              <div className="text-4xl font-black">{branchStatus.peopleWaiting}</div>
              <div className="text-teal-light text-sm mt-1">Waiting now</div>
            </div>
            {branchStatus.waitEstimate && (
              <div>
                <div className="text-4xl font-black">~{branchStatus.waitEstimate.estimatedMinutes}m</div>
                <div className="text-teal-light text-sm mt-1">Est. wait</div>
              </div>
            )}
          </div>
        )}
      </button>
    )
  }

  // ── CSAT ──────────────────────────────────────────────────────────────────
  if (screen === 'csat') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-8 p-8 text-center">
        <p className="text-2xl font-bold text-gray-800">How was your experience?</p>
        <div className="flex gap-8">
          {(['😐', '🙂', '😊'] as const).map((emoji, i) => (
            <button
              key={i}
              onClick={() => handleRate(i + 1)}
              className="text-7xl hover:scale-110 active:scale-95 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>
        <p className="text-gray-400 text-sm">Auto-closing in a moment…</p>
      </div>
    )
  }

  // ── Scanned confirmation ──────────────────────────────────────────────────
  if (screen === 'scanned') {
    return (
      <div className="min-h-screen bg-green-500 flex flex-col items-center justify-center p-8 text-white text-center gap-6">
        <div className="text-[100px] leading-none">✓</div>
        <p className="text-3xl font-black">QR Scanned!</p>
        <p className="text-white/80 text-lg">See you at the counter.</p>
      </div>
    )
  }

  // ── Ticket / QR ───────────────────────────────────────────────────────────
  if (screen === 'ticket' && ticket) {
    const ticketUrl = `${window.location.origin}/ticket/${ticket.id}${ticket.viewToken ? `?vt=${ticket.viewToken}` : ''}`
    return (
      <div className="min-h-screen bg-teal-brand flex flex-col items-center justify-center p-8 text-white text-center gap-6">
        <p className="text-teal-light text-lg font-medium tracking-wide uppercase">Your Queue Number</p>
        <div className="text-[120px] font-black leading-none">{ticket.ticketNumber}</div>
        <p className="text-teal-light text-base">{ticket.serviceType}&nbsp;·&nbsp;{ticket.customerName}</p>
        <div className="bg-white rounded-2xl p-5">
          <QRCodeSVG value={ticketUrl} size={180} fgColor="#0D7377" bgColor="#ffffff" level="M" />
          <p className="text-teal-dark text-sm font-semibold mt-3">Scan to track on your phone</p>
        </div>
        {ticket.waitEstimate && (
          <p className="text-teal-light text-sm">Est. wait: ~{ticket.waitEstimate.estimatedMinutes} min</p>
        )}
        <div className="w-full max-w-xs">
          <div className="h-1.5 bg-teal-dark/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-1000"
              style={{ width: `${(countdown / RESET_SECS) * 100}%` }}
            />
          </div>
          <p className="text-teal-light text-xs mt-2">Resetting in {countdown}s</p>
        </div>
        <button onClick={reset} className="px-8 py-3 bg-white/20 hover:bg-white/30 text-white font-semibold rounded-xl transition-colors">
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
        <div className="absolute inset-0 bg-gray-900/70 z-50 flex flex-col items-center justify-center gap-4 text-white text-center">
          <p className="text-2xl font-bold">Still there?</p>
          <p className="text-6xl font-black">{formIdleCount}</p>
          <button
            onClick={resetFormTimer}
            className="mt-2 px-8 py-3 bg-teal-brand text-white font-semibold rounded-xl"
          >
            I'm still here
          </button>
        </div>
      )}

      <div className="bg-teal-brand text-white px-8 pt-12 pb-8">
        <p className="text-teal-light text-sm font-medium mb-1 uppercase tracking-wide">Queue Kiosk</p>
        <h1 className="text-3xl font-bold">{branchId}</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-8 py-8 gap-7">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">What do you need?</label>
          <div className="grid grid-cols-2 gap-3">
            {SERVICE_TYPES.map(s => (
              <button
                key={s} type="button"
                onClick={() => { setServiceType(s); resetFormTimer() }}
                className={`py-4 px-4 rounded-xl text-base font-semibold border-2 transition-colors ${
                  serviceType === s
                    ? 'bg-teal-brand text-white border-teal-brand'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-teal-brand'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Your name</label>
          <input
            className="w-full border-2 border-gray-200 focus:border-teal-brand rounded-xl px-5 py-4 text-xl text-gray-900 outline-none transition-colors"
            placeholder="Juan dela Cruz"
            value={name}
            onChange={e => { setName(e.target.value); resetFormTimer() }}
            required autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            Phone <span className="text-gray-400 font-normal normal-case">(optional)</span>
          </label>
          <input
            className="w-full border-2 border-gray-200 focus:border-teal-brand rounded-xl px-5 py-4 text-xl text-gray-900 outline-none transition-colors"
            placeholder="09XX XXX XXXX" type="tel"
            value={phone}
            onChange={e => { setPhone(e.target.value); resetFormTimer() }}
            onBlur={handlePhoneLookup}
          />
        </div>

        {error && <div className="bg-red-50 text-red-600 rounded-xl px-5 py-4">{error}</div>}

        <div className="mt-auto">
          <button
            type="submit" disabled={!name.trim() || loading}
            className="w-full py-5 rounded-2xl bg-teal-brand hover:bg-teal-dark disabled:opacity-40 text-white text-2xl font-bold shadow-md transition-all active:scale-95"
          >
            {loading ? 'Getting your number…' : 'Get My Queue Number'}
          </button>
        </div>
      </form>
    </div>
  )
}
