import type { BranchResponse, TicketResponse, QueueStatus, UndoResponse, BranchService, ServiceGroup, AdminBranch, AdminAccount, AnalyticsData, Appointment } from './types'

const BASE = import.meta.env.VITE_API_URL ?? ''
const TOKEN_KEY = 'fq_staff_token'
const ADMIN_TOKEN_KEY = 'fq_admin_token'

const vt = (token?: string) => token ? `?vt=${encodeURIComponent(token)}` : ''

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
}

export const adminAuth = {
  getToken: () => localStorage.getItem(ADMIN_TOKEN_KEY),
  setToken: (t: string) => localStorage.setItem(ADMIN_TOKEN_KEY, t),
  clearToken: () => localStorage.removeItem(ADMIN_TOKEN_KEY),
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
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = adminAuth.getToken()
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...init,
  })
  if (res.status === 401) {
    adminAuth.clearToken()
    window.location.href = '/admin'
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
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

  ticketViewed: (ticketId: number, token?: string) =>
    request<void>(`/api/queue/ticket/${ticketId}/viewed${vt(token)}`, { method: 'POST' }),

  skip: (ticketId: number) =>
    request<void>(`/api/queue/ticket/${ticketId}/skip`, { method: 'POST' }, true),

  leave: (ticketId: number, token?: string) =>
    request<void>(`/api/queue/ticket/${ticketId}/leave${vt(token)}`, { method: 'POST' }),

  rateTicket: (ticketId: number, rating: number, token?: string) =>
    request<void>(`/api/queue/ticket/${ticketId}/rate${vt(token)}`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }),

  getStatusPublic: (branchId: string) =>
    request<QueueStatus>(`/api/queue/${encodeURIComponent(branchId)}/status`),

  lookupCustomer: (phone: string) =>
    request<{ name: string | null }>(`/api/queue/customer/lookup?phone=${encodeURIComponent(phone)}`),

  getServices: (branchId: string) =>
    request<BranchService[]>(`/api/branches/${encodeURIComponent(branchId)}/services`),

  verifyKioskPin: (branchId: string, pin: string) =>
    request(`/api/branches/${encodeURIComponent(branchId)}/kiosk-verify`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  // Appointments (public)
  bookAppointment: (branchId: string, serviceType: string, customerName: string, phone: string | null, scheduledAt: string, notes?: string) =>
    request<Appointment>(`/api/appointments/${encodeURIComponent(branchId)}`, {
      method: 'POST',
      body: JSON.stringify({ serviceType, customerName, phone, scheduledAt, notes }),
    }),

  getUpcomingAppointments: (branchId: string) =>
    request<Appointment[]>(`/api/appointments/${encodeURIComponent(branchId)}`),

  // Staff (authenticated)
  login: (username: string, password: string) =>
    request<{ token: string; branchId: string; username: string; role: string; hasDefaultPin: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  setDefaultPin: (pin: string | null) =>
    request<void>('/api/auth/default-pin', {
      method: 'PUT',
      body: JSON.stringify({ pin }),
    }, true),

  getStatus: (branchId: string) =>
    request<QueueStatus>(`/api/queue/${encodeURIComponent(branchId)}/status`, undefined, true),

  callNext: (branchId: string, counterId?: string) =>
    request<QueueStatus>(`/api/queue/${encodeURIComponent(branchId)}/callnext${counterId ? `?counterId=${encodeURIComponent(counterId)}` : ''}`, { method: 'POST' }, true),

  advance: (branchId: string, ticketNumber: number, serviceType: string, durationSecs: number, counterId?: string) =>
    request<QueueStatus>('/api/queue/advance', {
      method: 'POST',
      body: JSON.stringify({ branchId, ticketNumber, serviceType, durationSecs, counterId }),
    }, true),

  addWalkIn: (branchId: string, serviceType: string, customerName?: string, priority = false) =>
    request<TicketResponse>('/api/queue/walkin', {
      method: 'POST',
      body: JSON.stringify({ branchId, serviceType, customerName, priority }),
    }, true),

  undo: (branchId: string) =>
    request<UndoResponse>(`/api/queue/${encodeURIComponent(branchId)}/undo`, { method: 'POST' }, true),

  noShow: (ticketId: number) =>
    request<void>(`/api/queue/ticket/${ticketId}/no-show`, { method: 'POST' }, true),

  transferTicket: (ticketId: number, newServiceType: string) =>
    request<TicketResponse>(`/api/queue/ticket/${ticketId}/transfer`, {
      method: 'PUT',
      body: JSON.stringify({ newServiceType }),
    }, true),

  toggleQueueOpen: (branchId: string) =>
    request<{ isOpen: boolean }>(`/api/branches/${encodeURIComponent(branchId)}/toggle-open`, { method: 'POST' }, true),

  setKioskPin: (branchId: string, pin: string | null) =>
    request(`/api/branches/${encodeURIComponent(branchId)}/kiosk-pin`, {
      method: 'PUT',
      body: JSON.stringify({ pin }),
    }, true),

  addService: (branchId: string, name: string) =>
    request<BranchService>(`/api/branches/${encodeURIComponent(branchId)}/services`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }, true),

  updateService: (branchId: string, serviceId: number, name: string) =>
    request<BranchService>(`/api/branches/${encodeURIComponent(branchId)}/services/${serviceId}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    }, true),

  deleteService: (branchId: string, serviceId: number) =>
    request<void>(`/api/branches/${encodeURIComponent(branchId)}/services/${serviceId}`, {
      method: 'DELETE',
    }, true),

  // Service Groups
  getGroups: (branchId: string) =>
    request<ServiceGroup[]>(`/api/branches/${encodeURIComponent(branchId)}/groups`),

  createGroup: (branchId: string, name: string, prefix?: string) =>
    request<ServiceGroup>(`/api/branches/${encodeURIComponent(branchId)}/groups`, {
      method: 'POST',
      body: JSON.stringify({ name, prefix }),
    }, true),

  updateGroup: (branchId: string, groupId: number, name: string, prefix?: string | null) =>
    request<ServiceGroup>(`/api/branches/${encodeURIComponent(branchId)}/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, prefix }),
    }, true),

  deleteGroup: (branchId: string, groupId: number) =>
    request<void>(`/api/branches/${encodeURIComponent(branchId)}/groups/${groupId}`, {
      method: 'DELETE',
    }, true),

  assignServiceToGroup: (branchId: string, groupId: number, serviceId: number) =>
    request<void>(`/api/branches/${encodeURIComponent(branchId)}/groups/${groupId}/services/${serviceId}`, {
      method: 'PUT',
    }, true),

  removeServiceFromGroup: (branchId: string, groupId: number, serviceId: number) =>
    request<void>(`/api/branches/${encodeURIComponent(branchId)}/groups/${groupId}/services/${serviceId}`, {
      method: 'DELETE',
    }, true),

  getAnalytics: (branchId: string, days = 7) =>
    request<AnalyticsData>(`/api/analytics/${encodeURIComponent(branchId)}?days=${days}`, undefined, true),

  getAppointments: (branchId: string) =>
    request<Appointment[]>(`/api/appointments/${encodeURIComponent(branchId)}`, undefined, true),

  updateAppointmentStatus: (branchId: string, id: number, status: string) =>
    request<Appointment>(`/api/appointments/${encodeURIComponent(branchId)}/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }, true),
}

export const adminApi = {
  needsSetup: () =>
    request<{ needsSetup: boolean }>('/api/admin/needs-setup'),

  setup: (branchId: string, branchName: string, username: string, password: string) =>
    request<void>('/api/admin/setup', {
      method: 'POST',
      body: JSON.stringify({ branchId, branchName, username, password }),
    }),

  getOverview: () =>
    adminRequest<AdminBranch[]>('/api/admin/overview'),

  createBranch: (id: string, name: string) =>
    adminRequest<AdminBranch>('/api/admin/branches', {
      method: 'POST',
      body: JSON.stringify({ id, name }),
    }),

  createAccount: (branchId: string, username: string, password: string, role: string = 'staff') =>
    adminRequest<AdminAccount>('/api/admin/accounts', {
      method: 'POST',
      body: JSON.stringify({ branchId, username, password, role }),
    }),

  resetPassword: (accountId: number, password: string) =>
    adminRequest<void>(`/api/admin/accounts/${accountId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    }),

  deleteAccount: (accountId: number) =>
    adminRequest<void>(`/api/admin/accounts/${accountId}`, { method: 'DELETE' }),
}
