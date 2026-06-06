import { useEffect, useRef, useCallback } from 'react'
import type { QueueStatus } from './types'
import { api } from './api'

const POLL_INTERVAL = 3000

interface Options {
  branchId: string
  onQueueAdvanced: (status: QueueStatus) => void
  onConnected: () => void
  onDisconnected: () => void
}

// Polls for queue updates every 3s — more reliable than SignalR through cloud proxies.
export function useQueueHub({ branchId, onQueueAdvanced, onConnected }: Options) {
  const stableAdvanced = useRef(onQueueAdvanced)
  stableAdvanced.current = onQueueAdvanced

  const poll = useCallback(async () => {
    if (!branchId) return
    try {
      const status = await api.getStatus(branchId)
      stableAdvanced.current(status)
    } catch {
      // keep stale state on error
    }
  }, [branchId])

  useEffect(() => {
    if (!branchId) return
    onConnected()
    poll()
    const id = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [branchId, onConnected, poll])
}
