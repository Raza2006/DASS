import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Profile from './pages/Profile';
import EventsPage from './pages/EventsPage';
import EventDetailsPage from './pages/EventDetailsPage';
import ClubsPage from './pages/ClubsPage';
import OrganizerDetailPage from './pages/OrganizerDetailPage';
import ParticipantDashboard from './pages/ParticipantDashboard';
import OrganizerDashboard from './pages/OrganizerDashboard';
import OrganizerEventDetail from './pages/OrganizerEventDetail';
import CreateEventPage from './pages/CreateEventPage';
import OrganizerProfile from './pages/OrganizerProfile';
import AdminDashboard from './pages/AdminDashboard';
import JoinTeamPage from './pages/JoinTeamPage';

import './styles.css';

// Protect routes that need login
function PrivateRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" />;
  }
  return children;
}

// Redirect /dashboard to the right dashboard based on role
function DashboardRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;
  if (user.role === 'participant') return <ParticipantDashboard />;
  if (user.role === 'organizer')   return <OrganizerDashboard />;
  if (user.role === 'admin')       return <AdminDashboard />;
  return <Navigate to="/login" />;
}

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/events" />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/events/:id" element={<EventDetailsPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Clubs — accessible to participants and guests (read-only for guests) */}
        <Route path="/clubs" element={<ClubsPage />} />
        <Route path="/clubs/:id" element={<OrganizerDetailPage />} />

        {/* Post-registration onboarding — participants only */}
        <Route path="/onboarding" element={
          <PrivateRoute allowedRoles={['participant']}><Onboarding /></PrivateRoute>
        } />

        {/* Profile page — participants only */}
        <Route path="/profile" element={
          <PrivateRoute allowedRoles={['participant']}><Profile /></PrivateRoute>
        } />

        <Route path="/dashboard" element={<DashboardRedirect />} />

        {/* Organizer-specific routes */}
        <Route path="/organizer/create-event" element={
          <PrivateRoute allowedRoles={['organizer']}><CreateEventPage /></PrivateRoute>
        } />
        <Route path="/organizer/events/:id" element={
          <PrivateRoute allowedRoles={['organizer']}><OrganizerEventDetail /></PrivateRoute>
        } />
        <Route path="/organizer/profile" element={
          <PrivateRoute allowedRoles={['organizer']}><OrganizerProfile /></PrivateRoute>
        } />
        <Route path="/organizer/ongoing" element={
          <PrivateRoute allowedRoles={['organizer']}><OrganizerDashboard /></PrivateRoute>
        } />

        {/* Team invite link */}
        <Route path="/join-team/:code" element={
          <PrivateRoute allowedRoles={['participant']}><JoinTeamPage /></PrivateRoute>
        } />

        {/* Catch-all: unknown paths → dashboard (DashboardRedirect handles login redirect) */}
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
