import { useState, useEffect } from 'react'
import { adminApi, adminAuth } from '../api'
import type { AdminBranch } from '../types'

type Mode = 'loading' | 'setup' | 'login' | 'dashboard'

export function AdminPage() {
  const [mode, setMode] = useState<Mode>('loading')
  const [branches, setBranches] = useState<AdminBranch[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Setup form
  const [setupBranchId, setSetupBranchId] = useState('')
  const [setupBranchName, setSetupBranchName] = useState('')
  const [setupUsername, setSetupUsername] = useState('')
  const [setupPassword, setSetupPassword] = useState('')

  // Login form
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // Create branch form
  const [newBranchId, setNewBranchId] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)

  // Create account form
  const [acctBranchId, setAcctBranchId] = useState('')
  const [acctUsername, setAcctUsername] = useState('')
  const [acctPassword, setAcctPassword] = useState('')
  const [acctRole, setAcctRole] = useState<'staff' | 'admin'>('staff')
  const [showNewAccount, setShowNewAccount] = useState(false)

  // Reset password
  const [resetId, setResetId] = useState<number | null>(null)
  const [resetPassword, setResetPassword] = useState('')

  useEffect(() => {
    adminApi.needsSetup().then(r => {
      if (r.needsSetup) {
        setMode('setup')
      } else if (adminAuth.getToken()) {
        loadDashboard()
      } else {
        setMode('login')
      }
    }).catch(() => setMode('login'))
  }, [])

  async function loadDashboard() {
    setMode('loading')
    try {
      const data = await adminApi.getOverview()
      setBranches(data)
      setMode('dashboard')
    } catch {
      adminAuth.clearToken()
      setMode('login')
    }
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await adminApi.setup(setupBranchId.trim(), setupBranchName.trim() || setupBranchId.trim(), setupUsername.trim(), setupPassword)
      setMode('login')
      setLoginUsername(setupUsername.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword }),
      })
      if (!res.ok) throw new Error('Invalid credentials')
      const data = await res.json()
      if (data.role !== 'admin') throw new Error('Access denied — admin role required.')
      adminAuth.setToken(data.token)
      await loadDashboard()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateBranch(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const branch = await adminApi.createBranch(newBranchId.trim(), newBranchName.trim() || newBranchId.trim())
      setBranches(prev => [...prev, branch])
      setNewBranchId('')
      setNewBranchName('')
      setShowNewBranch(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create branch.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const account = await adminApi.createAccount(acctBranchId, acctUsername.trim(), acctPassword, acctRole)
      setBranches(prev => prev.map(b =>
        b.id === acctBranchId ? { ...b, accounts: [...b.accounts, account] } : b
      ))
      setAcctUsername('')
      setAcctPassword('')
      setShowNewAccount(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword(id: number) {
    if (!resetPassword.trim()) return
    setLoading(true)
    try {
      await adminApi.resetPassword(id, resetPassword)
      setResetId(null)
      setResetPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteAccount(id: number) {
    if (!confirm('Delete this account?')) return
    setLoading(true)
    try {
      await adminApi.deleteAccount(id)
      setBranches(prev => prev.map(b => ({ ...b, accounts: b.accounts.filter(a => a.id !== id) })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account.')
    } finally {
      setLoading(false)
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (mode === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading…</div>
      </div>
    )
  }

  // ── First-time setup ─────────────────────────────────────────────────────
  if (mode === 'setup') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to QueueFree</h1>
          <p className="text-gray-500 text-sm mb-6">Set up your first admin account to get started.</p>

          <form onSubmit={handleSetup} className="space-y-4">
            <Field label="Branch ID" placeholder="clinic-main" value={setupBranchId} onChange={setSetupBranchId} required />
            <Field label="Branch Name" placeholder="Main Clinic" value={setupBranchName} onChange={setSetupBranchName} />
            <Field label="Admin Username" placeholder="admin" value={setupUsername} onChange={setSetupUsername} required />
            <Field label="Admin Password" type="password" placeholder="••••••••" value={setupPassword} onChange={setSetupPassword} required />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-3 bg-teal-brand hover:bg-teal-dark text-white font-semibold rounded-xl disabled:opacity-40">
              {loading ? '…' : 'Create Admin Account'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Admin login ─────────────────────────────────────────────────────────
  if (mode === 'login') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gray-900 flex items-center justify-center text-white font-black text-lg">Q</div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-xs text-gray-400">QueueFree management</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <Field label="Username" placeholder="admin" value={loginUsername} onChange={setLoginUsername} required autoFocus />
            <Field label="Password" type="password" placeholder="••••••••" value={loginPassword} onChange={setLoginPassword} required />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={loading || !loginUsername.trim() || !loginPassword} className="w-full py-3 bg-gray-900 hover:bg-black text-white font-semibold rounded-xl disabled:opacity-40">
              {loading ? '…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Dashboard ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">QueueFree Admin</h1>
          <p className="text-gray-400 text-xs mt-0.5">{branches.length} branch{branches.length !== 1 ? 'es' : ''}</p>
        </div>
        <button
          onClick={() => { adminAuth.clearToken(); setMode('login') }}
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          Logout
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {error && <div className="bg-red-50 text-red-600 rounded-xl px-5 py-3 text-sm">{error}</div>}

        {/* Create Branch */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-gray-900">Branches</h2>
            <button
              onClick={() => setShowNewBranch(p => !p)}
              className="text-sm px-4 py-2 rounded-xl bg-teal-brand text-white hover:bg-teal-dark transition-colors"
            >
              + New Branch
            </button>
          </div>

          {showNewBranch && (
            <form onSubmit={handleCreateBranch} className="flex gap-2 mb-4">
              <input className={inputCls} placeholder="Branch ID (e.g. clinic-01)" value={newBranchId} onChange={e => setNewBranchId(e.target.value)} required />
              <input className={inputCls} placeholder="Branch Name" value={newBranchName} onChange={e => setNewBranchName(e.target.value)} />
              <button type="submit" disabled={loading || !newBranchId.trim()} className="px-4 py-2 bg-teal-brand text-white rounded-xl text-sm font-semibold disabled:opacity-40">
                {loading ? '…' : 'Create'}
              </button>
            </form>
          )}

          {branches.length === 0
            ? <p className="text-sm text-gray-400 italic">No branches yet.</p>
            : branches.map(branch => (
              <div key={branch.id} className="border border-gray-100 rounded-xl p-4 mb-3 last:mb-0">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-semibold text-gray-900">{branch.name}</span>
                    <span className="ml-2 text-xs text-gray-400 font-mono">{branch.id}</span>
                  </div>
                  <button
                    onClick={() => { setAcctBranchId(branch.id); setShowNewAccount(true) }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                  >
                    + Account
                  </button>
                </div>

                {/* Accounts */}
                <div className="space-y-1.5">
                  {branch.accounts.length === 0
                    ? <p className="text-xs text-gray-400 italic">No accounts</p>
                    : branch.accounts.map(a => (
                      <div key={a.id} className="flex items-center gap-2 text-sm">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${a.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>{a.role}</span>
                        <span className="flex-1 font-mono text-gray-700">{a.username}</span>
                        {resetId === a.id ? (
                          <>
                            <input
                              type="password"
                              className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-28"
                              placeholder="New password"
                              value={resetPassword}
                              onChange={e => setResetPassword(e.target.value)}
                              autoFocus
                            />
                            <button onClick={() => handleResetPassword(a.id)} className="text-xs px-2 py-1 bg-teal-brand text-white rounded-lg">Save</button>
                            <button onClick={() => { setResetId(null); setResetPassword('') }} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => setResetId(a.id)} className="text-xs text-gray-400 hover:text-teal-brand transition-colors">Reset pwd</button>
                            <button onClick={() => handleDeleteAccount(a.id)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Delete</button>
                          </>
                        )}
                      </div>
                    ))
                  }
                </div>
              </div>
            ))
          }
        </div>

        {/* Create Account Modal */}
        {showNewAccount && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-6">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4">
              <h3 className="font-bold text-gray-900">New Staff Account</h3>
              <form onSubmit={handleCreateAccount} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Branch</label>
                  <select className={inputCls} value={acctBranchId} onChange={e => setAcctBranchId(e.target.value)}>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.id})</option>)}
                  </select>
                </div>
                <Field label="Username" value={acctUsername} onChange={setAcctUsername} required />
                <Field label="Password" type="password" value={acctPassword} onChange={setAcctPassword} required />
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Role</label>
                  <select className={inputCls} value={acctRole} onChange={e => setAcctRole(e.target.value as 'staff' | 'admin')}>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowNewAccount(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-gray-600 text-sm font-medium">Cancel</button>
                  <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-teal-brand text-white rounded-xl text-sm font-semibold disabled:opacity-40">
                    {loading ? '…' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand'

function Field({ label, placeholder, value, onChange, required, type = 'text', autoFocus }: {
  label: string; placeholder?: string; value: string; onChange: (v: string) => void
  required?: boolean; type?: string; autoFocus?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        className={inputCls}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        autoFocus={autoFocus}
      />
    </div>
  )
}
