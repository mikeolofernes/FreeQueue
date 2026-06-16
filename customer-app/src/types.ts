export interface TicketResponse {
  id: number
  branchId: string
  ticketNumber: number
  displayNumber: string
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
  currentDisplayNumber: string | null
  nextDisplayNumbers: string[] | null
  // Populated on callNext responses only
  calledTicketId: number | null
  calledDisplayNumber: string | null
  calledServiceType: string | null
}

export interface NowServingEntry {
  displayNumber: string
  serviceType: string | null
  counterId: string | null
}

export interface GroupStatusItem {
  groupId: number | null
  groupName: string
  prefix: string | null
  peopleWaiting: number
  nowServing: NowServingEntry[]
}

export interface UndoResponse {
  success: boolean
  message: string
}

export interface BranchService {
  id: number
  name: string
  sortOrder: number
  serviceGroupId: number | null
  serviceGroupName: string | null
}

export interface ServiceGroup {
  id: number
  name: string
  prefix: string | null
  sortOrder: number
  services: BranchService[]
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
