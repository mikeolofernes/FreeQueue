import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from './api'
import { useQueueHub } from './useQueueHub'
import { BranchSetup } from './components/BranchSetup'
import { WalkInModal } from './components/WalkInModal'
import { ElapsedTimer } from './components/ElapsedTimer'
import type { QueueStatus } from './types'

const BRANCH_KEY = 'fq_branch_id'
const BRANCH_NAME_KEY = 'fq_branch_name'

export default function App() {
  const [branchId, setBranchId] = useState(() => localStorage.getItem(BRANCH_KEY) ?? '')
  const [branchName, setBranchName] = useState(() => localStorage.getItem(BRANCH_NAME_KEY) ?? '')
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [connected, setConnected] = useState(false)
  const [servingStartedAt, setServingStartedAt] = useState<Date | null>(null)
  const [showWalkIn, setShowWalkIn] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const prevTicket = useRef<number | null>(null)

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!branchId) return
    try {
      const s = await api.getStatus(branchId)
      setStatus(s)
    } catch {
      // keep stale state on transient errors
    }
  }, [branchId])

  // When queue advances via SignalR, update state
  const handleQueueAdvanced = useCallback((s: QueueStatus) => {
    setStatus(s)
  }, [])

  // Reset serving timer when the current ticket changes
  useEffect(() => {
    if (!status) return
    if (status.currentTicketNumber !== prevTicket.current) {
      prevTicket.current = status.currentTicketNumber
      setServingStartedAt(status.currentTicketNumber != null ? new Date() : null)
    }
  }, [status?.currentTicketNumber])

  // Initial load
  useEffect(() => {
    if (branchId) refreshStatus()
  }, [branchId, refreshStatus])

  useQueueHub({
    branchId,
    onQueueAdvanced: handleQueueAdvanced,
    onConnected: () => { setConnected(true); refreshStatus() },
    onDisconnected: () => setConnected(false),
  })

  function handleBranchConfirm(id: string, name: string) {
    localStorage.setItem(BRANCH_KEY, id)
    localStorage.setItem(BRANCH_NAME_KEY, name)
    setBranchId(id)
    setBranchName(name)
  }

  async function handleAdvance() {
    if (!status?.currentTicketNumber || !status.currentServiceType || advancing) return
    const duration = servingStartedAt
      ? Math.floor((Date.now() - servingStartedAt.getTime()) / 1000)
      : 0

    setAdvancing(true)
    try {
      const next = await api.advance(branchId, status.currentTicketNumber, status.currentServiceType, duration)
      setStatus(next)
      showToast(`✓ Ticket #${status.currentTicketNumber} done — called next`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to advance', 'err')
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

  if (!branchId) return <BranchSetup onConfirm={handleBranchConfirm} />

  const isServing = status?.currentTicketNumber != null
  const queueEmpty = !isServing && (status?.peopleWaiting ?? 0) === 0

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-sm mx-auto">
      {/* Header */}
      <header className="bg-teal-brand text-white px-5 py-4 flex items-center justify-between shadow-md">
        <div>
          <h1 className="font-bold text-lg leading-none">QueueFree</h1>
          <p className="text-teal-light text-sm mt-0.5 truncate max-w-[180px]">{branchName || branchId}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-400'}`} />
          <span className="text-xs text-teal-light">{connected ? 'Live' : 'Offline'}</span>
          <button
            onClick={() => { localStorage.removeItem(BRANCH_KEY); localStorage.removeItem(BRANCH_NAME_KEY); setBranchId('') }}
            className="ml-3 text-teal-light hover:text-white text-xs underline"
          >
            Change
          </button>
        </div>
      </header>

      {/* Stats bar */}
      {status && (
        <div className="bg-white border-b border-gray-100 px-5 py-3 flex justify-between text-sm">
          <Stat label="Waiting" value={status.peopleWaiting} />
          <Stat label="Served today" value={status.servedToday} highlight />
          <Stat label="Est. / person" value={status.waitEstimate ? `${status.waitEstimate.estimatedMinutes}m` : '—'} />
        </div>
      )}

      {/* Main serving card */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
        {queueEmpty ? (
          <div className="text-center space-y-2">
            <div className="text-5xl">🎉</div>
            <p className="text-xl font-bold text-gray-700">Queue is empty</p>
            <p className="text-gray-400 text-sm">Add a walk-in to get started</p>
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
            <p className="text-gray-400 text-sm">Tap the button to call the next customer</p>
            <p className="text-2xl font-bold text-gray-600">{status?.peopleWaiting} waiting</p>
          </div>
        )}

        {/* Elapsed timer */}
        {isServing && <ElapsedTimer startedAt={servingStartedAt} />}

        {/* MAIN BUTTON */}
        <button
          onClick={handleAdvance}
          disabled={advancing || queueEmpty}
          className="w-full py-6 rounded-2xl bg-teal-brand hover:bg-teal-dark active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xl font-bold shadow-lg transition-all tap-active"
        >
          {advancing
            ? 'Advancing…'
            : isServing
              ? '✓  Done — Call Next'
              : '▶  Call First Customer'}
        </button>
      </div>

      {/* Bottom actions */}
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
      </div>

      {/* Walk-in modal */}
      {showWalkIn && <WalkInModal onConfirm={handleWalkIn} onCancel={() => setShowWalkIn(false)} />}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium z-50 transition-all ${
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
