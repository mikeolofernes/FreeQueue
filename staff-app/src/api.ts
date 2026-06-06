import type { QueueStatus, TicketResponse, UndoResponse } from './types'

// Vite proxy forwards /api and /hubs to localhost:5000 in dev.
// In production, set VITE_API_URL to your deployed API base URL.
const BASE = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  getStatus: (branchId: string) =>
    request<QueueStatus>(`/api/queue/${encodeURIComponent(branchId)}/status`),

  advance: (branchId: string, ticketNumber: number, serviceType: string, durationSecs: number) =>
    request<QueueStatus>('/api/queue/advance', {
      method: 'POST',
      body: JSON.stringify({ branchId, ticketNumber, serviceType, durationSecs }),
    }),

  addWalkIn: (branchId: string, serviceType: string, customerName?: string) =>
    request<TicketResponse>('/api/queue/walkin', {
      method: 'POST',
      body: JSON.stringify({ branchId, serviceType, customerName }),
    }),

  undo: (branchId: string) =>
    request<UndoResponse>(`/api/queue/${encodeURIComponent(branchId)}/undo`, { method: 'POST' }),

  createBranch: (id: string, name: string) =>
    request('/api/branches', {
      method: 'POST',
      body: JSON.stringify({ id, name, maxCapacity: 50, graceMinutes: 15 }),
    }),
}
