import type { BranchResponse, TicketResponse, QueueStatus, UndoResponse } from './types'

const BASE = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'fq_staff_token'

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
}

async function request<T>(path: string, init?: RequestInit, withAuth = false): Promise<T> {
  const token = withAuth ? auth.getToken() : null
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  })
  if (withAuth && res.status === 401) {
    auth.clearToken()
    window.location.reload()
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null as T
  return res.json() as Promise<T>
}

export const api = {
  // Customer
  getBranch: (branchId: string) =>
    request<BranchResponse>(`/api/branches/${encodeURIComponent(branchId)}`),

  kioskJoin: (branchId: string, serviceType: string, customerName: string, phone: string, kioskPin?: string) =>
    request<TicketResponse>(`/api/queue/${encodeURIComponent(branchId)}/kiosk-join`, {
      method: 'POST',
      body: JSON.stringify({ serviceType, customerName, phone, kioskPin }),
    }),

  getTicket: (ticketId: number) =>
    request<TicketResponse>(`/api/queue/ticket/${ticketId}`),

  ticketViewed: (ticketId: number, vt?: string) =>
    request<void>(`/api/queue/ticket/${ticketId}/viewed${vt ? `?vt=${encodeURIComponent(vt)}` : ''}`, { method: 'POST' }),

  skip: (ticketId: number) =>
    request<void>(`/api/queue/ticket/${ticketId}/skip`, { method: 'POST' }),

  leave: (ticketId: number, vt?: string) =>
    request<void>(`/api/queue/ticket/${ticketId}/leave${vt ? `?vt=${encodeURIComponent(vt)}` : ''}`, { method: 'POST' }),

  rateTicket: (ticketId: number, rating: number) =>
    request<void>(`/api/queue/ticket/${ticketId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }),

  getStatusPublic: (branchId: string) =>
    request<QueueStatus>(`/api/queue/${encodeURIComponent(branchId)}/status`),

  lookupCustomer: (phone: string) =>
    request<{ name: string | null }>(`/api/queue/customer/lookup?phone=${encodeURIComponent(phone)}`),

  // Staff (authenticated)
  login: (branchId: string, username: string, password: string) =>
    request<{ token: string; branchId: string; username: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ branchId, username, password }),
    }),

  getStatus: (branchId: string) =>
    request<QueueStatus>(`/api/queue/${encodeURIComponent(branchId)}/status`, undefined, true),

  callNext: (branchId: string) =>
    request<QueueStatus>(`/api/queue/${encodeURIComponent(branchId)}/callnext`, { method: 'POST' }, true),

  advance: (branchId: string, ticketNumber: number, serviceType: string, durationSecs: number) =>
    request<QueueStatus>('/api/queue/advance', {
      method: 'POST',
      body: JSON.stringify({ branchId, ticketNumber, serviceType, durationSecs }),
    }, true),

  addWalkIn: (branchId: string, serviceType: string, customerName?: string) =>
    request<TicketResponse>('/api/queue/walkin', {
      method: 'POST',
      body: JSON.stringify({ branchId, serviceType, customerName }),
    }, true),

  undo: (branchId: string) =>
    request<UndoResponse>(`/api/queue/${encodeURIComponent(branchId)}/undo`, { method: 'POST' }, true),

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

  setKioskPin: (branchId: string, pin: string | null) =>
    request(`/api/branches/${encodeURIComponent(branchId)}/kiosk-pin`, {
      method: 'PUT',
      body: JSON.stringify({ pin }),
    }, true),
}
