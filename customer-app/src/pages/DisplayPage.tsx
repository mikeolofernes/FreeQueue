import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useQueueHub } from '../staff/useQueueHub'
import type { QueueStatus } from '../types'

export function DisplayPage() {
  const [params] = useSearchParams()
  const branchId = params.get('branch') ?? ''
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [connected, setConnected] = useState(false)

  const refreshStatus = useCallback(async () => {
    if (!branchId) return
    try { setStatus(await api.getStatusPublic(branchId)) } catch { /* keep stale */ }
  }, [branchId])

  useQueueHub({
    branchId,
    onQueueAdvanced: s => setStatus(s),
    onConnected: () => { setConnected(true); refreshStatus() },
    onDisconnected: () => setConnected(false),
    onBranchStatusChanged: isOpen => setStatus(s => s ? { ...s, isOpen } : s),
  })

  if (!branchId) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Add <code>?branch=your-branch-id</code> to the URL.</p>
      </div>
    )
  }

  const upNext = (status?.nextTicketNumbers ?? []).slice(0, 3)

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-12 gap-10 select-none">
      <div className="text-center">
        <p className="text-gray-400 text-sm uppercase tracking-widest font-semibold">{branchId}</p>
        <div className={`mt-2 inline-flex items-center gap-2 text-xs ${connected ? 'text-green-400' : 'text-gray-500'}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-500'}`} />
          {connected ? 'Live' : 'Connecting…'}
        </div>
        {status && !status.isOpen && (
          <div className="mt-3 px-4 py-2 bg-red-500/20 rounded-full">
            <span className="text-red-400 text-sm font-medium">Queue Closed</span>
          </div>
        )}
      </div>

      <div className="text-center">
        <p className="text-gray-400 text-xl font-semibold uppercase tracking-widest mb-4">Now Serving</p>
        {status?.currentTicketNumber != null ? (
          <>
            <div className="text-[220px] font-black leading-none tabular-nums">
              {status.currentDisplayNumber ?? `#${status.currentTicketNumber}`}
            </div>
            <p className="text-gray-300 text-2xl mt-2">{status.currentServiceType}</p>
            {status.counterId && (
              <p className="text-teal-400 text-lg mt-1">Counter {status.counterId}</p>
            )}
          </>
        ) : (
          <div className="text-[120px] font-black leading-none text-gray-600">—</div>
        )}
      </div>

      {/* Next up tickets */}
      {upNext.length > 0 && (
        <div className="text-center">
          <p className="text-gray-500 text-sm uppercase tracking-widest mb-3">Next Up</p>
          <div className="flex gap-6 justify-center">
            {upNext.map((num, i) => {
              const display = status?.nextDisplayNumbers?.[i] ?? `#${num}`
              return (
                <div key={num} className={`text-center ${i === 0 ? 'opacity-100' : 'opacity-50'}`}>
                  <div className="text-5xl font-black tabular-nums text-gray-300">{display}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-16 text-center">
        <div>
          <div className="text-5xl font-black text-teal-400">{status?.peopleWaiting ?? 0}</div>
          <div className="text-gray-400 text-sm uppercase tracking-wide mt-1">Waiting</div>
        </div>
        {status?.waitEstimate && (
          <div>
            <div className="text-5xl font-black text-amber-400">~{status.waitEstimate.estimatedMinutes}m</div>
            <div className="text-gray-400 text-sm uppercase tracking-wide mt-1">Est. wait</div>
          </div>
        )}
        <div>
          <div className="text-5xl font-black text-gray-300">{status?.servedToday ?? 0}</div>
          <div className="text-gray-400 text-sm uppercase tracking-wide mt-1">Served today</div>
        </div>
      </div>
    </div>
  )
}
