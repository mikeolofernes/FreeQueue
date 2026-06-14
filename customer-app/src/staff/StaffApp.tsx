import { useState, useEffect, useCallback, useRef } from 'react'
import { api, auth } from '../api'
import { useQueueHub } from './useQueueHub'
import { LoginScreen } from './LoginScreen'
import { WalkInModal } from './WalkInModal'
import { ElapsedTimer } from './ElapsedTimer'
import type { QueueStatus, BranchService, AnalyticsData, Appointment } from '../types'

const BRANCH_KEY = 'fq_branch_id'
const BRANCH_NAME_KEY = 'fq_branch_name'
const COUNTER_ID_KEY = 'fq_counter_id'
const HAS_DEFAULT_PIN_KEY = 'fq_has_default_pin'

type Panel = 'none' | 'pin' | 'services' | 'analytics' | 'appointments'

export default function StaffApp() {
  const [branchId, setBranchId] = useState(() => localStorage.getItem(BRANCH_KEY) ?? '')
  const [branchName, setBranchName] = useState(() => localStorage.getItem(BRANCH_NAME_KEY) ?? '')
  const [branchServices, setBranchServices] = useState<BranchService[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!auth.getToken())
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [connected, setConnected] = useState(false)
  const [servingStartedAt, setServingStartedAt] = useState<Date | null>(null)
  const [showWalkIn, setShowWalkIn] = useState(false)
  const [activePanel, setActivePanel] = useState<Panel>('none')
  const [pinInput, setPinInput] = useState('')
  const [newService, setNewService] = useState('')
  const [editingService, setEditingService] = useState<{ id: number; name: string } | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [hasDefaultPin, setHasDefaultPin] = useState(() => localStorage.getItem(HAS_DEFAULT_PIN_KEY) === 'true')
  const [defaultPinInput, setDefaultPinInput] = useState('')
  const [counterId, setCounterId] = useState(() => localStorage.getItem(COUNTER_ID_KEY) ?? '')
  const [editingCounterId, setEditingCounterId] = useState(false)
  const [counterIdInput, setCounterIdInput] = useState('')
  const [showTransfer, setShowTransfer] = useState(false)
  const [appointments, setAppointments] = useState<Appointment[] | null>(null)
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

  function handleLogin(id: string, hasPin?: boolean) {
    localStorage.setItem(BRANCH_KEY, id)
    localStorage.setItem(HAS_DEFAULT_PIN_KEY, String(!!hasPin))
    setBranchId(id)
    setIsLoggedIn(true)
    setHasDefaultPin(!!hasPin)
    api.getBranch(id).then(b => {
      localStorage.setItem(BRANCH_NAME_KEY, b.name)
      setBranchName(b.name)
    }).catch(() => {})
  }

  function handleLogout() {
    auth.clearToken()
    localStorage.removeItem(BRANCH_KEY)
    localStorage.removeItem(BRANCH_NAME_KEY)
    localStorage.removeItem(HAS_DEFAULT_PIN_KEY)
    setBranchId('')
    setBranchName('')
    setBranchServices([])
    setHasDefaultPin(false)
    setIsLoggedIn(false)
    setStatus(null)
    setActivePanel('none')
  }

  async function handleAdvance() {
    if (advancing) return
    setAdvancing(true)
    try {
      if (!status?.currentTicketNumber || !status.currentServiceType) {
        const next = await api.callNext(branchId, counterId || undefined)
        setStatus(next)
        showToast('▶ Called first customer')
      } else {
        const duration = servingStartedAt ? Math.floor((Date.now() - servingStartedAt.getTime()) / 1000) : 0
        const next = await api.advance(branchId, status.currentTicketNumber, status.currentServiceType, duration, counterId || undefined)
        setStatus(next)
        showToast(`✓ Ticket #${status.currentTicketNumber} done — called next`)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'err')
    } finally {
      setAdvancing(false)
    }
  }

  async function handleNoShow() {
    const ticketId = status?.currentTicketId
    if (!ticketId) return
    try {
      await api.noShow(ticketId)
      showToast('No-show recorded — called next')
      refreshStatus()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'err')
    }
  }

  async function handleWalkIn(serviceType: string, customerName?: string, priority = false) {
    setShowWalkIn(false)
    try {
      const ticket = await api.addWalkIn(branchId, serviceType, customerName, priority)
      showToast(`✓ ${priority ? '⚡ Priority ' : ''}Walk-in added — Ticket #${ticket.ticketNumber}`)
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

  async function handleToggleOpen() {
    try {
      const res = await api.toggleQueueOpen(branchId)
      setStatus(s => s ? { ...s, isOpen: res.isOpen } : s)
      showToast(res.isOpen ? '🟢 Queue opened' : '🔴 Queue closed')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed', 'err')
    }
  }

  async function handleTransfer(newServiceType: string) {
    const ticketId = status?.currentTicketId
    if (!ticketId) return
    setShowTransfer(false)
    try {
      await api.transferTicket(ticketId, newServiceType)
      showToast(`↔ Transferred to ${newServiceType}`)
      refreshStatus()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Transfer failed', 'err')
    }
  }

  async function handleSetKioskPin(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.setKioskPin(branchId, pinInput.trim() || null)
      showToast(pinInput.trim() ? '🔒 Kiosk PIN set' : '🔓 Kiosk PIN cleared')
      setPinInput('')
      setActivePanel('none')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to set PIN', 'err')
    }
  }

  async function handleSetDefaultPin(e: React.FormEvent) {
    e.preventDefault()
    try {
      const val = defaultPinInput.trim()
      await api.setDefaultPin(val || null)
      localStorage.setItem(HAS_DEFAULT_PIN_KEY, String(!!val))
      setHasDefaultPin(!!val)
      setDefaultPinInput('')
      showToast(val ? '🔒 Default PIN saved' : '🔓 Default PIN cleared')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save default PIN', 'err')
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

  async function handleLoadAnalytics() {
    try {
      const data = await api.getAnalytics(branchId)
      setAnalytics(data)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load analytics', 'err')
    }
  }

  async function handleLoadAppointments() {
    try {
      const data = await api.getAppointments(branchId)
      setAppointments(data)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load appointments', 'err')
    }
  }

  async function handleUpdateAppointmentStatus(id: number, newStatus: string) {
    try {
      await api.updateAppointmentStatus(branchId, id, newStatus)
      setAppointments(prev => prev ? prev.map(a => a.id === id ? { ...a, status: newStatus } : a) : prev)
      showToast(`✓ Appointment ${newStatus}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update appointment', 'err')
    }
  }

  function saveCounterId() {
    const val = counterIdInput.trim()
    localStorage.setItem(COUNTER_ID_KEY, val)
    setCounterId(val)
    setEditingCounterId(false)
  }

  function togglePanel(p: Panel) {
    if (activePanel === p) { setActivePanel('none'); return }
    setActivePanel(p)
    if (p === 'analytics') handleLoadAnalytics()
    if (p === 'appointments') handleLoadAppointments()
  }

  if (!isLoggedIn) return <LoginScreen onLogin={handleLogin} />

  const isServing = status?.currentTicketNumber != null
  const queueEmpty = !isServing && (status?.peopleWaiting ?? 0) === 0
  const isOpen = status?.isOpen ?? true

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-sm mx-auto">
      <header className="bg-teal-brand text-white px-5 py-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="font-bold text-lg leading-none">QueueFree</h1>
          <p className="text-teal-light text-sm mt-0.5 truncate max-w-[160px]">{branchName || branchId}</p>
        </div>
        <div className="flex items-center gap-2">
          {editingCounterId ? (
            <div className="flex items-center gap-1">
              <input
                className="w-20 text-xs px-2 py-1 rounded-lg bg-white/20 border border-white/40 text-white placeholder-white/50 outline-none"
                placeholder="Counter ID"
                value={counterIdInput}
                onChange={e => setCounterIdInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveCounterId(); if (e.key === 'Escape') setEditingCounterId(false) }}
                autoFocus
              />
              <button onClick={saveCounterId} className="text-white text-xs px-1.5 py-1 rounded bg-white/20 hover:bg-white/30">✓</button>
              <button onClick={() => setEditingCounterId(false)} className="text-white/60 text-xs px-1 py-1">✕</button>
            </div>
          ) : (
            <button
              onClick={() => { setCounterIdInput(counterId); setEditingCounterId(true) }}
              className="text-xs text-teal-light hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
              title="Set counter ID"
            >
              {counterId ? `📍 ${counterId}` : '+ Counter'}
            </button>
          )}
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

      {!isOpen && (
        <div className="bg-red-50 border-b border-red-100 px-5 py-2 text-center">
          <span className="text-red-600 text-sm font-medium">Queue is closed — customers cannot join</span>
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
              {status?.nextTicketNumbers?.[0] != null && (
                <span className="text-gray-300 text-3xl ml-3">→ #{status.nextTicketNumbers[0]}</span>
              )}
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
          disabled={advancing || (queueEmpty && !isServing)}
          className="w-full py-6 rounded-2xl bg-teal-brand hover:bg-teal-dark active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xl font-bold shadow-lg transition-all"
        >
          {advancing ? 'Advancing…' : isServing ? '✓  Done — Call Next' : '▶  Call First Customer'}
        </button>

        {isServing && (
          <div className="w-full flex gap-2">
            <button
              onClick={handleNoShow}
              className="flex-1 py-3 rounded-xl border-2 border-red-200 text-red-500 font-semibold hover:bg-red-50 transition-colors text-sm"
            >
              ✗ No-show
            </button>
            <button
              onClick={() => setShowTransfer(true)}
              className="flex-1 py-3 rounded-xl border-2 border-blue-200 text-blue-600 font-semibold hover:bg-blue-50 transition-colors text-sm"
            >
              ↔ Transfer
            </button>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="bg-white border-t border-gray-100 px-3 py-3 flex gap-2">
        <button
          onClick={() => setShowWalkIn(true)}
          className="flex-1 py-3 rounded-xl border-2 border-teal-brand text-teal-brand font-semibold hover:bg-teal-brand hover:text-white transition-colors text-sm"
        >
          + Walk-in
        </button>
        <button
          onClick={handleUndo}
          className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition-colors text-sm"
        >
          ↩ Undo
        </button>
        <button
          onClick={handleToggleOpen}
          className={`py-3 px-3 rounded-xl border-2 font-semibold transition-colors text-sm ${isOpen ? 'border-green-200 text-green-600 hover:bg-green-50' : 'border-red-200 text-red-500 hover:bg-red-50'}`}
          title={isOpen ? 'Close Queue' : 'Open Queue'}
        >
          {isOpen ? '🟢' : '🔴'}
        </button>
        <button
          onClick={() => togglePanel('pin')}
          className={`py-3 px-3 rounded-xl border-2 font-semibold transition-colors text-sm ${activePanel === 'pin' ? 'border-teal-brand bg-teal-brand text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          title="Kiosk PIN"
        >
          🔒
        </button>
        <button
          onClick={() => togglePanel('services')}
          className={`py-3 px-3 rounded-xl border-2 font-semibold transition-colors text-sm ${activePanel === 'services' ? 'border-teal-brand bg-teal-brand text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          title="Manage Services"
        >
          ⚙
        </button>
        <button
          onClick={() => togglePanel('analytics')}
          className={`py-3 px-3 rounded-xl border-2 font-semibold transition-colors text-sm ${activePanel === 'analytics' ? 'border-teal-brand bg-teal-brand text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          title="Analytics"
        >
          📊
        </button>
        <button
          onClick={() => togglePanel('appointments')}
          className={`py-3 px-3 rounded-xl border-2 font-semibold transition-colors text-sm ${activePanel === 'appointments' ? 'border-teal-brand bg-teal-brand text-white' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          title="Appointments"
        >
          📅
        </button>
      </div>

      {/* PIN panel */}
      {activePanel === 'pin' && (
        <div className="bg-white border-t border-gray-200 px-5 py-4 space-y-5">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">Kiosk PIN</p>
            <p className="text-xs text-gray-400 mb-3">Lock the kiosk right now. Leave blank to remove.</p>
            <form onSubmit={handleSetKioskPin} className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                className="flex-1 border-2 border-gray-200 focus:border-teal-brand rounded-xl px-4 py-2 text-gray-900 outline-none transition-colors"
                placeholder="New PIN (blank to clear)"
                value={pinInput}
                onChange={e => setPinInput(e.target.value)}
              />
              <button type="submit" className="px-4 py-2 rounded-xl bg-teal-brand text-white font-semibold hover:bg-teal-dark transition-colors">
                Set
              </button>
            </form>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-1">Default PIN</p>
            <p className="text-xs text-gray-400 mb-3">
              Saved to your account — automatically applied when you log in.
              {hasDefaultPin ? <span className="text-teal-brand ml-1">✓ A default PIN is set</span> : null}
            </p>
            <form onSubmit={handleSetDefaultPin} className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                className="flex-1 border-2 border-gray-200 focus:border-teal-brand rounded-xl px-4 py-2 text-gray-900 outline-none transition-colors"
                placeholder="New default PIN (blank to clear)"
                value={defaultPinInput}
                onChange={e => setDefaultPinInput(e.target.value)}
              />
              <button type="submit" className="px-4 py-2 rounded-xl bg-teal-brand text-white font-semibold hover:bg-teal-dark transition-colors">
                Save
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Services panel */}
      {activePanel === 'services' && (
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
                    <button onClick={() => handleUpdateService(s.id, editingService.name)} className="px-3 py-1.5 bg-teal-brand text-white text-xs rounded-lg">Save</button>
                    <button onClick={() => setEditingService(null)} className="px-2 py-1.5 text-gray-400 text-xs rounded-lg">✕</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-700 py-1">{s.name}</span>
                    <button onClick={() => setEditingService({ id: s.id, name: s.name })} className="text-gray-400 hover:text-teal-brand p-1 text-sm transition-colors" title="Edit">✎</button>
                    <button onClick={() => handleDeleteService(s.id)} className="text-gray-400 hover:text-red-500 p-1 text-sm transition-colors" title="Delete">✕</button>
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
            <button type="submit" disabled={!newService.trim()} className="px-4 py-2 rounded-xl bg-teal-brand text-white text-sm font-semibold disabled:opacity-40 hover:bg-teal-dark transition-colors">
              Add
            </button>
          </form>
        </div>
      )}

      {/* Analytics panel */}
      {activePanel === 'analytics' && (
        <div className="bg-white border-t border-gray-200 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">Analytics (7 days)</p>
            <button onClick={handleLoadAnalytics} className="text-xs text-teal-brand hover:text-teal-dark">Refresh</button>
          </div>
          {analytics ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Served today" value={analytics.totalServedToday} highlight />
                <Stat label="Waiting" value={analytics.currentlyWaiting} />
                <Stat label="Avg wait" value={`${analytics.avgWaitMinutes.toFixed(1)}m`} />
              </div>
              {analytics.csatScore > 0 && (
                <div className="bg-amber-50 rounded-xl px-4 py-3 text-center">
                  <div className="text-2xl font-black text-amber-600">{(analytics.csatScore).toFixed(1)}/3</div>
                  <div className="text-xs text-amber-500 mt-0.5">Satisfaction score</div>
                </div>
              )}
              {analytics.serviceBreakdown.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">By Service</p>
                  <div className="space-y-1.5">
                    {analytics.serviceBreakdown.slice(0, 5).map(s => (
                      <div key={s.serviceType} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 text-gray-700 truncate">{s.serviceType}</span>
                        <span className="font-bold text-teal-brand">{s.count}</span>
                        <span className="text-gray-400 text-xs">{(s.avgDurationSecs / 60).toFixed(1)}m avg</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {analytics.hourlyBreakdown.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Peak Hours</p>
                  <div className="flex gap-1 items-end h-16">
                    {(() => {
                      const max = Math.max(...analytics.hourlyBreakdown.map(h => h.count))
                      return analytics.hourlyBreakdown.map(h => (
                        <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full bg-teal-brand rounded-t"
                            style={{ height: `${Math.max(4, (h.count / max) * 48)}px` }}
                          />
                          <span className="text-gray-400 text-[9px]">{h.hour}h</span>
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">Loading analytics…</p>
          )}
        </div>
      )}

      {/* Appointments panel */}
      {activePanel === 'appointments' && (
        <div className="bg-white border-t border-gray-200 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">Appointments</p>
            <button onClick={handleLoadAppointments} className="text-xs text-teal-brand hover:text-teal-dark">Refresh</button>
          </div>
          {appointments === null ? (
            <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
          ) : appointments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No upcoming appointments</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {appointments.map(a => (
                <div key={a.id} className="border border-gray-100 rounded-xl p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{a.customerName}</p>
                      <p className="text-xs text-gray-500">{a.serviceType}</p>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      a.status === 'confirmed' ? 'bg-blue-50 text-blue-600' :
                      a.status === 'arrived' ? 'bg-amber-50 text-amber-600' :
                      a.status === 'completed' ? 'bg-green-50 text-green-600' :
                      a.status === 'cancelled' ? 'bg-red-50 text-red-500' :
                      'bg-gray-100 text-gray-500'
                    }`}>{a.status}</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {new Date(a.scheduledAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {a.notes && <p className="text-xs text-gray-400 italic">{a.notes}</p>}
                  {a.status === 'pending' && (
                    <div className="flex gap-1.5 pt-1">
                      <button onClick={() => handleUpdateAppointmentStatus(a.id, 'confirmed')} className="flex-1 text-xs py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">Confirm</button>
                      <button onClick={() => handleUpdateAppointmentStatus(a.id, 'cancelled')} className="flex-1 text-xs py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors">Cancel</button>
                    </div>
                  )}
                  {a.status === 'confirmed' && (
                    <div className="flex gap-1.5 pt-1">
                      <button onClick={() => handleUpdateAppointmentStatus(a.id, 'arrived')} className="flex-1 text-xs py-1 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors">Mark Arrived</button>
                      <button onClick={() => handleUpdateAppointmentStatus(a.id, 'cancelled')} className="flex-1 text-xs py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors">Cancel</button>
                    </div>
                  )}
                  {a.status === 'arrived' && (
                    <button onClick={() => handleUpdateAppointmentStatus(a.id, 'completed')} className="w-full text-xs py-1 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors">Complete</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showWalkIn && <WalkInModal services={branchServices.map(s => s.name)} onConfirm={handleWalkIn} onCancel={() => setShowWalkIn(false)} />}

      {/* Transfer modal */}
      {showTransfer && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-40" onClick={() => setShowTransfer(false)}>
          <div className="bg-white w-full max-w-sm mx-auto rounded-t-2xl p-5" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-700 mb-3">Transfer Ticket #{status?.currentTicketNumber} to:</p>
            {branchServices.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No services configured</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {branchServices
                  .filter(s => s.name !== status?.currentServiceType)
                  .map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleTransfer(s.name)}
                      className="py-3 px-4 rounded-xl border-2 border-gray-200 text-gray-700 font-medium hover:border-teal-brand hover:text-teal-brand transition-colors text-sm"
                    >
                      {s.name}
                    </button>
                  ))}
              </div>
            )}
            <button onClick={() => setShowTransfer(false)} className="w-full mt-3 py-2 text-gray-400 text-sm hover:text-gray-600">Cancel</button>
          </div>
        </div>
      )}

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
