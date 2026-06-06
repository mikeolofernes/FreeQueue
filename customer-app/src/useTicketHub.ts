import { useEffect, useRef } from 'react'

const POLL_INTERVAL = 3000

interface Options {
  branchId: string
  onUpdate: () => void
}

// Polls for queue updates every 3s — more reliable than SignalR through cloud proxies.
export function useTicketHub({ branchId, onUpdate }: Options) {
  const stableUpdate = useRef(onUpdate)
  stableUpdate.current = onUpdate

  useEffect(() => {
    if (!branchId) return
    const id = setInterval(() => stableUpdate.current(), POLL_INTERVAL)
    return () => clearInterval(id)
  }, [branchId])
}
