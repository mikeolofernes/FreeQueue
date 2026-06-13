export interface TicketResponse {
  id: number
  branchId: string
  ticketNumber: number
  serviceType: string
  customerName: string | null
  status: string
  peopleAhead: number
  joinedAt: string
  waitEstimate: WaitEstimate | null
  viewToken: string | null
  priority: boolean
  counterId: string | null
}

export interface WaitEstimate {
  estimatedMinutes: number
  confidence: string
  avgServiceSecs: number
}

export interface BranchResponse {
  id: string
  name: string
  category: string | null
  address: string | null
  city: string | null
  maxCapacity: number
  graceMinutes: number
  hasKioskPin: boolean
  isOpen: boolean
}

export interface QueueStatus {
  branchId: string
  currentTicketNumber: number | null
  currentServiceType: string | null
  activeCount: number
  servedToday: number
  peopleWaiting: number
  waitEstimate: WaitEstimate | null
  isOpen: boolean
  nextTicketNumbers: number[] | null
  counterId: string | null
  currentTicketId: number | null
}

export interface UndoResponse {
  success: boolean
  message: string
}

export interface BranchService {
  id: number
  name: string
  sortOrder: number
}

export interface AdminAccount {
  id: number
  username: string
  role: string
  createdAt: string
}

export interface AdminBranch {
  id: string
  name: string
  category: string | null
  accounts: AdminAccount[]
}

export interface AnalyticsData {
  branchId: string
  totalServedToday: number
  currentlyWaiting: number
  avgWaitMinutes: number
  hourlyBreakdown: HourlyStats[]
  serviceBreakdown: ServiceStats[]
  csatScore: number
}

export interface HourlyStats {
  hour: number
  count: number
  avgDurationSecs: number
}

export interface ServiceStats {
  serviceType: string
  count: number
  avgDurationSecs: number
}

export interface Appointment {
  id: number
  branchId: string
  serviceType: string
  customerName: string
  phone: string | null
  scheduledAt: string
  status: string
  notes: string | null
  createdAt: string
}
