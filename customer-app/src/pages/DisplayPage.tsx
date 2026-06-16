import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useQueueHub } from '../staff/useQueueHub'
import type { QueueStatus, GroupStatusItem } from '../types'

export function DisplayPage() {
  const [params] = useSearchParams()
  const branchId = params.get('branch') ?? ''
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [groupsStatus, setGroupsStatus] = useState<GroupStatusItem[]>([])
  const [connected, setConnected] = useState(false)

  const refreshAll = useCallback(async () => {
    if (!branchId) return
    try {
      const [s, g] = await Promise.all([
        api.getStatusPublic(branchId),
        api.getGroupsStatus(branchId),
      ])
      setStatus(s)
      setGroupsStatus(g)
    } catch { /* keep stale */ }
  }, [branchId])

  useQueueHub({
    branchId,
    onQueueAdvanced: () => { refreshAll() },
    onConnected: () => { setConnected(true); refreshAll() },
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

  const hasGroups = groupsStatus.some(g => g.groupId !== null)
  const upNext = (status?.nextTicketNumbers ?? []).slice(0, 3)

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8 gap-8 select-none">
      {/* Header */}
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

      {hasGroups ? (
        /* Multi-group display */
        <div className="w-full max-w-7xl">
          <p className="text-gray-400 text-xl font-semibold uppercase tracking-widest text-center mb-6">Now Serving</p>
          <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${Math.min(groupsStatus.filter(g => g.groupId !== null).length, 4)}, 1fr)` }}>
            {groupsStatus.filter(g => g.groupId !== null).map(group => (
              <div key={group.groupId} className="bg-gray-800 rounded-2xl p-6 flex flex-col gap-4">
                <div className="text-center border-b border-gray-700 pb-4">
                  <p className="text-gray-300 text-lg font-bold uppercase tracking-wide">{group.groupName}</p>
                  {group.prefix && (
                    <p className="text-gray-500 text-sm mt-1">Series {group.prefix}</p>
                  )}
                </div>

                {group.nowServing.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {group.nowServing.map((entry, i) => (
                      <div key={i} className="text-center">
                        <div className="text-7xl font-black leading-none tabular-nums text-white">
                          {entry.displayNumber}
                        </div>
                        {entry.counterId && (
                          <p className="text-teal-400 text-sm mt-1">Counter {entry.counterId}</p>
                        )}
                        {entry.serviceType && (
                          <p className="text-gray-400 text-xs mt-0.5">{entry.serviceType}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-6xl font-black leading-none text-gray-600">—</div>
                )}

                <div className="text-center border-t border-gray-700 pt-3">
                  <span className="text-teal-400 text-2xl font-black">{group.peopleWaiting}</span>
                  <span className="text-gray-500 text-sm ml-2">waiting</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Single-queue display (no groups) */
        <>
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
        </>
      )}

      {/* Overall stats */}
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
