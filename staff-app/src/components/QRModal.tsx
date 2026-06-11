import { QRCodeSVG } from 'qrcode.react'
import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

interface Props {
  branchId: string
  branchName: string
  onClose: () => void
}

const CUSTOMER_BASE = import.meta.env.VITE_CUSTOMER_URL
  ?? `http://${window.location.hostname}:3001`

const REFRESH_SECS = 60

export function QRModal({ branchId, branchName, onClose }: Props) {
  const [token, setToken] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(REFRESH_SECS)
  const [loading, setLoading] = useState(true)

  const fetchToken = useCallback(async () => {
    setLoading(true)
    try {
      const { token: t } = await api.generateQrToken()
      setToken(t)
      setSecondsLeft(REFRESH_SECS)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch token on open
  useEffect(() => { fetchToken() }, [fetchToken])

  // Count down every second while not loading
  useEffect(() => {
    if (loading || !token) return
    const id = setInterval(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearInterval(id)
  }, [loading, token])

  // Refresh when countdown hits 0
  useEffect(() => {
    if (secondsLeft <= 0) fetchToken()
  }, [secondsLeft, fetchToken])

  const url = token
    ? `${CUSTOMER_BASE}/join?branch=${encodeURIComponent(branchId)}&qrt=${token}`
    : null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center space-y-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Customer QR Code</h2>
          <p className="text-sm text-gray-400 mt-1">{branchName}</p>
        </div>

        <div className="flex justify-center p-4 bg-gray-50 rounded-2xl">
          {loading || !url ? (
            <div className="w-[220px] h-[220px] flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-teal-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <QRCodeSVG
              value={url}
              size={220}
              fgColor="#0D7377"
              bgColor="#F9FAFB"
              level="M"
              includeMargin={false}
            />
          )}
        </div>

        {/* Countdown bar */}
        <div className="space-y-1">
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-teal-brand h-1.5 rounded-full transition-all duration-1000"
              style={{ width: `${Math.max(0, (secondsLeft / REFRESH_SECS) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">
            {loading
              ? 'Generating new QR…'
              : <>Refreshes in <span className="font-semibold text-teal-dark">{secondsLeft}s</span></>
            }
          </p>
        </div>

        <p className="text-xs text-gray-400">
          Each scan is single-use. The QR auto-refreshes every {REFRESH_SECS}s — keep this screen visible at the counter.
        </p>

        <button
          onClick={onClose}
          className="w-full py-3 bg-teal-brand text-white font-semibold rounded-xl hover:bg-teal-dark transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  )
}
