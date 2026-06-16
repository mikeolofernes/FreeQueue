import { useEffect, useRef, useCallback } from 'react'
import * as signalR from '@microsoft/signalr'
import type { QueueStatus } from '../types'

const HUB_URL = `${import.meta.env.VITE_API_URL ?? ''}/hubs/queue`

interface Options {
  branchId: string
  onQueueAdvanced: (status: QueueStatus) => void
  onConnected: () => void
  onDisconnected: () => void
  onBranchStatusChanged?: (isOpen: boolean) => void
}

export function useQueueHub({ branchId, onQueueAdvanced, onConnected, onDisconnected, onBranchStatusChanged }: Options) {
  const connRef = useRef<signalR.HubConnection | null>(null)

  const stableAdvanced = useRef(onQueueAdvanced)
  stableAdvanced.current = onQueueAdvanced
  const stableConnected = useRef(onConnected)
  stableConnected.current = onConnected
  const stableDisconnected = useRef(onDisconnected)
  stableDisconnected.current = onDisconnected
  const stableBranchStatus = useRef(onBranchStatusChanged)
  stableBranchStatus.current = onBranchStatusChanged

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
    conn.on('BranchStatusChanged', ({ isOpen }: { branchId: string; isOpen: boolean }) => {
      stableBranchStatus.current?.(isOpen)
    })

    conn.onclose(() => stableDisconnected.current())
    conn.onreconnecting(() => stableDisconnected.current())
    conn.onreconnected(async () => {
      await conn.invoke('JoinBranch', branchId)
      stableConnected.current()
    })

    try {
      await conn.start()
      await conn.invoke('JoinBranch', branchId)
      connRef.current = conn
      stableConnected.current()
    } catch {
      stableDisconnected.current()
    }
  }, [branchId])

  useEffect(() => {
    connect()
    return () => {
      connRef.current?.stop()
    }
  }, [connect])
}
