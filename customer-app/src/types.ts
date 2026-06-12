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
  viewedAt: string | null
  viewToken: string | null
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
}

export interface QueueStatus {
  branchId: string
  currentTicketNumber: number | null
  currentServiceType: string | null
  activeCount: number
  servedToday: number
  peopleWaiting: number
  waitEstimate: WaitEstimate | null
}

export interface UndoResponse {
  success: boolean
  message: string
}
