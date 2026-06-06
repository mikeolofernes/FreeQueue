import type { QueueStatus, TicketResponse, UndoResponse } from './types'

const BASE = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'fq_staff_token'

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = auth.getToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  })
  if (res.status === 401) {
    auth.clearToken()
    window.location.reload()
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  login: (branchId: string, username: string, password: string) =>
    request<{ token: string; branchId: string; username: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ branchId, username, password }),
    }),

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

  setupStaffAccount: (branchId: string, username: string, password: string) =>
    request('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ branchId, username, password }),
    }),
}
