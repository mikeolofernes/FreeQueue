import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { KioskPage } from './pages/KioskPage'
import { TicketPage } from './pages/TicketPage'
import { DisplayPage } from './pages/DisplayPage'
import StaffApp from './staff/StaffApp'
import type { BranchResponse } from './types'

function RootRedirect() {
  const navigate = useNavigate()
  const [branches, setBranches] = useState<BranchResponse[] | null>(null)

  useEffect(() => {
    fetch('/api/branches')
      .then(r => r.json())
      .then((list: BranchResponse[]) => {
        if (list.length === 1) {
          navigate(`/kiosk?branch=${encodeURIComponent(list[0].id)}`, { replace: true })
        } else {
          setBranches(list)
        }
      })
      .catch(() => navigate('/kiosk', { replace: true }))
  }, [navigate])

  if (branches && branches.length !== 1) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-lg font-semibold text-gray-700">Select a branch</p>
        {branches.map(b => (
          <a
            key={b.id}
            href={`/kiosk?branch=${encodeURIComponent(b.id)}`}
            className="w-full max-w-xs py-4 rounded-2xl bg-teal-brand text-white text-center text-lg font-bold shadow"
          >
            {b.name || b.id}
          </a>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-teal-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/kiosk" element={<KioskPage />} />
      <Route path="/display" element={<DisplayPage />} />
      <Route path="/ticket/:ticketId" element={<TicketPage />} />
      <Route path="/staff/*" element={<StaffApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
