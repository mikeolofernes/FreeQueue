import { Routes, Route, Navigate } from 'react-router-dom'
import { KioskPage } from './pages/KioskPage'
import { TicketPage } from './pages/TicketPage'

export default function App() {
  return (
    <Routes>
      <Route path="/kiosk" element={<KioskPage />} />
      <Route path="/ticket/:ticketId" element={<TicketPage />} />
      <Route path="*" element={<Navigate to="/kiosk" replace />} />
    </Routes>
  )
}
