/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import API from '../api';

function AdminDashboard() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read ?tab= from URL; default 'events'
  const [tab, setTabState] = useState(searchParams.get('tab') || 'events');
  const setTab = (t) => { setTabState(t); setSearchParams({ tab: t }); };

  // Sync tab if URL param changes (e.g. Navbar link clicked)
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && t !== tab) setTabState(t);
  }, [searchParams]);

  const [events, setEvents]             = useState([]);
  const [users, setUsers]               = useState([]);
  const [organizers, setOrganizers]     = useState([]);
  const [stats, setStats]               = useState(null);
  const [message, setMessage]           = useState('');
  const [error, setError]               = useState('');

  // Organizer creation form
  const emptyOrgForm = { name: '', email: '', password: '', clubName: '', category: '', description: '', contactEmail: '', autoGenerate: true };
  const [orgForm, setOrgForm]           = useState(emptyOrgForm);
  const [orgLoading, setOrgLoading]     = useState(false);
  // Credentials modal shown after auto-gen creation
  const [credsModal, setCredsModal]     = useState(null); // { email, password }

  // Organizer list filters
  const [orgSearch, setOrgSearch]       = useState('');
  const [orgStatusFilter, setOrgStatusFilter] = useState('all'); // 'all'|'active'|'disabled'|'archived'

  // Reset password modal state
  const [resetTarget, setResetTarget]   = useState(null); // { _id, email }
  const [resetPassword, setResetPassword] = useState('');

  // Registrations view
  const [registrations, setRegistrations] = useState([]);
  const [regFilter, setRegFilter] = useState('all');

  // Organizer password reset requests
  const [resetRequests,   setResetRequests]   = useState([]);
  const [resolveModal,    setResolveModal]    = useState(null); // { id, action: 'approve'|'reject' }
  const [resolveComment,  setResolveComment]  = useState('');
  const [resolving,       setResolving]       = useState(false);
  const [newPwd,          setNewPwd]          = useState(null); // generated password to show admin

  useEffect(() => {
    fetchStats();
    if (tab === 'events')        fetchEvents();
    if (tab === 'users')         fetchUsers();
    if (tab === 'organizers')    fetchOrganizers();
    if (tab === 'registrations') fetchRegistrations();
    if (tab === 'resets')        fetchUsers();
    if (tab === 'pwdreqs')       fetchResetRequests();
  }, [tab]);

  const headers = { Authorization: `Bearer ${user.token}` };

  const notify = (msg, isError = false) => {
    if (isError) setError(msg);
    else setMessage(msg);
    setTimeout(() => { setMessage(''); setError(''); }, 4000);
  };

  const fetchStats = async () => {
    try {
      const { data } = await axios.get(`${API}/admin/stats`, { headers });
      setStats(data);
    } catch {}
  };

  const fetchEvents = async () => {
    try {
      const { data } = await axios.get(`${API}/admin/events`, { headers });
      setEvents(data);
    } catch { notify('Could not load events.', true); }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await axios.get(`${API}/admin/users`, { headers });
      setUsers(data);
    } catch { notify('Could not load users.', true); }
  };

  const fetchOrganizers = async () => {
    try {
      const { data } = await axios.get(`${API}/admin/organizers`, { headers });
      setOrganizers(data);
    } catch { notify('Could not load organizers.', true); }
  };

  const deleteOrganizer = async (id) => {
    if (!window.confirm('Permanently delete this organizer and all their events & registrations?')) return;
    try {
      await axios.delete(`${API}/admin/users/${id}`, { headers });
      notify('Organizer deleted.');
      fetchOrganizers(); fetchStats();
    } catch { notify('Could not delete organizer.', true); }
  };

  const handleOrgStatus = async (id, action) => {
    try {
      const { data } = await axios.patch(`${API}/admin/organizers/${id}/status`, { action }, { headers });
      notify(data.message);
      fetchOrganizers();
    } catch (err) { notify(err.response?.data?.message || `Could not ${action} organizer.`, true); }
  };

  const approveEvent = async (id) => {
    try {
      await axios.put(`${API}/admin/events/${id}/approve`, {}, { headers });
      notify('Event approved!');
      fetchEvents(); fetchStats();
    } catch { notify('Could not approve event.', true); }
  };

  const rejectEvent = async (id) => {
    try {
      await axios.put(`${API}/admin/events/${id}/reject`, {}, { headers });
      notify('Event rejected.');
      fetchEvents(); fetchStats();
    } catch { notify('Could not reject event.', true); }
  };

  const deleteEvent = async (id) => {
    if (!window.confirm('Permanently delete this event and all its registrations?')) return;
    try {
      await axios.delete(`${API}/admin/events/${id}`, { headers });
      notify('Event deleted.');
      fetchEvents(); fetchStats();
    } catch { notify('Could not delete event.', true); }
  };

  const deleteUser = async (id) => {
    if (!window.confirm('Delete this user account permanently?')) return;
    try {
      await axios.delete(`${API}/admin/users/${id}`, { headers });
      notify('User deleted.');
      fetchUsers(); fetchStats();
    } catch { notify('Could not delete user.', true); }
  };

  // Create organizer account (admin only)
  const handleCreateOrganizer = async (e) => {
    e.preventDefault();
    setOrgLoading(true);
    try {
      const { data } = await axios.post(`${API}/admin/organizers`, orgForm, { headers });
      notify(data.message);
      setOrgForm(emptyOrgForm);
      fetchOrganizers(); fetchStats();
      // Show creds modal — always show email; show password only when auto-generated
      if (data.autoGenerated) {
        setCredsModal({ email: data.credentials.email, password: data.credentials.password });
      } else {
        setCredsModal({ email: data.organizer.email, password: null });
      }
    } catch (err) {
      notify(err.response?.data?.message || 'Could not create organizer.', true);
    } finally {
      setOrgLoading(false);
    }
  };

  // Admin resets a user's password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (resetPassword.length < 6) { notify('Password must be at least 6 characters.', true); return; }
    try {
      const { data } = await axios.put(
        `${API}/admin/users/${resetTarget._id}/reset-password`,
        { newPassword: resetPassword },
        { headers }
      );
      notify(data.message);
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      notify(err.response?.data?.message || 'Could not reset password.', true);
    }
  };

  const fetchRegistrations = async () => {
    try {
      const { data } = await axios.get(`${API}/admin/registrations`, { headers });
      setRegistrations(data);
    } catch { notify('Could not load registrations.', true); }
  };

  const fetchResetRequests = async () => {
    try {
      const { data } = await axios.get(`${API}/admin/password-resets`, { headers });
      setResetRequests(data);
    } catch { notify('Could not load reset requests.', true); }
  };

  const handleResolveRequest = async () => {
    if (!resolveModal) return;
    setResolving(true);
    try {
      const url = `${API}/admin/password-resets/${resolveModal.id}/${resolveModal.action}`;
      const { data } = await axios.patch(url, { adminComment: resolveComment }, { headers });
      if (resolveModal.action === 'approve') {
        setNewPwd(data.generatedPassword);
      } else {
        notify('Request rejected.');
      }
      fetchResetRequests();
      setResolveModal(null);
      setResolveComment('');
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to resolve request.', true);
    } finally {
      setResolving(false);
    }
  };

  const formatDate = (d) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const participants = users.filter((u) => u.role === 'participant');

  // Organizer list filtered by search + status
  const filteredOrganizers = organizers.filter((o) => {
    const q = orgSearch.toLowerCase();
    const matchSearch = !q || (o.name || '').toLowerCase().includes(q)
      || (o.clubName || '').toLowerCase().includes(q)
      || (o.email || '').toLowerCase().includes(q);
    const matchStatus =
      orgStatusFilter === 'all'
        ? true
        : orgStatusFilter === 'active'    ? (!o.isDisabled && !o.isArchived)
        : orgStatusFilter === 'disabled'  ? o.isDisabled
        : orgStatusFilter === 'archived'  ? o.isArchived
        : true;
    return matchSearch && matchStatus;
  });

  return (
    <div className="page">
      <h2>Admin Panel</h2>
      <p style={{ color: '#666', marginTop: 4, marginBottom: 20 }}>
        Logged in as <strong>{user.email}</strong>
      </p>

      {message && <div className="success-msg">{message}</div>}
      {error && <div className="error-msg">{error}</div>}

      {/* ── Stats ── */}
      {stats && (
        <div className="stats-row">

          <div className="stat-box stat-box-link" onClick={() => { setTab('users'); fetchUsers(); }}>
            <h2>{stats.totalParticipants}</h2>
            <p>Participants</p>
          </div>

          <div className="stat-box stat-box-link" onClick={() => { setTab('organizers'); fetchOrganizers(); }}>
            <h2>{stats.totalOrganizers}</h2>
            <p>Organizers</p>
          </div>

          <div className="stat-box stat-box-link" onClick={() => { setTab('events'); fetchEvents(); }}>
            <h2>{stats.totalEvents}</h2>
            <p>Total Events</p>
          </div>

          <div className="stat-box stat-box-link" onClick={() => { setTab('events'); fetchEvents(); }}>
            <h2>{stats.pendingEvents}</h2>
            <p>Pending Approval</p>
          </div>

          <div className="stat-box stat-box-link" onClick={() => { setTab('registrations'); setRegFilter('registered'); fetchRegistrations(); }}>
            <h2>{stats.totalRegistrations}</h2>
            <p>Registrations</p>
          </div>

          <div className="stat-box stat-box-link" onClick={() => { setTab('registrations'); setRegFilter('attended'); fetchRegistrations(); }}>
            <h2>{stats.totalAttended}</h2>
            <p>Attended</p>
          </div>

        </div>
      )}

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'events',        label: 'Events' },
          { key: 'organizers',    label: 'Clubs' },
          { key: 'users',         label: 'Participants' },
          { key: 'registrations', label: 'Registrations' },
          { key: 'resets',        label: 'Password Resets' },
          { key: 'pwdreqs',       label: 'Reset Requests' },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`btn btn-sm ${tab === key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Events Tab ── */}
      {tab === 'events' && (
        <>
          {events.length === 0 ? (
            <div className="card"><p>No events found.</p></div>
          ) : (
            events.map((event) => (
              <div className="card" key={event._id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3>{event.title}</h3>
                    <p>{formatDate(event.date)} &nbsp; {event.venue}</p>
                    <p>{event.organizer?.name} ({event.organizer?.email}) — {event.organizer?.clubName}</p>
                    <p>{event.category}</p>
                  </div>
                  <span className={`badge badge-${event.status}`}>{event.status}</span>
                </div>
                <div className="card-actions">
                  {event.status !== 'approved' && (
                    <button className="btn btn-success btn-sm" onClick={() => approveEvent(event._id)}>Approve</button>
                  )}
                  {event.status !== 'rejected' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => rejectEvent(event._id)}>Reject</button>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => deleteEvent(event._id)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </>
      )}

      {/* ── Organizers Tab ── */}
      {tab === 'organizers' && (
        <>
          {/* ── Create organizer form ── */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 4 }}>Add New Club / Organizer Account</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 16 }}>
              Toggle auto-generate to let the system create login credentials, then share them with the club.
            </p>
            <form onSubmit={handleCreateOrganizer}>
              {/* Auto-generate toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' }}>
                <input type="checkbox" checked={orgForm.autoGenerate}
                  onChange={(e) => setOrgForm((p) => ({ ...p, autoGenerate: e.target.checked, email: '', password: '' }))}
                  style={{ width: 16, height: 16 }} />
                Auto-generate login email &amp; password
                <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.8rem' }}>(recommended)</span>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Full Name *</label>
                  <input type="text" placeholder="Organizer / contact name" value={orgForm.name}
                    onChange={(e) => setOrgForm((p) => ({ ...p, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Club / Organization Name</label>
                  <input type="text" placeholder="e.g. Coding Club" value={orgForm.clubName}
                    onChange={(e) => setOrgForm((p) => ({ ...p, clubName: e.target.value }))} />
                </div>

                {/* Only show email/password when NOT auto-generating */}
                {!orgForm.autoGenerate && (
                  <>
                    <div className="form-group">
                      <label>Login Email *</label>
                      <input type="email" placeholder="organizer@iiit.ac.in" value={orgForm.email}
                        onChange={(e) => setOrgForm((p) => ({ ...p, email: e.target.value }))}
                        required={!orgForm.autoGenerate} />
                    </div>
                    <div className="form-group">
                      <label>Initial Password * (min 6 chars)</label>
                      <input type="text" placeholder="Temporary password" value={orgForm.password}
                        onChange={(e) => setOrgForm((p) => ({ ...p, password: e.target.value }))}
                        required={!orgForm.autoGenerate} />
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label>Category</label>
                  <select value={orgForm.category} onChange={(e) => setOrgForm((p) => ({ ...p, category: e.target.value }))}>
                    <option value="">— Select —</option>
                    {['Technical','Cultural','Sports','Gaming','Music','Art','Social','Finance','General'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Public Contact Email</label>
                  <input type="email" placeholder="contact@club.com" value={orgForm.contactEmail}
                    onChange={(e) => setOrgForm((p) => ({ ...p, contactEmail: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea placeholder="Short description about this club / organizer" value={orgForm.description}
                  onChange={(e) => setOrgForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2} style={{ resize: 'vertical' }} />
              </div>
              <button className="btn btn-success" type="submit" disabled={orgLoading} style={{ width: 'auto', marginTop: 4 }}>
                {orgLoading ? 'Creating…' : orgForm.autoGenerate ? 'Auto-Create Account' : 'Create Account'}
              </button>
            </form>
          </div>

          {/* ── Search + Filter bar ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text" placeholder="Search by name, club or email…"
              value={orgSearch} onChange={(e) => setOrgSearch(e.target.value)}
              style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: '0.875rem' }}
            />
            {['all','active','disabled','archived'].map((f) => (
              <button key={f} className={`btn btn-sm ${orgStatusFilter === f ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setOrgStatusFilter(f)} style={{ textTransform: 'capitalize' }}>
                {f === 'all' ? 'All' : f}
              </button>
            ))}
            <span style={{ color: '#64748b', fontSize: '0.85rem', marginLeft: 4 }}>
              {filteredOrganizers.length} / {organizers.length}
            </span>
          </div>

          {/* ── Organizer list ── */}
          {filteredOrganizers.length === 0 ? (
            <div className="card"><p>{organizers.length === 0 ? 'No organizer accounts yet. Create one above.' : 'No organizers match your filter.'}</p></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th>Name / Club</th>
                    <th>Login Email</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrganizers.map((o) => {
                    const isActive   = !o.isDisabled && !o.isArchived;
                    const statusBadge = o.isArchived
                      ? { label: 'Archived',  bg: '#f1f5f9', color: '#64748b' }
                      : o.isDisabled
                      ? { label: 'Disabled',  bg: '#fee2e2', color: '#991b1b' }
                      : { label: 'Active',    bg: '#d1fae5', color: '#065f46' };
                    return (
                      <tr key={o._id}>
                        <td>
                          <strong>{o.name}</strong>
                          {o.clubName && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{o.clubName}</div>}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{o.email}</td>
                        <td>{o.category || '—'}</td>
                        <td>
                          <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 700, background: statusBadge.bg, color: statusBadge.color }}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: '#64748b', whiteSpace: 'nowrap' }}>{formatDate(o.createdAt)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {/* Disable / Enable */}
                            {!o.isArchived && (
                              isActive
                                ? <button className="btn btn-secondary btn-sm"
                                    style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}
                                    onClick={() => handleOrgStatus(o._id, 'disable')} title="Block login without deleting">
                                    Disable
                                  </button>
                                : o.isDisabled
                                ? <button className="btn btn-success btn-sm"
                                    onClick={() => handleOrgStatus(o._id, 'enable')}>
                                    Enable
                                  </button>
                                : null
                            )}
                            {/* Archive / Restore */}
                            {!o.isArchived
                              ? <button className="btn btn-secondary btn-sm"
                                  onClick={() => handleOrgStatus(o._id, 'archive')} title="Hide account; cannot log in">
                                  Archive
                                </button>
                              : <button className="btn btn-secondary btn-sm"
                                  onClick={() => handleOrgStatus(o._id, 'restore')}>
                                  Restore
                                </button>
                            }
                            {/* Reset Password */}
                            <button className="btn btn-secondary btn-sm"
                              onClick={() => { setResetTarget(o); setResetPassword(''); }}>
                              Password
                            </button>
                            {/* Permanent Delete */}
                            <button className="btn btn-danger btn-sm"
                              onClick={() => deleteOrganizer(o._id)} title="Permanently delete organizer and all their events">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Participants Tab ── */}
      {tab === 'users' && (
        <>
          <h3 style={{ marginBottom: 12 }}>Participants ({participants.length})</h3>
          {participants.length === 0 ? (
            <div className="card"><p>No participants registered yet.</p></div>
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Type</th><th>Joined</th><th>Action</th></tr>
              </thead>
              <tbody>
                {participants.map((u) => (
                  <tr key={u._id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${u.isIIITStudent ? 'badge-approved' : 'badge-registered'}`}>
                        {u.isIIITStudent ? 'IIIT Student' : 'External'}
                      </span>
                    </td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setResetTarget(u); setResetPassword(''); }}
                        >
                          Reset Password
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u._id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* ── Registrations / Attendance Tab ── */}
      {tab === 'registrations' && (() => {
        const filtered = regFilter === 'all'
          ? registrations
          : registrations.filter((r) => r.status === regFilter);
        return (
          <>
            {/* Filter buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
              <span style={{ fontWeight: 600, marginRight: 4 }}>Show:</span>
              {[['all', 'All'], ['registered', 'Registered'], ['attended', 'Attended'], ['cancelled', 'Cancelled']].map(([val, label]) => (
                <button
                  key={val}
                  className={`btn btn-sm ${regFilter === val ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setRegFilter(val)}
                >
                  {label}
                </button>
              ))}
              <span style={{ marginLeft: 'auto', color: '#666', fontSize: '0.9rem' }}>
                {filtered.length} record{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>

            {filtered.length === 0 ? (
              <div className="card"><p>No records found for this filter.</p></div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Date</th>
                    <th>Participant</th>
                    <th>Email</th>
                    <th>Type</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r._id}>
                      <td><strong>{r.event?.title || '—'}</strong></td>
                      <td>{r.event?.date ? formatDate(r.event.date) : '—'}</td>
                      <td>{r.participant?.name || '—'}</td>
                      <td>{r.participant?.email || '—'}</td>
                      <td>
                        <span className={`badge ${r.participant?.isIIITStudent ? 'badge-approved' : 'badge-registered'}`}>
                          {r.participant?.isIIITStudent ? 'IIIT' : 'External'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${
                          r.status === 'attended' ? 'approved'
                          : r.status === 'cancelled' ? 'rejected'
                          : 'pending'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        );
      })()}

      {/* ── Password Resets Tab ── */}
      {tab === 'resets' && (
        <>
          <h3 style={{ marginBottom: 8 }}>Password Reset — All Users</h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: 16 }}>
            Use the <strong>Reset Password</strong> button next to any account to set a new password on their behalf and share it with them.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 600 }}>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Action</th></tr>
              </thead>
              <tbody>
                {users.filter((u) => u.role !== 'admin').map((u) => (
                  <tr key={u._id}>
                    <td>{u.name}</td>
                    <td style={{ fontSize: '0.85rem' }}>{u.email}</td>
                    <td>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: '0.78rem', fontWeight: 600,
                        background: u.role === 'organizer' ? '#eff6ff' : '#f0fdf4', color: u.role === 'organizer' ? '#1d4ed8' : '#166534' }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: '#64748b' }}>{formatDate(u.createdAt)}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => { setResetTarget(u); setResetPassword(''); }}>
                        Reset Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Password Reset Requests Tab ── */}
      {tab === 'pwdreqs' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Organizer Password Reset Requests</h3>
            <button className="btn btn-secondary btn-sm" onClick={fetchResetRequests}>↻ Refresh</button>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: 16 }}>
            Organizers submit these requests when they cannot log in. Approve to auto-generate a new password, which you then share with them.
          </p>
          {resetRequests.length === 0 ? (
            <div className="card"><p style={{ color: '#94a3b8', textAlign: 'center' }}>No password reset requests yet.</p></div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {resetRequests.map((req) => {
                const statusColor = req.status === 'approved' ? '#059669' : req.status === 'rejected' ? '#dc2626' : '#f59e0b';
                const statusBg    = req.status === 'approved' ? '#d1fae5' : req.status === 'rejected' ? '#fee2e2' : '#fef3c7';
                return (
                  <div key={req._id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', borderLeft: `4px solid ${statusColor}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      <div>
                        <span style={{ fontWeight: 700 }}>{req.organizer?.name}</span>
                        <span style={{ color: '#64748b', marginLeft: 8, fontSize: '0.875rem' }}>{req.organizer?.email}</span>
                        {req.clubName && <span style={{ marginLeft: 8, fontSize: '0.82rem', color: '#7c3aed' }}>({req.clubName})</span>}
                      </div>
                      <span style={{ background: statusBg, color: statusColor, borderRadius: 12, padding: '2px 12px', fontSize: '0.75rem', fontWeight: 700 }}>
                        {req.status.toUpperCase()}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.875rem', marginBottom: 6 }}><strong>Reason:</strong> {req.reason}</p>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 6 }}>
                      Submitted: {formatDate(req.createdAt)}
                      {req.resolvedAt && <> · Resolved: {formatDate(req.resolvedAt)} by {req.resolvedBy?.name || 'Admin'}</>}
                    </p>
                    {req.adminComment && (
                      <p style={{ fontSize: '0.82rem', background: '#f8fafc', padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>
                        Admin note: {req.adminComment}
                      </p>
                    )}
                    {req.status === 'approved' && req.generatedPassword && (
                      <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                        <p style={{ fontSize: '0.8rem', color: '#065f46', marginBottom: 4 }}>Generated Password (share with organizer):</p>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <code style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', letterSpacing: 1 }}>{req.generatedPassword}</code>
                          <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }}
                            onClick={() => { navigator.clipboard.writeText(req.generatedPassword); notify('Copied!'); }}>
                            Copy
                          </button>
                        </div>
                      </div>
                    )}
                    {req.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button className="btn btn-success btn-sm" onClick={() => { setResolveModal({ id: req._id, action: 'approve' }); setResolveComment(''); }}>
                          Approve & Generate Password
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => { setResolveModal({ id: req._id, action: 'reject' }); setResolveComment(''); }}>
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Resolve Request Modal ── */}
      {resolveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div className="card" style={{ width: 400, margin: 0 }}>
            <h3 style={{ marginBottom: 8 }}>
              {resolveModal.action === 'approve' ? 'Approve Request' : 'Reject Request'}
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: 14 }}>
              {resolveModal.action === 'approve'
                ? 'A strong password will be auto-generated and set for the organizer. You will see it here to share with them.'
                : 'The organizer\'s account will remain unchanged.'}
            </p>
            <div className="form-group">
              <label>Admin Comment (optional)</label>
              <textarea rows={3} value={resolveComment} onChange={(e) => setResolveComment(e.target.value)}
                placeholder="e.g. Identity verified via phone call"
                style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className={`btn ${resolveModal.action === 'approve' ? 'btn-success' : 'btn-danger'}`}
                style={{ flex: 1 }} disabled={resolving} onClick={handleResolveRequest}>
                {resolving ? 'Processing…' : resolveModal.action === 'approve' ? 'Approve & Generate' : 'Reject'}
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }}
                onClick={() => { setResolveModal(null); setResolveComment(''); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Password Modal (shown after approval) ── */}
      {newPwd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300 }}>
          <div className="card" style={{ width: 420, margin: 0 }}>
            <h3 style={{ color: '#065f46', marginBottom: 8 }}>Password Reset Approved!</h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: 14 }}>
              The organizer's password has been updated. <strong>Share the new password with them via a secure channel.</strong>
            </p>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
              <p style={{ fontSize: '0.8rem', color: '#065f46', marginBottom: 6 }}>Generated Password:</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem', letterSpacing: 2, flex: 1 }}>{newPwd}</code>
                <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }}
                  onClick={() => { navigator.clipboard.writeText(newPwd); }}>Copy</button>
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setNewPwd(null)}>
              Done — I have shared the password
            </button>
          </div>
        </div>
      )}

      {/* ── Credentials Modal (shown after auto-gen account creation) ── */}
      {credsModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1100,
        }}>
          <div className="card" style={{ width: 440, margin: 0 }}>
            <h3 style={{ marginBottom: 8, color: '#065f46' }}>Account Created!</h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: 16 }}>
              Share these credentials with the club/organizer. <strong>Save them now</strong> — the password cannot be retrieved later.
            </p>
            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 2 }}>LOGIN EMAIL</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ flex: 1, background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.9rem' }}>
                    {credsModal.email}
                  </code>
                  <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }}
                    onClick={() => navigator.clipboard.writeText(credsModal.email)}>Copy</button>
                </div>
              </div>
              {credsModal.password && (
                <div>
                  <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 2 }}>PASSWORD (auto-generated)</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ flex: 1, background: '#fff', padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.9rem', letterSpacing: 2 }}>
                      {credsModal.password}
                    </code>
                    <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }}
                      onClick={() => navigator.clipboard.writeText(credsModal.password)}>Copy</button>
                  </div>
                </div>
              )}
            </div>
            <button className="btn btn-primary" onClick={() => setCredsModal(null)}>
              Done — I have saved the credentials
            </button>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ── */}
      {resetTarget && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: 380, margin: 0 }}>
            <h3 style={{ marginBottom: 8 }}>Reset Password</h3>
            <p style={{ color: '#666', marginBottom: 16, fontSize: '0.9rem' }}>
              New password for: <strong>{resetTarget.email}</strong>
            </p>
            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label>New Password</label>
                <input
                  type="text"
                  placeholder="Min 6 characters"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" type="submit" style={{ flex: 1 }}>Save Password</button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  style={{ flex: 1 }}
                  onClick={() => { setResetTarget(null); setResetPassword(''); }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
