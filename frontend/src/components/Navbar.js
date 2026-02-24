import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        Felici<span>ty</span>
      </Link>
      <div className="navbar-links">
        {!user ? (
          <>
            <Link to="/events">Browse Events</Link>
            <Link to="/clubs">Clubs</Link>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </>
        ) : (
          <>
            {user.role === 'participant' && <Link to="/dashboard">Dashboard</Link>}
            {user.role === 'participant' && <Link to="/events">Events</Link>}
            {user.role === 'participant' && <Link to="/clubs">Clubs</Link>}
            {user.role === 'participant' && <Link to="/profile">Profile</Link>}

            {user.role === 'organizer' && <Link to="/dashboard">Dashboard</Link>}
            {user.role === 'organizer' && <Link to="/organizer/create-event">Create Event</Link>}
            {user.role === 'organizer' && <Link to="/organizer/ongoing">Ongoing</Link>}
            {user.role === 'organizer' && <Link to="/organizer/profile">Profile</Link>}

            {user.role === 'admin' && <Link to="/dashboard">Dashboard</Link>}
            {user.role === 'admin' && <Link to="/dashboard?tab=organizers">Manage Clubs/Organizers</Link>}
            {user.role === 'admin' && <Link to="/dashboard?tab=pwdreqs">Password Reset Requests</Link>}

            <span className="navbar-user-chip">{user.name}</span>
            <button onClick={handleLogout} className="btn btn-secondary btn-sm" style={{ width: 'auto', marginLeft: 4 }}>Logout</button>
          </>
        )}
      </div>
    </nav>
  );
}

export default Navbar;

