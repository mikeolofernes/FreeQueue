import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useTicketHub } from '../useTicketHub'
import type { TicketResponse } from '../types'

type Stage = 'far' | 'close' | 'next' | 'served' | 'cancelled'

function getStage(ticket: TicketResponse): Stage {
  if (ticket.status === 'served') return 'served'
  if (ticket.status === 'cancelled' || ticket.status === 'skipped') return 'cancelled'
  if (ticket.peopleAhead === 0) return 'next'
  if (ticket.peopleAhead <= 3) return 'close'
  return 'far'
}

const TICKET_KEY = (branchId: string) => `fq_ticket_${branchId}`

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

function sendNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' })
  }
}

export function TicketPage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()
  const id = Number(ticketId)

  const [ticket, setTicket] = useState<TicketResponse | null>(null)
  const [error, setError] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const prevPeopleAhead = useRef<number | null>(null)
  const prevStatus = useRef<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const t = await api.getTicket(id)
      setTicket(t)
    } catch {
      setError('Could not load your ticket.')
    }
  }, [id])

  // Fire browser notifications when position changes
  useEffect(() => {
    if (!ticket) return

    const prev = prevPeopleAhead.current
    const prevSt = prevStatus.current
    const curr = ticket.peopleAhead

    if (prev !== null && prev !== curr) {
      if (curr === 0) {
        sendNotification("It's your turn! 🔔", `Ticket #${ticket.ticketNumber} — Go to the counter now!`)
      } else if (curr <= 3 && (prev === null || prev > 3)) {
        sendNotification('Almost your turn! 🏃', `${curr} ${curr === 1 ? 'person' : 'people'} ahead — Start heading back!`)
      }
    }

    if (prevSt !== null && prevSt !== ticket.status && ticket.status === 'near') {
      sendNotification("It's your turn! 🔔", `Ticket #${ticket.ticketNumber} — Head to the counter now!`)
    }

    prevPeopleAhead.current = curr
    prevStatus.current = ticket.status
  }, [ticket])

  useEffect(() => {
    refresh()
    requestNotificationPermission()
  }, [refresh])

  useTicketHub({
    branchId: ticket?.branchId ?? '',
    onUpdate: refresh,
  })

  async function handleAction(action: () => Promise<unknown>) {
    setActionLoading(true)
    try { await action(); await refresh() }
    catch { /* keep UI stable on error */ }
    finally { setActionLoading(false) }
  }

  function clearTicket() {
    if (ticket) localStorage.removeItem(TICKET_KEY(ticket.branchId))
  }

  function handleLeaveConfirm() {
    handleAction(async () => {
      await api.leave(id)
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
          <button onClick={() => navigate('/join')} className="mt-4 text-teal-brand underline text-sm">
            Scan QR again
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
    return <DoneScreen ticket={ticket} onDismiss={() => { clearTicket(); navigate('/join') }} />
  }

  if (stage === 'cancelled') {
    clearTicket()
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-5xl mb-4">👋</div>
          <p className="text-xl font-bold text-gray-700">You've left the queue</p>
          <p className="text-gray-400 text-sm mt-2">Scan the QR code to join again.</p>
          <button onClick={() => navigate(`/join?branch=${ticket.branchId}`)} className="mt-6 bg-teal-brand text-white font-semibold px-6 py-3 rounded-xl">
            Join Again
          </button>
        </div>
      </div>
    )
  }

  const cardBg =
    stage === 'next' ? 'bg-teal-brand text-white' :
    stage === 'close' ? 'bg-amber-brand text-white' :
    'bg-white text-gray-900'

  const isAway = ticket.status === 'away'

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-sm mx-auto">
      {/* Header */}
      <div className="bg-teal-brand text-white px-6 pt-10 pb-5">
        <p className="text-teal-light text-xs font-semibold tracking-widest uppercase">Your Queue Ticket</p>
        <p className="text-white font-semibold mt-1 text-sm">{ticket.branchId}</p>
      </div>

      <div className="flex-1 flex flex-col gap-4 px-5 py-5">
        {/* Boarding-pass card */}
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
            #{ticket.ticketNumber}
          </div>

          <div className={`text-sm font-medium mb-4 ${stage === 'far' ? 'text-gray-500' : 'opacity-80'}`}>
            {ticket.serviceType}
          </div>

          <div className={`rounded-2xl px-4 py-3 ${stage === 'far' ? 'bg-gray-50' : 'bg-white/20'}`}>
            {ticket.peopleAhead === 0 ? (
              <p className={`text-lg font-bold ${stage !== 'far' ? 'text-white' : 'text-teal-brand'}`}>
                Go to the counter now!
              </p>
            ) : (
              <>
                <p className={`text-2xl font-black ${stage !== 'far' ? 'text-white' : 'text-gray-800'}`}>
                  {ticket.peopleAhead === 1
                    ? '1 person is ahead of you'
                    : `${ticket.peopleAhead} people are ahead of you`}
                </p>
                <p className={`text-xs mt-1 ${stage !== 'far' ? 'opacity-70' : 'text-gray-400'}`}>
                  You are number {ticket.peopleAhead + 1} in line
                </p>
              </>
            )}
          </div>

          {ticket.waitEstimate && ticket.peopleAhead > 0 && (
            <p className={`text-xs mt-3 ${stage !== 'far' ? 'opacity-70' : 'text-gray-400'}`}>
              ~{ticket.waitEstimate.estimatedMinutes} min estimated · {ticket.waitEstimate.confidence}
            </p>
          )}
        </div>

        {/* Status pill */}
        <div className="flex justify-center">
          <StatusPill status={ticket.status} />
        </div>

        {/* Step Away / Check In toggle */}
        {(stage === 'far' || stage === 'close') && (
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-gray-700 mb-1">
              {isAway ? '📍 You\'re stepped away' : '🚶 Need to step out?'}
            </p>
            <p className="text-xs text-gray-400 mb-4">
              {isAway
                ? 'We\'re holding your spot. Tap below when you\'re back.'
                : 'Grab a coffee or run an errand — we\'ll hold your spot and notify you.'}
            </p>
            <button
              disabled={actionLoading}
              onClick={() => handleAction(isAway ? () => api.checkIn(id) : () => api.stepAway(id))}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 ${
                isAway
                  ? 'bg-teal-brand text-white hover:bg-teal-dark'
                  : 'border-2 border-teal-brand text-teal-brand hover:bg-teal-brand hover:text-white'
              }`}
            >
              {actionLoading ? '…' : isAway ? "✓ I'm back — Check In" : '🚶 Step Away'}
            </button>
          </div>
        )}

        {/* Leave queue */}
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
    away:    { label: '🚶 Stepped away', cls: 'bg-amber-50 text-amber-dark border border-amber-brand' },
    near:    { label: '⚡ Almost your turn', cls: 'bg-amber-brand text-white' },
    arrived: { label: '✅ Checked in', cls: 'bg-green-100 text-green-700' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`px-4 py-1.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
  )
}

function DoneScreen({ ticket, onDismiss }: { ticket: TicketResponse; onDismiss: () => void }) {
  return (
    <div className="min-h-screen bg-teal-brand flex flex-col items-center justify-center p-8 text-center text-white">
      <div className="text-7xl mb-6">🎉</div>
      <h1 className="text-3xl font-black mb-2">You've been served!</h1>
      <p className="text-teal-light text-sm mb-1">Ticket #{ticket.ticketNumber}</p>
      <p className="text-teal-light text-sm">{ticket.serviceType}</p>
      <button
        onClick={onDismiss}
        className="mt-10 bg-white text-teal-brand font-bold px-8 py-3 rounded-2xl shadow-lg"
      >
        Done
      </button>
    </div>
  )
}
