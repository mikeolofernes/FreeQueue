import { Routes, Route, Navigate } from 'react-router-dom'
import { JoinPage } from './pages/JoinPage'
import { TicketPage } from './pages/TicketPage'
import StaffApp from './staff/StaffApp'

export default function App() {
  return (
    <Routes>
      <Route path="/join" element={<JoinPage />} />
      <Route path="/ticket/:ticketId" element={<TicketPage />} />
      <Route path="/staff/*" element={<StaffApp />} />
      <Route path="*" element={<Navigate to="/join" replace />} />
    </Routes>
  )
}
