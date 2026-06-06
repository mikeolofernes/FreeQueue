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

export function useQueueHub({ branchId, onQueueAdvanced, onConnected }: Options) {
  const stableAdvanced = useRef(onQueueAdvanced)
  const stableConnected = useRef(onConnected)
  stableAdvanced.current = onQueueAdvanced
  stableConnected.current = onConnected

  const fetching = useRef(false)

  const poll = useCallback(async () => {
    if (!branchId || fetching.current) return
    fetching.current = true
    try {
      const status = await api.getStatus(branchId)
      stableAdvanced.current(status)
    } catch {
      // keep stale state
    } finally {
      fetching.current = false
    }
  }, [branchId])

  useEffect(() => {
    if (!branchId) return
    stableConnected.current()
    poll()
    const id = setInterval(poll, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [branchId, poll]) // onConnected intentionally excluded — stable ref used instead
}
