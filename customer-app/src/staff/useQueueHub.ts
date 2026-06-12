import { useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import type { QueueStatus } from '../types'

const HUB_URL = `${import.meta.env.VITE_API_URL ?? ''}/hubs/queue`

interface Options {
  branchId: string
  onQueueAdvanced: (status: QueueStatus) => void
  onConnected: () => void
  onDisconnected: () => void
}

export function useQueueHub({ branchId, onQueueAdvanced, onConnected, onDisconnected }: Options) {
  const connRef = useRef<signalR.HubConnection | null>(null)

  const stableAdvanced = useRef(onQueueAdvanced)
  stableAdvanced.current = onQueueAdvanced

  const connect = useCallback(async () => {
    if (connRef.current) {
      await connRef.current.stop()
    }

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    conn.on('QueueAdvanced', (status: QueueStatus) => stableAdvanced.current(status))

    conn.onclose(() => onDisconnected())
    conn.onreconnecting(() => onDisconnected())
    conn.onreconnected(async () => {
      await conn.invoke('JoinBranch', branchId)
      onConnected()
    })

    try {
      await conn.start()
      await conn.invoke('JoinBranch', branchId)
      connRef.current = conn
      onConnected()
    } catch {
      onDisconnected()
    }
  }, [branchId, onConnected, onDisconnected])

  useEffect(() => {
    connect()
    return () => {
      connRef.current?.stop()
    }
  }, [connect])
}
