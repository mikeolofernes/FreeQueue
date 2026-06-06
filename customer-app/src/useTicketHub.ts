import { useEffect, useRef } from 'react'

const POLL_INTERVAL = 3000

interface Options {
  branchId: string
  onUpdate: () => void
}

export function useTicketHub({ branchId, onUpdate }: Options) {
  const stableUpdate = useRef(onUpdate)
  stableUpdate.current = onUpdate
  const fetching = useRef(false)

  useEffect(() => {
    if (!branchId) return
    const id = setInterval(() => {
      if (fetching.current) return
      fetching.current = true
      Promise.resolve(stableUpdate.current()).finally(() => { fetching.current = false })
    }, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [branchId])
}
