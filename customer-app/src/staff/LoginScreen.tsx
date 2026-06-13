import { useState } from 'react'
import { api, auth } from '../api'

interface Props {
  onLogin: (branchId: string) => void
}

export function LoginScreen({ onLogin }: Props) {
  const [tab, setTab] = useState<'login' | 'setup'>('login')
  const [branchId, setBranchId] = useState('')
  const [branchName, setBranchName] = useState('')
  const [username, setUsername] = useState('staff')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [setupDone, setSetupDone] = useState('')

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

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSetupDone('')
    try {
      await api.createBranch(branchId.trim(), branchName.trim() || branchId.trim()).catch(() => {})
      await api.setupStaffAccount(branchId.trim(), username.trim(), password)
      setSetupDone('Account ready! Switch to Login tab and sign in.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.')
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

        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          {(['login', 'setup'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); setSetupDone('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {t === 'login' ? 'Login' : 'First-time Setup'}
            </button>
          ))}
        </div>

        <form onSubmit={tab === 'login' ? handleLogin : handleSetup} className="space-y-4">
          {tab === 'setup' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch ID</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-brand"
                  placeholder="e.g. bacoor-clinic-01"
                  value={branchId}
                  onChange={e => setBranchId(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-brand"
                  placeholder="e.g. Bacoor Clinic"
                  value={branchName}
                  onChange={e => setBranchName(e.target.value)}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-brand"
              placeholder="staff"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus={tab === 'login'}
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
          {setupDone && <p className="text-green-600 text-sm">{setupDone}</p>}

          <button
            type="submit"
            disabled={loading || (tab === 'setup' && !branchId.trim()) || !username.trim() || !password}
            className="w-full py-3 bg-teal-brand hover:bg-teal-dark disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
          >
            {loading ? '…' : tab === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
