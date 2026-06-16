import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useTicketHub } from '../useTicketHub'
import type { TicketResponse, QueueStatus } from '../types'

type Stage = 'far' | 'close' | 'next' | 'served' | 'cancelled'
type PostServe = 'done' | 'csat' | 'thanks'

function getStage(ticket: TicketResponse): Stage {
  if (ticket.status === 'served') return 'served'
  if (ticket.status === 'cancelled' || ticket.status === 'skipped') return 'cancelled'
  if (ticket.peopleAhead === 0) return 'next'
  if (ticket.peopleAhead <= 3) return 'close'
  return 'far'
}

const TICKET_KEY = (branchId: string) => `fq_ticket_${branchId}`

export function TicketPage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const id = Number(ticketId)
  const vt = searchParams.get('vt') ?? undefined

  const [ticket, setTicket] = useState<TicketResponse | null>(null)
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null)
  const [error, setError] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [postServe, setPostServe] = useState<PostServe>('done')

  const viewedRef = useRef(false)
  useEffect(() => {
    if (viewedRef.current) return
    viewedRef.current = true
    api.ticketViewed(id, vt).catch(() => {})
  }, [id])

  const refresh = useCallback(async () => {
    try {
      const t = await api.getTicket(id)
      setTicket(t)
      api.getStatusPublic(t.branchId).then(setQueueStatus).catch(() => {})
    } catch {
      setError('Could not load your ticket.')
    }
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  const { connected } = useTicketHub({
    branchId: ticket?.branchId ?? '',
    onUpdate: refresh,
  })

  async function handleAction(action: () => Promise<unknown>) {
    try { await action(); await refresh() }
    catch { /* keep UI stable on error */ }
  }

  function clearTicket() {
    if (ticket) localStorage.removeItem(TICKET_KEY(ticket.branchId))
  }

  function handleLeaveConfirm() {
    handleAction(async () => {
      await api.leave(id, vt)
      clearTicket()
    })
    setConfirmLeave(false)
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-5xl mb-4">😕</div>
          <p className="text-gray-600">{error}</p>
          <button onClick={() => navigate('/')} className="mt-4 text-teal-brand underline text-sm">
            Go back
          </button>
        </div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-teal-brand border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const stage = getStage(ticket)

  if (stage === 'served') {
    clearTicket()
    if (postServe === 'csat') {
      return <CsatScreen ticketId={id} vt={vt} onDone={() => setPostServe('thanks')} />
    }
    if (postServe === 'thanks') {
      return <ThankYouScreen />
    }
    return <DoneScreen ticket={ticket} onDone={() => setPostServe('csat')} />
  }

  if (stage === 'cancelled') {
    clearTicket()
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-5xl mb-4">👋</div>
          <p className="text-xl font-bold text-gray-700">You've left the queue</p>
          <p className="text-gray-400 text-sm mt-2">Scan the QR code at the counter to join again.</p>
        </div>
      </div>
    )
  }

  const cardBg =
    stage === 'next' ? 'bg-teal-brand text-white' :
    stage === 'close' ? 'bg-amber-brand text-white' :
    'bg-white text-gray-900'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-sm mx-auto">
      {!connected && (
        <div className="bg-amber-500 text-white text-center text-xs font-medium py-1.5 px-4">
          Reconnecting…
        </div>
      )}
      <div className="bg-teal-brand text-white px-6 pt-10 pb-5">
        <p className="text-teal-light text-xs font-semibold tracking-widest uppercase">Your Queue Ticket</p>
        <p className="text-white font-semibold mt-1 text-sm">{ticket.branchId}</p>
      </div>

      <div className="flex-1 flex flex-col gap-4 px-5 py-5">
        <div className={`rounded-3xl shadow-lg p-7 text-center animate-bounce_in ${cardBg}`}>
          {stage === 'next' && (
            <div className="text-sm font-semibold tracking-widest uppercase mb-1 opacity-80">
              🔔 You're next!
            </div>
          )}
          {stage === 'close' && (
            <div className="text-sm font-semibold tracking-widest uppercase mb-1 opacity-90">
              🏃 Start heading back!
            </div>
          )}

          <div className={`text-8xl font-black leading-none my-2 ${stage === 'far' ? 'text-teal-brand' : ''}`}>
            {ticket.displayNumber}
          </div>

          <div className={`text-sm font-medium mb-2 ${stage === 'far' ? 'text-gray-500' : 'opacity-80'}`}>
            {ticket.serviceType}
          </div>

          {ticket.waitEstimate && (
            <div className={`mb-3 ${stage !== 'far' ? 'opacity-90' : 'text-teal-brand'}`}>
              <span className="text-2xl font-black">~{ticket.waitEstimate.estimatedMinutes} min</span>
              <span className={`text-xs ml-2 ${stage !== 'far' ? 'opacity-70' : 'text-gray-400'}`}>
                {ticket.waitEstimate.confidence}
              </span>
            </div>
          )}

          <div className={`rounded-2xl px-4 py-3 ${stage === 'far' ? 'bg-gray-50' : 'bg-white/20'}`}>
            {ticket.peopleAhead === 0 ? (
              <p className={`text-lg font-bold ${stage !== 'far' ? 'text-white' : 'text-teal-brand'}`}>
                Go to the counter now!
              </p>
            ) : (
              <>
                <p className={`text-3xl font-black ${stage !== 'far' ? 'text-white' : 'text-gray-800'}`}>
                  {ticket.peopleAhead}
                </p>
                <p className={`text-xs font-medium ${stage !== 'far' ? 'opacity-80' : 'text-gray-400'}`}>
                  {ticket.peopleAhead === 1 ? 'person' : 'people'} ahead of you
                </p>
              </>
            )}
            {queueStatus?.currentDisplayNumber != null && (
              <p className={`text-xs mt-2 ${stage !== 'far' ? 'opacity-70' : 'text-gray-400'}`}>
                Now serving: <span className="font-bold">{queueStatus.currentDisplayNumber}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-center">
          <StatusPill status={ticket.status} />
        </div>

        <div className="mt-auto">
          {confirmLeave ? (
            <div className="bg-red-50 rounded-2xl p-4 text-center space-y-3">
              <p className="text-sm font-medium text-red-700">Leave the queue? You'll lose your spot.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmLeave(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">
                  Cancel
                </button>
                <button onClick={handleLeaveConfirm} className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-medium">
                  Leave
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmLeave(true)}
              className="w-full text-center text-sm text-gray-400 hover:text-red-400 py-2 transition-colors"
            >
              Leave the queue
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    waiting: { label: '⏳ Waiting', cls: 'bg-gray-100 text-gray-600' },
    near:    { label: '⚡ Almost your turn', cls: 'bg-amber-brand text-white' },
    arrived: { label: '✅ Checked in', cls: 'bg-green-100 text-green-700' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`px-4 py-1.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
  )
}

function DoneScreen({ ticket, onDone }: { ticket: TicketResponse; onDone: () => void }) {
  return (
    <div className="min-h-screen bg-teal-brand flex flex-col items-center justify-center p-8 text-center text-white">
      <div className="text-7xl mb-6">🎉</div>
      <h1 className="text-3xl font-black mb-2">You've been served!</h1>
      <p className="text-teal-light text-sm mb-1">Ticket {ticket.displayNumber}</p>
      <p className="text-teal-light text-sm">{ticket.serviceType}</p>
      <button
        onClick={onDone}
        className="mt-10 bg-white text-teal-brand font-bold px-8 py-3 rounded-2xl shadow-lg"
      >
        Done
      </button>
    </div>
  )
}

const CSAT_AUTO_SECS = 10

function CsatScreen({ ticketId, vt, onDone }: { ticketId: number; vt?: string; onDone: () => void }) {
  const [countdown, setCountdown] = useState(CSAT_AUTO_SECS)

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(t); onDone(); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [onDone])

  function handleRate(rating: number) {
    api.rateTicket(ticketId, rating, vt).catch(() => {})
    onDone()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-10 p-8 text-center">
      <p className="text-2xl font-bold text-gray-800">How was your experience?</p>
      <div className="flex gap-8">
        {(['😐', '🙂', '😊'] as const).map((emoji, i) => (
          <button
            key={i}
            onClick={() => handleRate(i + 1)}
            className="text-[80px] hover:scale-110 active:scale-95 transition-transform"
          >
            {emoji}
          </button>
        ))}
      </div>
      <p className="text-gray-400 text-sm">Auto-closing in {countdown}s</p>
    </div>
  )
}

function ThankYouScreen() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center gap-4">
      <div className="text-7xl">👋</div>
      <h1 className="text-2xl font-black text-gray-800">Thank you!</h1>
      <p className="text-gray-400 text-sm">See you next time.</p>
    </div>
  )
}
