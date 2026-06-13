import { useState, useEffect } from 'react'
import { adminAuth, adminApi } from '../api'
import type { AdminBranch, AdminAccount } from '../types'

export function AdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!adminAuth.getToken())
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [branches, setBranches] = useState<AdminBranch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [showNewBranch, setShowNewBranch] = useState(false)
  const [newBranchId, setNewBranchId] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [branchError, setBranchError] = useState('')
  const [branchLoading, setBranchLoading] = useState(false)

  // Per-branch: add account form state keyed by branchId
  const [addingAccount, setAddingAccount] = useState<string | null>(null)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [accountError, setAccountError] = useState('')
  const [accountLoading, setAccountLoading] = useState(false)

  // Per-account: reset password
  const [resetting, setResetting] = useState<number | null>(null)
  const [resetPw, setResetPw] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    if (isLoggedIn) loadOverview()
  }, [isLoggedIn])

  async function loadOverview() {
    setLoading(true)
    setError('')
    try {
      setBranches(await adminApi.getOverview())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await adminApi.login(password)
      adminAuth.setToken(res.token)
      setIsLoggedIn(true)
    } catch {
      setLoginError('Incorrect admin password.')
    } finally {
      setLoginLoading(false)
    }
  }

  function handleLogout() {
    adminAuth.clearToken()
    setIsLoggedIn(false)
    setBranches([])
  }

  async function handleCreateBranch(e: React.FormEvent) {
    e.preventDefault()
    setBranchLoading(true)
    setBranchError('')
    try {
      const branch = await adminApi.createBranch(newBranchId.trim(), newBranchName.trim() || newBranchId.trim())
      setBranches(prev => [...prev, branch].sort((a, b) => a.name.localeCompare(b.name)))
      setNewBranchId('')
      setNewBranchName('')
      setShowNewBranch(false)
    } catch (err) {
      setBranchError(err instanceof Error ? err.message : 'Failed to create branch.')
    } finally {
      setBranchLoading(false)
    }
  }

  function openAddAccount(branchId: string) {
    setAddingAccount(branchId)
    setNewUsername('')
    setNewPassword('')
    setAccountError('')
  }

  async function handleCreateAccount(e: React.FormEvent, branchId: string) {
    e.preventDefault()
    setAccountLoading(true)
    setAccountError('')
    try {
      const account = await adminApi.createAccount(branchId, newUsername.trim(), newPassword)
      setBranches(prev => prev.map(b =>
        b.id === branchId ? { ...b, accounts: [...b.accounts, account] } : b
      ))
      setAddingAccount(null)
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Failed to create account.')
    } finally {
      setAccountLoading(false)
    }
  }

  async function handleDeleteAccount(branchId: string, accountId: number) {
    if (!confirm('Delete this account?')) return
    try {
      await adminApi.deleteAccount(accountId)
      setBranches(prev => prev.map(b =>
        b.id === branchId ? { ...b, accounts: b.accounts.filter(a => a.id !== accountId) } : b
      ))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete account.')
    }
  }

  function openResetPassword(account: AdminAccount) {
    setResetting(account.id)
    setResetPw('')
    setResetError('')
  }

  async function handleResetPassword(e: React.FormEvent, accountId: number) {
    e.preventDefault()
    setResetLoading(true)
    setResetError('')
    try {
      await adminApi.resetPassword(accountId, resetPw)
      setResetting(null)
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Failed to reset password.')
    } finally {
      setResetLoading(false)
    }
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gray-800 flex items-center justify-center text-white font-black text-lg">Q</div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">QueueFree</h1>
              <p className="text-xs text-gray-400">Super Admin</p>
            </div>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Password</label>
              <input
                type="password"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-gray-800"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
            {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
            <button
              type="submit"
              disabled={loginLoading || !password}
              className="w-full py-3 bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors"
            >
              {loginLoading ? '…' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gray-800 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg">QueueFree Admin</h1>
          <p className="text-gray-400 text-xs">Branch & account management</p>
        </div>
        <button onClick={handleLogout} className="text-gray-400 hover:text-white text-sm transition-colors">
          Logout
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* New Branch */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Branches</h2>
          <button
            onClick={() => { setShowNewBranch(p => !p); setBranchError('') }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {showNewBranch ? 'Cancel' : '+ New Branch'}
          </button>
        </div>

        {showNewBranch && (
          <form onSubmit={handleCreateBranch} className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
            <h3 className="font-semibold text-gray-800">New Branch</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Branch ID</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
                  placeholder="e.g. clinic-01"
                  value={newBranchId}
                  onChange={e => setNewBranchId(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Branch Name</label>
                <input
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
                  placeholder="e.g. Main Clinic"
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                />
              </div>
            </div>
            {branchError && <p className="text-red-500 text-sm">{branchError}</p>}
            <button
              type="submit"
              disabled={branchLoading || !newBranchId.trim()}
              className="px-5 py-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {branchLoading ? 'Creating…' : 'Create Branch'}
            </button>
          </form>
        )}

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-gray-800 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {!loading && branches.length === 0 && !error && (
          <p className="text-gray-400 text-sm text-center py-8">No branches yet. Create one above.</p>
        )}

        {branches.map(branch => (
          <div key={branch.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="font-bold text-gray-900">{branch.name}</p>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{branch.id}</p>
            </div>

            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Staff Accounts</p>

              {branch.accounts.length === 0 && addingAccount !== branch.id && (
                <p className="text-sm text-gray-400 italic mb-3">No accounts yet.</p>
              )}

              <div className="space-y-2 mb-4">
                {branch.accounts.map(account => (
                  <div key={account.id}>
                    {resetting === account.id ? (
                      <form onSubmit={e => handleResetPassword(e, account.id)} className="flex items-center gap-2">
                        <span className="text-sm text-gray-700 font-medium w-28 shrink-0">{account.username}</span>
                        <input
                          type="password"
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
                          placeholder="New password"
                          value={resetPw}
                          onChange={e => setResetPw(e.target.value)}
                          required
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={resetLoading || !resetPw}
                          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          {resetLoading ? '…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetting(null)}
                          className="px-2 py-1.5 text-gray-400 hover:text-gray-600 text-xs rounded-lg transition-colors"
                        >
                          ✕
                        </button>
                        {resetError && <p className="text-red-500 text-xs">{resetError}</p>}
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm text-gray-700 font-medium">{account.username}</span>
                        <button
                          onClick={() => openResetPassword(account)}
                          className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded transition-colors"
                          title="Reset password"
                        >
                          Reset pw
                        </button>
                        <button
                          onClick={() => handleDeleteAccount(branch.id, account.id)}
                          className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded transition-colors"
                          title="Delete account"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {addingAccount === branch.id ? (
                <form onSubmit={e => handleCreateAccount(e, branch.id)} className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Account</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Username</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
                        placeholder="staff"
                        value={newUsername}
                        onChange={e => setNewUsername(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Password</label>
                      <input
                        type="password"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  {accountError && <p className="text-red-500 text-xs">{accountError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={accountLoading || !newUsername.trim() || !newPassword}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      {accountLoading ? 'Creating…' : 'Create Account'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingAccount(null)}
                      className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => openAddAccount(branch.id)}
                  className="text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors"
                >
                  + Add Account
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
