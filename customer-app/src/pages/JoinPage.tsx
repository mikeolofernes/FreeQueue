import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import type { BranchResponse } from '../types'

const SERVICE_TYPES = ['Consultation', 'Cashier', 'New Account', 'Deposit', 'Withdrawal']

const TICKET_KEY = (branchId: string) => `fq_ticket_${branchId}`

export function JoinPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const branchId = params.get('branch') ?? ''
  const qrSig = params.get('sig') ?? ''
  const qrExp = Number(params.get('exp') ?? '0')

  const [branch, setBranch] = useState<BranchResponse | null>(null)
  const [branchError, setBranchError] = useState('')
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0])
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // If they already have an active ticket for this branch, go straight to it
  useEffect(() => {
    if (!branchId) return
    const saved = localStorage.getItem(TICKET_KEY(branchId))
    if (saved) navigate(`/ticket/${saved}`, { replace: true })
  }, [branchId, navigate])

  // Load branch info
  useEffect(() => {
    if (!branchId) return
    api.getBranch(branchId)
      .then(setBranch)
      .catch(() => setBranchError('Branch not found. Please scan the QR code again.'))
  }, [branchId])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !branchId) return
    setLoading(true)
    setError('')
    try {
      const ticket = await api.joinQueue(branchId, serviceType, name.trim(), phone.trim(), qrSig, qrExp)
      localStorage.setItem(TICKET_KEY(branchId), String(ticket.id))
      navigate(`/ticket/${ticket.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join queue. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const qrExpired = !qrSig || !qrExp || Math.floor(Date.now() / 1000) > qrExp

  if (qrExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-5xl mb-4">⏱</div>
          <p className="text-gray-700 font-semibold text-lg">QR Code Expired</p>
          <p className="text-gray-400 text-sm mt-2">Please ask staff to show the QR code again.</p>
        </div>
      </div>
    )
  }

  if (!branchId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-5xl mb-4">📵</div>
          <p className="text-gray-600 font-medium">No branch selected.</p>
          <p className="text-gray-400 text-sm mt-1">Please scan the QR code at the branch.</p>
        </div>
      </div>
    )
  }

  if (branchError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-5xl mb-4">😕</div>
          <p className="text-gray-600 font-medium">{branchError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-sm mx-auto">
      {/* Header */}
      <div className="bg-teal-brand text-white px-6 pt-12 pb-8">
        <p className="text-teal-light text-sm font-medium mb-1">Welcome to</p>
        <h1 className="text-2xl font-bold">{branch?.name ?? branchId}</h1>
        {branch?.address && <p className="text-teal-light text-sm mt-1">{branch.address}</p>}
      </div>

      <form onSubmit={handleJoin} className="flex-1 flex flex-col px-6 py-6 gap-6">
        {/* Service type */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">What do you need?</label>
          <div className="grid grid-cols-2 gap-2">
            {SERVICE_TYPES.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setServiceType(s)}
                className={`py-3 px-4 rounded-xl text-sm font-medium border-2 transition-colors text-left ${
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
          <label className="block text-sm font-semibold text-gray-700 mb-2">Your name</label>
          <input
            className="w-full border-2 border-gray-200 focus:border-teal-brand rounded-xl px-4 py-3 text-gray-900 outline-none transition-colors"
            placeholder="Juan dela Cruz"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            autoFocus
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Phone number <span className="text-gray-400 font-normal">(for notifications)</span>
          </label>
          <input
            className="w-full border-2 border-gray-200 focus:border-teal-brand rounded-xl px-4 py-3 text-gray-900 outline-none transition-colors"
            placeholder="09XX XXX XXXX"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
        )}

        <div className="mt-auto">
          <button
            type="submit"
            disabled={!name.trim() || loading}
            className="w-full py-4 rounded-2xl bg-teal-brand hover:bg-teal-dark disabled:opacity-40 text-white text-lg font-bold shadow-md transition-all active:scale-95"
          >
            {loading ? 'Getting your number…' : 'Get My Queue Number'}
          </button>
          <p className="text-center text-xs text-gray-400 mt-3">
            You can step away and come back — we'll hold your spot.
          </p>
        </div>
      </form>
    </div>
  )
}
