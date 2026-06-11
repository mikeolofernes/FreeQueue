import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../api'
import { getServiceTypes } from '../serviceTypes'
import type { BranchResponse, QueueStatus } from '../types'

const QR_RESET_SECS    = 30  // auto-reset after QR is shown
const FORM_IDLE_SECS   = 60  // idle on form before warning
const FORM_WARN_SECS   = 10  // countdown after warning before reset
const STATUS_POLL_MS   = 15_000

const TICKET_BASE = import.meta.env.VITE_CUSTOMER_URL
  ?? (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : '')

type Screen = 'idle' | 'form' | 'qr'

// Calls onIdle after `ms` of no user interaction. Resets on any touch/mouse/key.
function useIdleReset(ms: number, onIdle: () => void, active: boolean) {
  const cb = useRef(onIdle)
  cb.current = onIdle
  useEffect(() => {
    if (!active) return
    let id: ReturnType<typeof setTimeout>
    const reset = () => { clearTimeout(id); id = setTimeout(() => cb.current(), ms) }
    const events = ['touchstart', 'mousemove', 'keydown', 'click'] as const
    events.forEach(e => window.addEventListener(e, reset))
    reset()
    return () => { clearTimeout(id); events.forEach(e => window.removeEventListener(e, reset)) }
  }, [ms, active])
}

