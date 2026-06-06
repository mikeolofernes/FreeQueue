import { useState } from 'react'
import { api } from '../api'

interface Props {
  onConfirm: (branchId: string, branchName: string) => void
}

export function BranchSetup({ onConfirm }: Props) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id.trim()) return

    setLoading(true)
    setError('')
    try {
      // Try to create the branch — if it already exists (409) that's fine
      await api.createBranch(id.trim(), name.trim() || id.trim()).catch((err: Error) => {
        if (!err.message.includes('409') && !err.message.toLowerCase().includes('already')) throw err
      })
      onConfirm(id.trim(), name.trim() || id.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-teal-brand flex items-center justify-center">
            <span className="text-white text-xl">Q</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">QueueFree</h1>
            <p className="text-sm text-gray-500">Staff companion</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Branch ID</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-brand"
              placeholder="e.g. bacoor-clinic-01"
              value={id}
              onChange={e => setId(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name <span className="text-gray-400">(optional)</span></label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-brand"
              placeholder="e.g. Bacoor Clinic"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={!id.trim() || loading}
            className="w-full bg-teal-brand hover:bg-teal-dark disabled:opacity-40 text-white font-semibold rounded-xl py-3 transition-colors"
          >
            {loading ? 'Connecting…' : 'Start Session'}
          </button>
        </form>
      </div>
    </div>
  )
}
