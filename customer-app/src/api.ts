import type { BranchResponse, TicketResponse } from './types'

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
  getBranch: (branchId: string) =>
    request<BranchResponse>(`/api/branches/${encodeURIComponent(branchId)}`),

  joinQueue: (branchId: string, serviceType: string, customerName: string, phone: string) =>
    request<TicketResponse>('/api/queue/join', {
      method: 'POST',
      body: JSON.stringify({ branchId, serviceType, customerName, phone }),
    }),

  getTicket: (ticketId: number) =>
    request<TicketResponse>(`/api/queue/ticket/${ticketId}`),

  stepAway: (ticketId: number) =>
    request<void>(`/api/queue/ticket/${ticketId}/stepaway`, { method: 'POST' }),

  checkIn: (ticketId: number) =>
    request<void>(`/api/queue/ticket/${ticketId}/checkin`, { method: 'POST' }),

  skip: (ticketId: number) =>
    request<void>(`/api/queue/ticket/${ticketId}/skip`, { method: 'POST' }),

  leave: (ticketId: number) =>
    request<void>(`/api/queue/ticket/${ticketId}/leave`, { method: 'POST' }),
}
