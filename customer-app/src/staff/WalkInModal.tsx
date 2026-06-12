import { useState } from 'react'

const SERVICE_TYPES = ['Consultation', 'Cashier', 'New Account', 'Deposit', 'Withdrawal', 'Other']

interface Props {
  onConfirm: (serviceType: string, customerName?: string) => void
  onCancel: () => void
}

export function WalkInModal({ onConfirm, onCancel }: Props) {
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0])
  const [custom, setCustom] = useState('')
  const [name, setName] = useState('')

  const finalService = serviceType === 'Other' ? custom : serviceType

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">Add Walk-in</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Service type</label>
          <div className="grid grid-cols-3 gap-2">
            {SERVICE_TYPES.map(s => (
              <button
                key={s}
                onClick={() => setServiceType(s)}
                className={`py-2 px-3 rounded-xl text-sm font-medium border transition-colors ${
                  serviceType === s
                    ? 'bg-teal-brand text-white border-teal-brand'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-teal-brand'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {serviceType === 'Other' && (
            <input
              className="mt-2 w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand"
              placeholder="Service type"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              autoFocus
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer name <span className="text-gray-400">(optional)</span></label>
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand"
            placeholder="Walk-in"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(finalService, name || undefined)}
            disabled={!finalService.trim()}
            className="flex-1 py-3 rounded-xl bg-teal-brand hover:bg-teal-dark disabled:opacity-40 text-white font-semibold transition-colors"
          >
            Add to Queue
          </button>
        </div>
      </div>
    </div>
  )
}
