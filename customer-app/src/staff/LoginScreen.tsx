import { useState } from 'react'
import { api, auth } from '../api'

interface Props {
  onLogin: (branchId: string) => void
}

export function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.login(username.trim(), password)
      auth.setToken(res.token)
      onLogin(res.branchId)
    } catch {
      setError('Wrong username or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-teal-brand flex items-center justify-center text-white font-black text-lg">Q</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">QueueFree</h1>
            <p className="text-xs text-gray-400">Staff companion</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-brand"
              placeholder="staff"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-brand"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="w-full py-3 bg-teal-brand hover:bg-teal-dark disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
          >
            {loading ? '…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