export function KioskPage() {
  const [params] = useSearchParams()
  const branchId = params.get('branch') ?? ''

  const [branch, setBranch] = useState<BranchResponse | null>(null)
  const [status, setStatus] = useState<QueueStatus | null>(null)

  const [screen, setScreen]     = useState<Screen>('idle')
  const [serviceType, setServiceType] = useState('')
  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const [ticketNumber, setTicketNumber] = useState<number | null>(null)
  const [ticketId, setTicketId]         = useState<number | null>(null)
  const [qrSecondsLeft, setQrSecondsLeft] = useState(QR_RESET_SECS)
  const [scanned, setScanned]           = useState(false)

  // Form idle warning state
  const [formWarnCountdown, setFormWarnCountdown] = useState(0)

  // ── Data fetching ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!branchId) return
    api.getBranch(branchId)
      .then(b => { setBranch(b); setServiceType(getServiceTypes(b.category)[0]) })
      .catch(() => {})
  }, [branchId])

  const pollStatus = useCallback(async () => {
    if (!branchId) return
    try { setStatus(await api.getStatus(branchId)) } catch { /* keep stale */ }
  }, [branchId])

  useEffect(() => {
    pollStatus()
    const id = setInterval(pollStatus, STATUS_POLL_MS)
    return () => clearInterval(id)
  }, [pollStatus])

  // ── Reset helpers ────────────────────────────────────────────────────────────

  const goIdle = useCallback(() => {
    setScreen('idle')
    setName('')
    setPhone('')
    setServiceType(getServiceTypes(branch?.category)[0])
    setError('')
    setTicketNumber(null)
    setTicketId(null)
    setFormWarnCountdown(0)
    setScanned(false)
  }, [branch])

  // ── QR countdown ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (screen !== 'qr') return
    setQrSecondsLeft(QR_RESET_SECS)
    const id = setInterval(() => {
      setQrSecondsLeft(s => { if (s <= 1) { goIdle(); return QR_RESET_SECS } return s - 1 })
    }, 1000)
    return () => clearInterval(id)
  }, [screen, goIdle])

  // ── Scan detection — poll ticket until viewedAt is set ───────────────────────

  useEffect(() => {
    if (screen !== 'qr' || ticketId === null || scanned) return
    const id = setInterval(async () => {
      try {
        const t = await api.getTicket(ticketId)
        if (t.viewedAt) {
          setScanned(true)
          setTimeout(goIdle, 3000) // show confirmation for 3s then reset
        }
      } catch { /* ignore */ }
    }, 2000)
    return () => clearInterval(id)
  }, [screen, ticketId, scanned, goIdle])

  // ── Form idle detection ──────────────────────────────────────────────────────

  const startFormWarn = useCallback(() => {
    if (screen !== 'form') return
    setFormWarnCountdown(FORM_WARN_SECS)
  }, [screen])

  useIdleReset(FORM_IDLE_SECS * 1000, startFormWarn, screen === 'form' && formWarnCountdown === 0)

  useEffect(() => {
    if (formWarnCountdown <= 0) return
    const id = setInterval(() => {
      setFormWarnCountdown(s => {
        if (s <= 1) { goIdle(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [formWarnCountdown, goIdle])

  // ── Submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !branchId) return
    setFormWarnCountdown(0)
    setLoading(true)
    setError('')
    try {
      const ticket = await api.joinQueue(branchId, serviceType, name.trim(), phone.trim())
      setTicketNumber(ticket.ticketNumber)
      setTicketId(ticket.id)
      setScreen('qr')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join queue. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Error / unconfigured ─────────────────────────────────────────────────────

  if (!branchId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-gray-50">
        <div>
          <p className="text-gray-500 text-lg">Kiosk not configured.</p>
          <p className="text-gray-400 text-sm mt-1">Please contact staff.</p>
        </div>
      </div>
    )
  }

  // ── QR screen ────────────────────────────────────────────────────────────────

  if (screen === 'qr' && ticketNumber !== null && ticketId !== null) {
    const ticketUrl = `${TICKET_BASE}/ticket/${ticketId}`

    // ── Scanned confirmation ──────────────────────────────────────────────────
    if (scanned) {
      return (
        <div className="min-h-screen bg-teal-brand flex flex-col items-center justify-center p-8 text-white text-center">
          <div className="text-8xl mb-6">✅</div>
          <h2 className="text-3xl font-black mb-2">QR Scanned!</h2>
          <p className="text-teal-light text-lg">Queue #{ticketNumber} confirmed on your phone.</p>
          <p className="text-teal-light text-sm mt-1">Head to the waiting area — we'll notify you when it's your turn.</p>
          <p className="text-white/50 text-xs mt-8">Resetting for next customer…</p>
        </div>
      )
    }

    // ── QR display ────────────────────────────────────────────────────────────
    return (
      <div className="min-h-screen bg-teal-brand flex flex-col items-center justify-center p-8 text-white text-center">
        <p className="text-teal-light text-lg font-medium mb-1">You're in line at</p>
        <h1 className="text-2xl font-bold mb-8">{branch?.name ?? branchId}</h1>

        <div className="bg-white rounded-3xl p-8 w-full max-w-sm space-y-6 text-gray-900">
          <div>
            <p className="text-sm text-gray-400 font-medium uppercase tracking-wide">Your Queue Number</p>
            <p className="text-8xl font-black text-teal-brand leading-none mt-1">{ticketNumber}</p>
            <p className="text-sm text-gray-500 mt-2">{serviceType} · {name}</p>
          </div>

          <div className="flex justify-center p-3 bg-gray-50 rounded-2xl">
            <QRCodeSVG value={ticketUrl} size={180} fgColor="#0D7377" bgColor="#F9FAFB" level="M" includeMargin={false} />
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-700">Scan with your phone</p>
            <p className="text-xs text-gray-400 mt-0.5">Track your queue status in real time</p>
          </div>

          {/* Countdown bar */}
          <div className="space-y-1">
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-teal-brand h-1.5 rounded-full transition-all duration-1000"
                style={{ width: `${(qrSecondsLeft / QR_RESET_SECS) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">Auto-resets in {qrSecondsLeft}s</p>
          </div>

          <button
            onClick={goIdle}
            className="w-full py-4 bg-teal-brand text-white font-bold text-lg rounded-2xl hover:bg-teal-dark transition-colors active:scale-95"
          >
            Done — Next Customer
          </button>
        </div>
      </div>
    )
  }

  // ── Idle / attract screen ─────────────────────────────────────────────────────

  if (screen === 'idle') {
    return (
      <div
        className="min-h-screen bg-teal-brand flex flex-col items-center justify-center p-10 text-white text-center cursor-pointer select-none"
        onClick={() => setScreen('form')}
      >
        <div className="mb-10">
          <p className="text-teal-light text-base font-medium mb-2 uppercase tracking-widest">Welcome to</p>
          <h1 className="text-4xl font-black">{branch?.name ?? branchId}</h1>
          {branch?.address && <p className="text-teal-light text-sm mt-2">{branch.address}</p>}
        </div>

        {/* Live queue stats */}
        {status && (
          <div className="flex gap-10 mb-12">
            <div className="text-center">
              <p className="text-5xl font-black">{status.peopleWaiting}</p>
              <p className="text-teal-light text-sm mt-1">{status.peopleWaiting === 1 ? 'person' : 'people'} waiting</p>
            </div>
            {status.waitEstimate && (
              <div className="text-center">
                <p className="text-5xl font-black">~{status.waitEstimate.estimatedMinutes}</p>
                <p className="text-teal-light text-sm mt-1">min estimated wait</p>
              </div>
            )}
          </div>
        )}

        <div className="bg-white/20 rounded-3xl px-10 py-6 animate-pulse">
          <p className="text-2xl font-bold">Touch anywhere to begin</p>
        </div>
      </div>
    )
  }

  // ── Form screen ───────────────────────────────────────────────────────────────

  const serviceTypes = getServiceTypes(branch?.category)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto relative">
      {/* Form idle warning overlay */}
      {formWarnCountdown > 0 && (
        <div
          className="absolute inset-0 bg-black/60 z-50 flex flex-col items-center justify-center text-white text-center p-8"
          onClick={() => setFormWarnCountdown(0)}
        >
          <p className="text-2xl font-bold mb-2">Still there?</p>
          <p className="text-gray-300 mb-6">Resetting in {formWarnCountdown}s</p>
          <button
            onClick={e => { e.stopPropagation(); setFormWarnCountdown(0) }}
            className="bg-teal-brand px-8 py-3 rounded-2xl font-bold text-lg"
          >
            Yes, I'm here
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-teal-brand text-white px-8 pt-12 pb-8">
        <p className="text-teal-light text-base font-medium mb-1">Welcome to</p>
        <h1 className="text-3xl font-bold">{branch?.name ?? branchId}</h1>
        {branch?.address && <p className="text-teal-light text-sm mt-1">{branch.address}</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-8 py-8 gap-8">
        <div>
          <label className="block text-base font-semibold text-gray-700 mb-4">What do you need today?</label>
          <div className="grid grid-cols-2 gap-3">
            {serviceTypes.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setServiceType(s)}
                className={`py-4 px-5 rounded-2xl text-base font-medium border-2 transition-colors text-left ${
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
          <label className="block text-base font-semibold text-gray-700 mb-2">Your name</label>
          <input
            className="w-full border-2 border-gray-200 focus:border-teal-brand rounded-2xl px-5 py-4 text-xl text-gray-900 outline-none transition-colors"
            placeholder="Juan dela Cruz"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            autoComplete="off"
          />
        </div>

        <div>
          <label className="block text-base font-semibold text-gray-700 mb-2">
            Phone number <span className="text-gray-400 font-normal">(optional · get a text when called)</span>
          </label>
          <input
            className="w-full border-2 border-gray-200 focus:border-teal-brand rounded-2xl px-5 py-4 text-xl text-gray-900 outline-none transition-colors"
            placeholder="09XX XXX XXXX"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            autoComplete="off"
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-base rounded-2xl px-5 py-4">{error}</div>
        )}

        <div className="mt-auto">
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="w-full py-5 rounded-2xl bg-teal-brand hover:bg-teal-dark disabled:opacity-40 text-white text-xl font-bold shadow-md transition-all active:scale-95"
          >
            {loading ? 'Getting your number…' : 'Get My Queue Number'}
          </button>
        </div>
      </form>
    </div>
  )
}
