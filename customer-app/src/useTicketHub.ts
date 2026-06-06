import { useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'

const HUB_URL = `${import.meta.env.VITE_API_URL ?? ''}/hubs/queue`

interface Options {
  branchId: string
  onUpdate: () => void
}

// Subscribes to branch-level SignalR events and calls onUpdate so the
// ticket page can refetch its own state after any queue change.
export function useTicketHub({ branchId, onUpdate }: Options) {
  const connRef = useRef<signalR.HubConnection | null>(null)
  const stableUpdate = useRef(onUpdate)
  stableUpdate.current = onUpdate

  const connect = useCallback(async () => {
    if (connRef.current) await connRef.current.stop()

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL, { transport: signalR.HttpTransportType.LongPolling })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    conn.on('QueueAdvanced', () => stableUpdate.current())
    conn.on('TicketUpdated', () => stableUpdate.current())

    conn.onreconnected(async () => {
      await conn.invoke('JoinBranch', branchId)
      stableUpdate.current()
    })

    try {
      await conn.start()
      await conn.invoke('JoinBranch', branchId)
      connRef.current = conn
    } catch {
      // silent — will retry via withAutomaticReconnect
    }
  }, [branchId])

  useEffect(() => {
    connect()
    return () => { connRef.current?.stop() }
  }, [connect])
}
