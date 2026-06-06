import { QRCodeSVG } from 'qrcode.react'

interface Props {
  branchId: string
  branchName: string
  onClose: () => void
}

const CUSTOMER_BASE = import.meta.env.VITE_CUSTOMER_URL ?? 'http://localhost:3001'

export function QRModal({ branchId, branchName, onClose }: Props) {
  const url = `${CUSTOMER_BASE}/join?branch=${encodeURIComponent(branchId)}`

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center space-y-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Customer QR Code</h2>
          <p className="text-sm text-gray-400 mt-1">{branchName}</p>
        </div>

        <div className="flex justify-center p-4 bg-gray-50 rounded-2xl">
          <QRCodeSVG
            value={url}
            size={220}
            fgColor="#0D7377"
            bgColor="#F9FAFB"
            level="M"
            includeMargin={false}
          />
        </div>

        <div className="bg-teal-brand/10 rounded-xl px-4 py-3">
          <p className="text-xs text-teal-dark font-medium break-all">{url}</p>
        </div>

        <p className="text-xs text-gray-400">
          Print or display this QR code at your counter.<br />
          Customers scan it to join the queue — no app install needed.
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
