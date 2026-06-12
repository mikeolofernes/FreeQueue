import { useState, useEffect, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../api'

interface Props {
  branchId: string
  branchName: string
  onClose: () => void
}

const TTL = 120 // seconds the token lives

export function QRModal({ branchId, branchName, onClose }: Props) {
  const [token, setToken] = useState<{ exp: number; sig: string } | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(TTL)
  const [error, setError] = useState('')

  const fetchToken = useCallback(async () => {
    try {
      const t = await api.getQrToken(branchId)
      setToken(t)
      setSecondsLeft(TTL)
      setError('')
    } catch {
      setError('Could not generate QR token.')
    }
  }, [branchId])

  // Fetch on mount
  useEffect(() => { fetchToken() }, [fetchToken])

  // Countdown + auto-refresh
  useEffect(() => {
    if (!token) return
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { fetchToken(); return TTL }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [token, fetchToken])

  const url = token
    ? `${window.location.origin}/join?branch=${encodeURIComponent(branchId)}&exp=${token.exp}&sig=${encodeURIComponent(token.sig)}`
    : ''

  const pct = secondsLeft / TTL
  const ring = 2 * Math.PI * 18
  const dash = ring * pct

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center space-y-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Customer QR Code</h2>
          <p className="text-sm text-gray-400 mt-1">{branchName}</p>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {token && (
          <>
            <div className="relative flex justify-center p-4 bg-gray-50 rounded-2xl">
              <QRCodeSVG value={url} size={220} fgColor="#0D7377" bgColor="#F9FAFB" level="M" includeMargin={false} />
              {/* countdown ring */}
              <svg className="absolute bottom-3 right-3 w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                <circle
                  cx="20" cy="20" r="18" fill="none"
                  stroke={secondsLeft <= 20 ? '#ef4444' : '#0D7377'}
                  strokeWidth="3"
                  strokeDasharray={`${dash} ${ring}`}
                  strokeLinecap="round"
                />
                <text x="20" y="24" textAnchor="middle" fontSize="11"
                  fill={secondsLeft <= 20 ? '#ef4444' : '#374151'}
                  style={{ transform: 'rotate(90deg)', transformOrigin: '20px 20px' }}>
                  {secondsLeft}
                </text>
              </svg>
            </div>

            <p className="text-xs text-gray-400">
              {secondsLeft <= 20
                ? 'Refreshing soon — have customer scan now'
                : 'QR refreshes every 2 min. Photographed codes expire.'}
            </p>
          </>
        )}

        {!token && !error && (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-teal-brand border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <button onClick={onClose} className="w-full py-3 bg-teal-brand text-white font-semibold rounded-xl hover:bg-teal-dark transition-colors">
          Done
        </button>
      </div>
    </div>
  )
}
