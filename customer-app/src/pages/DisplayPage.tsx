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
  })

  if (!branchId) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Add <code>?branch=your-branch-id</code> to the URL.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-12 gap-10 select-none">
      <div className="text-center">
        <p className="text-gray-400 text-sm uppercase tracking-widest font-semibold">{branchId}</p>
        <div className={`mt-2 inline-flex items-center gap-2 text-xs ${connected ? 'text-green-400' : 'text-gray-500'}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-500'}`} />
          {connected ? 'Live' : 'Connecting…'}
        </div>
      </div>

      <div className="text-center">
        <p className="text-gray-400 text-xl font-semibold uppercase tracking-widest mb-4">Now Serving</p>
        {status?.currentTicketNumber != null ? (
          <>
            <div className="text-[220px] font-black leading-none tabular-nums">
              #{status.currentTicketNumber}
            </div>
            <p className="text-gray-300 text-2xl mt-2">{status.currentServiceType}</p>
          </>
        ) : (
          <div className="text-[120px] font-black leading-none text-gray-600">—</div>
        )}
      </div>

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
