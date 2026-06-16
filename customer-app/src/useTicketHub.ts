import { useState, useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'

const HUB_URL = `${import.meta.env.VITE_API_URL ?? ''}/hubs/queue`

interface Options {
  branchId: string
  onUpdate: () => void
}

export function useTicketHub({ branchId, onUpdate }: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false)
  const connRef = useRef<signalR.HubConnection | null>(null)
  const stableUpdate = useRef(onUpdate)
  stableUpdate.current = onUpdate

  const connect = useCallback(async () => {
    if (connRef.current) await connRef.current.stop()

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    conn.on('QueueAdvanced', () => stableUpdate.current())
    conn.on('TicketUpdated', () => stableUpdate.current())

    conn.onreconnecting(() => setConnected(false))
    conn.onclose(() => setConnected(false))
    conn.onreconnected(async () => {
      await conn.invoke('JoinBranch', branchId)
      setConnected(true)
      stableUpdate.current()
    })

    try {
      await conn.start()
      await conn.invoke('JoinBranch', branchId)
      connRef.current = conn
      setConnected(true)
    } catch {
      setConnected(false)
    }
  }, [branchId])

  useEffect(() => {
    connect()
    return () => { connRef.current?.stop() }
  }, [connect])

  return { connected }
}
