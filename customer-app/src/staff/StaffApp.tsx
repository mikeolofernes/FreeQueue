import { useState, useEffect, useCallback, useRef } from 'react'
import { api, auth } from '../api'
import { useQueueHub } from './useQueueHub'
import { LoginScreen } from './LoginScreen'
import { WalkInModal } from './WalkInModal'
import { ElapsedTimer } from './ElapsedTimer'
import type { QueueStatus, BranchService } from '../types'

const BRANCH_KEY = 'fq_branch_id'
const BRANCH_NAME_KEY = 'fq_branch_name'

export default function StaffApp() {
  const [branchId, setBranchId] = useState(() => localStorage.getItem(BRANCH_KEY) ?? '')
  const [branchName, setBranchName] = useState(() => localStorage.getItem(BRANCH_NAME_KEY) ?? '')
  const [branchServices, setBranchServices] = useState<BranchService[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!auth.getToken())
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [connected, setConnected] = useState(false)
  const [servingStartedAt, setServingStartedAt] = useState<Date | null>(null)
  const [showWalkIn, setShowWalkIn] = useState(false)
  const [showPinSettings, setShowPinSettings] = useState(false)
  const [showServices, setShowServices] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [newService, setNewService] = useState('')
  const [editingService, setEditingService] = useState<{ id: number; name: string } | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const prevTicket = useRef<number | null>(null)

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!branchId) return
    try { setStatus(await api.getStatus(branchId)) } catch { /* keep stale */ }
  }, [branchId])

  const loadServices = useCallback(async (id: string) => {
    try { setBranchServices(await api.getServices(id)) } catch { /* keep stale */ }
  }, [])

  useEffect(() => {
    if (status?.currentTicketNumber !== prevTicket.current) {
      prevTicket.current = status?.currentTicketNumber ?? null
      setServingStartedAt(status?.currentTicketNumber != null ? new Date() : null)
    }
  }, [status?.currentTicketNumber])

  useEffect(() => {
    if (branchId && isLoggedIn) {
      refreshStatus()
      loadServices(branchId)
    }
  }, [branchId, isLoggedIn, refreshStatus, loadServices])

  useQueueHub({
    branchId,
    onQueueAdvanced: s => setStatus(s),
    onConnected: () => { setConnected(true); refreshStatus() },
    onDisconnected: () => setConnected(false),
  })

  function handleLogin(id: string) {
    localStorage.setItem(BRANCH_KEY, id)
    setBranchId(id)
    setIsLoggedIn(true)
    api.getBranch(id).then(b => {
      localStorage.setItem(BRANCH_NAME_KEY, b.name)
      setBranchName(b.name)
    }).catch(() => {})
  }

  function handleLogout() {
    auth.clearToken()
    localStorage.removeItem(BRANCH_KEY)
    localStorage.removeItem(BRANCH_NAME_KEY)
    setBranchId('')
    setBranchName('')
    setBranchServices([])
    setIsLoggedIn(false)
    setStatus(null)
    setShowServices(false)
    setShowPinSettings(false)
  }

  async function handleAdvance() {
    if (advancing) return
    setAdvancing(true)
    try {
      if (!status?.currentTicketNumber || !status.currentServiceType) {
        const next = await api.callNext(branchId)
        setStatus(next)
        showToast('▶ Called first customer')
      } else {
        const duration = servingStartedAt ? Math.floor((Date.now() - servingStartedAt.getTime()) / 1000) : 0
        const next = await api.advance(branchId, status.currentTicketNumber, status.currentServiceType, duration)
        setStatus(next)
        showToast(`✓ Ticket #${status.currentTicketNumber} done — called next`)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'err')
    } finally {
      setAdvancing(false)
    }
  }

  async function handleWalkIn(serviceType: string, customerName?: string) {
    setShowWalkIn(false)
    try {
      const ticket = await api.addWalkIn(branchId, serviceType, customerName)
      showToast(`✓ Walk-in added — Ticket #${ticket.ticketNumber}`)
      refreshStatus()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add walk-in', 'err')
    }
  }

  async function handleUndo() {
    try {
      const result = await api.undo(branchId)
      showToast(result.success ? `↩ ${result.message}` : result.message, result.success ? 'ok' : 'err')
      if (result.success) refreshStatus()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Undo failed', 'err')
    }
  }

  async function handleSetKioskPin(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.setKioskPin(branchId, pinInput.trim() || null)
      showToast(pinInput.trim() ? '🔒 Kiosk PIN set' : '🔓 Kiosk PIN cleared')
      setPinInput('')
      setShowPinSettings(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to set PIN', 'err')
    }
  }

  async function handleAddService(e: React.FormEvent) {
    e.preventDefault()
    if (!newService.trim()) return
    try {
      const added = await api.addService(branchId, newService.trim())
      setBranchServices(prev => [...prev, added])
      setNewService('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add service', 'err')
    }
  }

  async function handleUpdateService(id: number, name: string) {
    if (!name.trim()) return
    try {
      const updated = await api.updateService(branchId, id, name.trim())
      setBranchServices(prev => prev.map(s => s.id === id ? updated : s))
      setEditingService(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update service', 'err')
    }
  }

  async function handleDeleteService(id: number) {
    try {
      await api.deleteService(branchId, id)
      setBranchServices(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete service', 'err')
    }
  }

  if (!isLoggedIn) return <LoginScreen onLogin={handleLogin} />

  const isServing = status?.currentTicketNumber != null
  const queueEmpty = !isServing && (status?.peopleWaiting ?? 0) === 0

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-sm mx-auto">
      <header className="bg-teal-brand text-white px-5 py-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="font-bold text-lg leading-none">QueueFree</h1>
          <p className="text-teal-light text-sm mt-0.5 truncate max-w-[160px]">{branchName || branchId}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-400'}`} />
          <button onClick={handleLogout} className="text-teal-light hover:text-white text-xs transition-colors">
            Logout
          </button>
        </div>
      </header>

      {status && (
        <div className="bg-white border-b border-gray-100 px-5 py-3 flex justify-between text-sm">
          <Stat label="Waiting" value={status.peopleWaiting} />
          <Stat label="Served today" value={status.servedToday} highlight />
          <Stat label="Est. / person" value={status.waitEstimate ? `${status.waitEstimate.estimatedMinutes}m` : '—'} />
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
        {queueEmpty ? (
          <div className="text-center space-y-2">
            <div className="text-5xl">🎉</div>
            <p className="text-xl font-bold text-gray-700">Queue is empty</p>
            <p className="text-gray-400 text-sm">Add a walk-in or share the QR code</p>
          </div>
        ) : isServing ? (
          <div className="text-center space-y-1">
            <p className="text-xs font-semibold tracking-widest text-gray-400 uppercase">Now serving</p>
            <div className="text-8xl font-black text-teal-brand leading-none">
              #{status!.currentTicketNumber}
            </div>
            <p className="text-gray-500 font-medium">{status!.currentServiceType}</p>
          </div>
        ) : (
          <div className="text-center space-y-2">
            <p className="text-2xl font-bold text-gray-600">{status?.peopleWaiting} waiting</p>
            <p className="text-gray-400 text-sm">Tap the button to call the first customer</p>
          </div>
        )}

        {isServing && <ElapsedTimer startedAt={servingStartedAt} />}

        <button
          onClick={handleAdvance}
          disabled={advancing || queueEmpty}
          className="w-full py-6 rounded-2xl bg-teal-brand hover:bg-teal-dark active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xl font-bold shadow-lg transition-all"
        >
          {advancing ? 'Advancing…' : isServing ? '✓  Done — Call Next' : '▶  Call First Customer'}
        </button>
      </div>

      <div className="bg-white border-t border-gray-100 px-5 py-4 flex gap-3">
        <button
          onClick={() => setShowWalkIn(true)}
          className="flex-1 py-3 rounded-xl border-2 border-teal-brand text-teal-brand font-semibold hover:bg-teal-brand hover:text-white transition-colors"
        >
          + Walk-in
        </button>
        <button
          onClick={handleUndo}
          className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors"
        >
          ↩ Undo
        </button>
        <button
          onClick={() => { setShowPinSettings(p => !p); setShowServices(false) }}
          className={`py-3 px-4 rounded-xl border-2 font-semibold transition-colors ${showPinSettings ? 'border-teal-brand bg-teal-brand text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          title="Kiosk PIN"
        >
          🔒
        </button>
        <button
          onClick={() => { setShowServices(p => !p); setShowPinSettings(false); setEditingService(null) }}
          className={`py-3 px-4 rounded-xl border-2 font-semibold transition-colors ${showServices ? 'border-teal-brand bg-teal-brand text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          title="Manage Services"
        >
          ⚙
        </button>
      </div>

      {showPinSettings && (
        <div className="bg-white border-t border-gray-200 px-5 py-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Kiosk PIN</p>
          <p className="text-xs text-gray-400 mb-3">Set a PIN so only staff can unlock the kiosk. Leave blank to remove the PIN.</p>
          <form onSubmit={handleSetKioskPin} className="flex gap-2">
            <input
              type="password"
              inputMode="numeric"
              className="flex-1 border-2 border-gray-200 focus:border-teal-brand rounded-xl px-4 py-2 text-gray-900 outline-none transition-colors"
              placeholder="New PIN (blank to clear)"
              value={pinInput}
              onChange={e => setPinInput(e.target.value)}
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-teal-brand text-white font-semibold hover:bg-teal-dark transition-colors"
            >
              Save
            </button>
          </form>
        </div>
      )}

      {showServices && (
        <div className="bg-white border-t border-gray-200 px-5 py-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Services Offered</p>
          <div className="space-y-2 mb-3 max-h-52 overflow-y-auto">
            {branchServices.length === 0 && (
              <p className="text-xs text-gray-400 italic">No services yet. Add one below.</p>
            )}
            {branchServices.map(s => (
              <div key={s.id} className="flex items-center gap-2">
                {editingService?.id === s.id ? (
                  <>
                    <input
                      className="flex-1 border-2 border-teal-brand rounded-lg px-3 py-1.5 text-sm outline-none"
                      value={editingService.name}
                      onChange={e => setEditingService({ id: s.id, name: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdateService(s.id, editingService.name) }}
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdateService(s.id, editingService.name)}
                      className="px-3 py-1.5 bg-teal-brand text-white text-xs rounded-lg hover:bg-teal-dark transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingService(null)}
                      className="px-2 py-1.5 text-gray-400 text-xs rounded-lg hover:text-gray-600 transition-colors"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-700 py-1">{s.name}</span>
                    <button
                      onClick={() => setEditingService({ id: s.id, name: s.name })}
                      className="text-gray-400 hover:text-teal-brand p-1 text-sm transition-colors"
                      title="Edit"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => handleDeleteService(s.id)}
                      className="text-gray-400 hover:text-red-500 p-1 text-sm transition-colors"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={handleAddService} className="flex gap-2">
            <input
              className="flex-1 border-2 border-gray-200 focus:border-teal-brand rounded-xl px-3 py-2 text-sm outline-none transition-colors"
              placeholder="New service name"
              value={newService}
              onChange={e => setNewService(e.target.value)}
            />
            <button
              type="submit"
              disabled={!newService.trim()}
              className="px-4 py-2 rounded-xl bg-teal-brand text-white text-sm font-semibold disabled:opacity-40 hover:bg-teal-dark transition-colors"
            >
              Add
            </button>
          </form>
        </div>
      )}

      {showWalkIn && <WalkInModal services={branchServices.map(s => s.name)} onConfirm={handleWalkIn} onCancel={() => setShowWalkIn(false)} />}

      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium z-50 ${
          toast.type === 'ok' ? 'bg-gray-800' : 'bg-red-500'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${highlight ? 'text-teal-brand' : 'text-gray-800'}`}>{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}
