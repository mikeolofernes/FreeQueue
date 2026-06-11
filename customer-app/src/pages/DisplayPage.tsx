import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import type { BranchResponse, QueueStatus } from '../types'

const POLL_MS = 4000

export function DisplayPage() {
  const [params] = useSearchParams()
  const branchId = params.get('branch') ?? ''

  const [branch, setBranch] = useState<BranchResponse | null>(null)
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [live, setLive] = useState(true)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    if (!branchId) return
    api.getBranch(branchId).then(setBranch).catch(() => {})
  }, [branchId])

  const poll = useCallback(async () => {
    if (!branchId) return
    try {
      setStatus(await api.getStatus(branchId))
      setLive(true)
    } catch {
      setLive(false)
    }
  }, [branchId])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!branchId) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 text-xl">No branch configured. Add ?branch=ID to the URL.</p>
      </div>
    )
  }

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col select-none overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-12 py-6 border-b border-gray-800">
        <div>
          <p className="text-teal-400 text-sm font-semibold uppercase tracking-widest">Queue Display</p>
          <h1 className="text-2xl font-bold text-white mt-0.5">{branch?.name ?? branchId}</h1>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div className={`w-2 h-2 rounded-full ${live ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-gray-400 text-sm">{live ? 'Live' : 'Reconnecting…'}</span>
          <span className="text-white text-2xl font-bold ml-4 tabular-nums">{timeStr}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center gap-0">
        {/* Now Serving */}
        <div className="flex-1 flex flex-col items-center justify-center px-12 border-r border-gray-800">
          <p className="text-gray-400 text-lg font-semibold uppercase tracking-widest mb-6">Now Serving</p>
          {status?.currentTicketNumber != null ? (
            <>
              <div className="text-[12rem] font-black text-teal-400 leading-none tabular-nums">
                {String(status.currentTicketNumber).padStart(3, '0')}
              </div>
              {status.currentServiceType && (
                <p className="text-gray-300 text-2xl font-medium mt-4">{status.currentServiceType}</p>
              )}
            </>
          ) : (
            <div className="text-[12rem] font-black text-gray-700 leading-none">—</div>
          )}
        </div>

        {/* Stats panel */}
        <div className="flex flex-col gap-8 px-16 py-12 min-w-[320px]">
          <Stat
            label="Waiting"
            value={status?.peopleWaiting ?? '—'}
            unit={status?.peopleWaiting === 1 ? 'person' : 'people'}
          />
          <Stat
            label="Est. Wait"
            value={status?.waitEstimate ? `~${status.waitEstimate.estimatedMinutes}` : '—'}
            unit={status?.waitEstimate ? 'min' : ''}
          />
          <Stat
            label="Served Today"
            value={status?.servedToday ?? '—'}
            unit=""
          />
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-4 border-t border-gray-800">
        <p className="text-gray-600 text-sm">Scan the QR code at the entrance to join the queue</p>
      </div>
    </div>
  )
}

function Stat({ label, value, unit }: { label: string; value: string | number; unit: string }) {
  return (
    <div className="text-center">
      <p className="text-gray-500 text-sm font-semibold uppercase tracking-widest mb-1">{label}</p>
      <p className="text-5xl font-black text-white tabular-nums">{value}</p>
      {unit && <p className="text-gray-400 text-base mt-0.5">{unit}</p>}
    </div>
  )
}
