import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AdminAuditLogPage } from './pages/AdminAuditLogPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminLookupPage } from './pages/AdminLookupPage';
import { AdminManagePage } from './pages/AdminManagePage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AppointmentPage } from './pages/AppointmentPage';
import { BookingPage } from './pages/BookingPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FindBookingPage } from './pages/FindBookingPage';
import { MyAppointmentsPage } from './pages/MyAppointmentsPage';
import { PrivacyNoticePage } from './pages/PrivacyNoticePage';

/**
 * Keyed by pathname so navigating away from a crashed page fully remounts
 * the boundary (clearing its error state) instead of staying stuck showing
 * the fallback for a route the person has already left.
 */
function RoutedContent() {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Routes>
        <Route path="/" element={<BookingPage />} />
        <Route path="/confirmation/:reference" element={<ConfirmationPage />} />
        <Route path="/appointments" element={<FindBookingPage />} />
        <Route path="/appointments/:reference" element={<AppointmentPage />} />
        <Route path="/my-appointments" element={<MyAppointmentsPage />} />
        <Route path="/privacy" element={<PrivacyNoticePage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/analytics" element={<AnalyticsPage />} />
        <Route path="/admin/lookup" element={<AdminLookupPage />} />
        <Route path="/admin/manage" element={<AdminManagePage />} />
        <Route path="/admin/audit-log" element={<AdminAuditLogPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

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
            <NavLink to="/my-appointments">My appointments</NavLink>
            <NavLink to="/admin/analytics" className={({ isActive }) => `masthead__staff ${isActive ? 'active' : ''}`}>
              Staff
            </NavLink>
          </nav>
        </div>
      </header>
      <main id="main">
        <RoutedContent />
      </main>
      <footer className="footer">Appointments are held for 10 minutes past the booked time.</footer>
    </BrowserRouter>
  );
}
