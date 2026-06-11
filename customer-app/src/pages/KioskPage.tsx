import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../api'
import { getServiceTypes } from '../serviceTypes'
import type { BranchResponse } from '../types'

const RESET_SECS = 30

const TICKET_BASE = import.meta.env.VITE_CUSTOMER_URL
  ?? (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : '')

type Screen = 'form' | 'qr'

export function KioskPage() {
  const [params] = useSearchParams()
  const branchId = params.get('branch') ?? ''

  const [branch, setBranch] = useState<BranchResponse | null>(null)
  const [branchError, setBranchError] = useState('')

  const serviceTypes = getServiceTypes(branch?.category)

  const [screen, setScreen] = useState<Screen>('form')
  const [serviceType, setServiceType] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [ticketNumber, setTicketNumber] = useState<number | null>(null)
  const [ticketId, setTicketId] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(RESET_SECS)

  useEffect(() => {
    if (!branchId) return
    api.getBranch(branchId)
      .then(b => { setBranch(b); setServiceType(getServiceTypes(b.category)[0]) })
      .catch(() => setBranchError('Branch not found.'))
  }, [branchId])

  const reset = useCallback(() => {
    setScreen('form')
    setName('')
    setPhone('')
    setServiceType(getServiceTypes(branch?.category)[0])
    setError('')
    setTicketNumber(null)
    setTicketId(null)
    setSecondsLeft(RESET_SECS)
  }, [branch])

  // Countdown when QR is showing
  useEffect(() => {
    if (screen !== 'qr') return
    setSecondsLeft(RESET_SECS)
    const id = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) { reset(); return RESET_SECS }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [screen, reset])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !branchId) return
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

  if (!branchId || branchError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center bg-gray-50">
        <div>
          <p className="text-gray-500 text-lg">Kiosk not configured.</p>
          <p className="text-gray-400 text-sm mt-1">Please contact staff.</p>
        </div>
      </div>
    )
  }

  if (screen === 'qr' && ticketNumber !== null && ticketId !== null) {
    const ticketUrl = `${TICKET_BASE}/ticket/${ticketId}`
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
            <QRCodeSVG
              value={ticketUrl}
              size={180}
              fgColor="#0D7377"
              bgColor="#F9FAFB"
              level="M"
              includeMargin={false}
            />
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
                style={{ width: `${(secondsLeft / RESET_SECS) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">Resetting in {secondsLeft}s</p>
          </div>

          <button
            onClick={reset}
            className="w-full py-3 bg-gray-100 text-gray-600 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-teal-brand text-white px-8 pt-12 pb-8">
        <p className="text-teal-light text-base font-medium mb-1">Welcome to</p>
        <h1 className="text-3xl font-bold">{branch?.name ?? branchId}</h1>
        {branch?.address && <p className="text-teal-light text-sm mt-1">{branch.address}</p>}
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-8 py-8 gap-8">
        {/* Service type */}
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

        {/* Name */}
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

        {/* Phone */}
        <div>
          <label className="block text-base font-semibold text-gray-700 mb-2">
            Phone number <span className="text-gray-400 font-normal">(optional)</span>
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
