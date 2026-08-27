import { NavLink, useNavigate } from 'react-router-dom';
import { clearAdminToken } from '../lib/session';

/** Shared sub-navigation across the staff-only pages. */
export function StaffNav() {
  const navigate = useNavigate();

  const signOut = () => {
    clearAdminToken();
    navigate('/admin/login');
  };

  return (
    <div className="staff-nav">
      <nav className="staff-nav__tabs" aria-label="Staff tools">
        <NavLink to="/admin/analytics" className={({ isActive }) => (isActive ? 'active' : '')}>
          Analytics
        </NavLink>
        <NavLink to="/admin/lookup" className={({ isActive }) => (isActive ? 'active' : '')}>
          Look up a booking
        </NavLink>
        <NavLink to="/admin/audit-log" className={({ isActive }) => (isActive ? 'active' : '')}>
          Audit log
        </NavLink>
      </nav>
      <button type="button" className="button button--ghost button--small" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
