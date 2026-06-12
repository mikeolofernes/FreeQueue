import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../api'
import type { TicketResponse } from '../types'

const SERVICE_TYPES = ['Consultation', 'Cashier', 'New Account', 'Deposit', 'Withdrawal']
const RESET_SECS = 30

export function KioskPage() {
  const [params] = useSearchParams()
  const branchId = params.get('branch') ?? ''

  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ticket, setTicket] = useState<TicketResponse | null>(null)
  const [countdown, setCountdown] = useState(RESET_SECS)

  useEffect(() => {
    if (!ticket) return
    setCountdown(RESET_SECS)
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { reset(); return RESET_SECS }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [ticket])

  function reset() {
    setTicket(null)
    setServiceType(SERVICE_TYPES[0])
    setName('')
    setPhone('')
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !branchId) return
    setLoading(true)
    setError('')
    try {
      const t = await api.kioskJoin(branchId, serviceType, name.trim(), phone.trim())
      setTicket(t)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join queue. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!branchId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-gray-500 text-center">Add <code>?branch=your-branch-id</code> to the URL.</p>
      </div>
    )
  }

  if (ticket) {
    const ticketUrl = `${window.location.origin}/ticket/${ticket.id}`
    return (
      <div className="min-h-screen bg-teal-brand flex flex-col items-center justify-center p-8 text-white text-center gap-6">
        <p className="text-teal-light text-lg font-medium tracking-wide uppercase">Your Queue Number</p>

        <div className="text-[120px] font-black leading-none">{ticket.ticketNumber}</div>

        <p className="text-teal-light text-base">
          {ticket.serviceType}&nbsp;·&nbsp;{ticket.customerName}
        </p>

        <div className="bg-white rounded-2xl p-5">
          <QRCodeSVG value={ticketUrl} size={180} fgColor="#0D7377" bgColor="#ffffff" level="M" />
          <p className="text-teal-dark text-sm font-semibold mt-3">Scan to track on your phone</p>
        </div>

        {ticket.waitEstimate && (
          <p className="text-teal-light text-sm">
            Est. wait: ~{ticket.waitEstimate.estimatedMinutes} min
          </p>
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
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
                key={s} type="button" onClick={() => setServiceType(s)}
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
            value={name} onChange={e => setName(e.target.value)}
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
            value={phone} onChange={e => setPhone(e.target.value)}
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
