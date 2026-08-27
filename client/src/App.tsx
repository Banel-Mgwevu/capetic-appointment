import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AppointmentPage } from './pages/AppointmentPage';
import { BookingPage } from './pages/BookingPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { FindBookingPage } from './pages/FindBookingPage';

export default function App() {
  return (
    <BrowserRouter>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <div className="masthead__inner">
          <Link to="/" className="masthead__brand">
            <img src="/logo.png" alt="Capitec" className="masthead__logo" width={134} height={73} />
            <span className="masthead__wordmark">
              <strong>Capitec</strong>
              <span>Branch appointments</span>
            </span>
          </Link>
          <nav className="masthead__nav" aria-label="Primary">
            <NavLink to="/" end>
              Book
            </NavLink>
            <NavLink to="/appointments">Find a booking</NavLink>
            <NavLink to="/admin/analytics" className={({ isActive }) => `masthead__staff ${isActive ? 'active' : ''}`}>
              Staff
            </NavLink>
          </nav>
        </div>
      </header>
      <main id="main">
        <Routes>
          <Route path="/" element={<BookingPage />} />
          <Route path="/confirmation/:reference" element={<ConfirmationPage />} />
          <Route path="/appointments" element={<FindBookingPage />} />
          <Route path="/appointments/:reference" element={<AppointmentPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">Appointments are held for 10 minutes past the booked time.</footer>
    </BrowserRouter>
  );
}
