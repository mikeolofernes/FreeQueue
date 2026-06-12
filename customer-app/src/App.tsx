import { Routes, Route } from 'react-router-dom'
import { JoinPage } from './pages/JoinPage'
import { KioskPage } from './pages/KioskPage'
import { TicketPage } from './pages/TicketPage'
import StaffApp from './staff/StaffApp'

export default function App() {
  return (
    <Routes>
      <Route path="/kiosk" element={<KioskPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/ticket/:ticketId" element={<TicketPage />} />
      <Route path="/staff/*" element={<StaffApp />} />
    </Routes>
  )
}
