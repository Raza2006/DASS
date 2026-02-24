import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';

const STATUS_COLORS = {
  draft:     { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  pending:   { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  approved:  { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
  rejected:  { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  ongoing:   { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
  completed: { bg: '#ede9fe', color: '#5b21b6', border: '#c4b5fd' },
  closed:    { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
};

// Carousel + Analytics dashboard for organizers
function OrganizerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const headers  = { Authorization: `Bearer ${user.token}` };

  const [events, setEvents]         = useState([]);
  const [analytics, setAnalytics]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const [message, setMessage]       = useState('');
  const [error, setError]           = useState('');

  // Password reset request
  const [resetRequests,   setResetRequests]   = useState([]);
  const [resetReason,     setResetReason]     = useState('');
  const [submittingReset, setSubmittingReset] = useState(false);
  const [showResetForm,   setShowResetForm]   = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, anlRes] = await Promise.all([
        axios.get(`${API}/events/organizer/my-events`, { headers }),
        axios.get(`${API}/organizer/analytics`, { headers }),
      ]);
      setEvents(evRes.data);
      setAnalytics(anlRes.data);
    } catch {
      setError('Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchResetRequests = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/organizer/password-reset-requests`, { headers });
      setResetRequests(data);
    } catch { /* ignore */ }
  }, []);

  const submitResetRequest = async (e) => {
    e.preventDefault();
    if (!resetReason.trim()) return;
    setSubmittingReset(true);
    try {
      await axios.post(`${API}/organizer/password-reset-request`, { reason: resetReason.trim() }, { headers });
      setMessage('Password reset request submitted. The Admin will review it shortly.');
      setResetReason('');
      setShowResetForm(false);
      fetchResetRequests();
      setTimeout(() => setMessage(''), 5000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit request.');
      setTimeout(() => setError(''), 5000);
    } finally {
      setSubmittingReset(false);
    }
  };

  useEffect(() => { fetchAll(); fetchResetRequests(); }, [fetchAll, fetchResetRequests]);

  const handleDelete = async (eventId) => {
    if (!window.confirm('Delete this event? This cannot be undone.')) return;
    try {
      await axios.delete(`${API}/events/${eventId}`, { headers });
      setMessage('Event deleted.');
      fetchAll();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete event.');
      setTimeout(() => setError(''), 4000);
    }
  };

  const handleStatusChange = async (eventId, newStatus) => {
    try {
      const { data } = await axios.patch(
        `${API}/organizer/events/${eventId}/status`,
        { status: newStatus },
        { headers }
      );
      setMessage(`Status updated to "${data.status}"`);
      fetchAll();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Status change failed.');
      setTimeout(() => setError(''), 4000);
    }
  };

  const completedEvents = events.filter((e) => ['completed', 'ongoing', 'closed'].includes(e.status));
  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  if (loading) return <div className="page"><p>Loading dashboard…</p></div>;

  return (
    <div className="page">
      {/* Header */}
      <div className="section-header" style={{ marginBottom: 24 }}>
        <div>
          <h2>Organizer Dashboard</h2>
          <p style={{ color: '#64748b', marginTop: 2 }}>{user.clubName || user.name}</p>
        </div>
        <button className="btn btn-success" style={{ width: 'auto' }}
          onClick={() => navigate('/organizer/create-event')}>
          + Create Event
        </button>
      </div>

      {message && <div className="success-msg">{message}</div>}
      {error   && <div className="error-msg">{error}</div>}

      {/* ── Summary Stats ── */}
      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 32 }}>
          <StatCard label="Total Events"  value={events.length}                 onClick={() => document.getElementById('org-events')?.scrollIntoView({ behavior: 'smooth' })} />
          <StatCard label="Registrations" value={analytics.totalRegistrations}  onClick={() => document.getElementById('org-analytics')?.scrollIntoView({ behavior: 'smooth' })} />
          <StatCard label="Attended"      value={analytics.totalAttended}        onClick={() => document.getElementById('org-analytics')?.scrollIntoView({ behavior: 'smooth' })} />
          <StatCard label="Revenue"       value={`\u20b9${analytics.totalRevenue}`} onClick={() => document.getElementById('org-analytics')?.scrollIntoView({ behavior: 'smooth' })} />
          {analytics.totalSales > 0 && <StatCard label="Merch Sales" value={analytics.totalSales} onClick={() => document.getElementById('org-events')?.scrollIntoView({ behavior: 'smooth' })} />}
        </div>
      )}

      {/* ── Events Carousel ── */}
      <h3 id="org-events" style={{ marginBottom: 12, color: '#1e293b' }}>Your Events</h3>
      {events.length === 0 ? (
        <div className="card">
          <p style={{ color: '#888', textAlign: 'center', padding: '24px 0' }}>
            No events yet.{' '}
            <Link to="/organizer/create-event" style={{ color: '#2563eb' }}>Create your first event →</Link>
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 12, marginBottom: 32 }}>
          {events.map((ev) => {
            const sc = STATUS_COLORS[ev.status] || STATUS_COLORS.pending;
            return (
              <div key={ev._id} style={{
                minWidth: 220, maxWidth: 240, background: '#fff', borderRadius: 12,
                border: `1.5px solid ${sc.border}`, padding: '16px 18px', flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
              }}>
                <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: sc.bg, color: sc.color, marginBottom: 8 }}>
                  {ev.status.toUpperCase()}
                </span>
                <p style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 4, lineHeight: 1.3 }}>{ev.title}</p>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 2 }}>
                  {ev.eventType === 'merchandise' ? 'Merch' : 'Normal'} · {ev.category}
                </p>
                <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 12 }}>{fmt(ev.startDate)}</p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <Link to={`/organizer/events/${ev._id}`}
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: 'none', fontSize: '0.75rem', padding: '4px 10px' }}>
                    View
                  </Link>
                  {ev.status === 'draft' && (
                    <>
                      <Link to={`/organizer/events/${ev._id}?edit=1`}
                        className="btn btn-secondary btn-sm"
                        style={{ textDecoration: 'none', fontSize: '0.75rem', padding: '4px 10px' }}>
                        Edit
                      </Link>
                      <button className="btn btn-success btn-sm"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => handleStatusChange(ev._id, 'pending')}>
                        Publish
                      </button>
                      <button className="btn btn-danger btn-sm"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => handleDelete(ev._id)}>
                        Delete
                      </button>
                    </>
                  )}
                  {ev.status === 'pending' && (
                    <button className="btn btn-danger btn-sm"
                      style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                      onClick={() => handleDelete(ev._id)}>
                      Delete
                    </button>
                  )}
                  {ev.status === 'approved' && (
                    <>
                      <Link to={`/organizer/events/${ev._id}?edit=1`}
                        className="btn btn-secondary btn-sm"
                        style={{ textDecoration: 'none', fontSize: '0.75rem', padding: '4px 10px' }}>
                        Edit
                      </Link>
                      <button className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' }}
                        onClick={() => handleStatusChange(ev._id, 'ongoing')}>
                        Mark Ongoing
                      </button>
                      <button className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => handleStatusChange(ev._id, 'closed')}>
                        Close Reg.
                      </button>
                    </>
                  )}
                  {ev.status === 'ongoing' && (
                    <button className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd' }}
                      onClick={() => handleStatusChange(ev._id, 'completed')}>
                      Mark Completed
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Analytics Table ── */}
      {completedEvents.length > 0 && analytics?.perEvent && (
        <>
          <h3 id="org-analytics" style={{ marginBottom: 12, color: '#1e293b' }}>Event Analytics</h3>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  {['Event', 'Status', 'Registrations', 'Attended', 'Attendance %', 'Revenue'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.perEvent
                  .filter((e) => completedEvents.find((ev) => ev._id === e._id?.toString() || ev._id.toString() === e._id?.toString()))
                  .map((e) => {
                    const rate = e.registrations > 0 ? Math.round((e.attended / e.registrations) * 100) : 0;
                    const sc   = STATUS_COLORS[e.status] || {};
                    return (
                      <tr key={e._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <Link to={`/organizer/events/${e._id}`} style={{ color: '#2563eb', fontWeight: 600 }}>{e.title}</Link>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 12, background: sc.bg, color: sc.color, fontSize: '0.75rem', fontWeight: 600 }}>
                            {e.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>{e.registrations}</td>
                        <td style={{ padding: '10px 14px' }}>{e.attended}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3 }}>
                              <div style={{ width: `${rate}%`, height: '100%', background: '#2563eb', borderRadius: 3 }} />
                            </div>
                            <span style={{ minWidth: 32, fontSize: '0.8rem' }}>{rate}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#059669' }}>₹{e.revenue}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Password Reset Request ── */}
      <div style={{ marginTop: 36, borderTop: '2px solid #e2e8f0', paddingTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Password Reset Requests</h3>
            <p style={{ color: '#64748b', fontSize: '0.82rem', marginTop: 2 }}>
              If you are locked out or need a new password, submit a request for the Admin to review.
            </p>
          </div>
          {!showResetForm && (
            <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }}
              onClick={() => setShowResetForm(true)}>
              + New Request
            </button>
          )}
        </div>

        {showResetForm && (
          <form onSubmit={submitResetRequest} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600 }}>Reason for password reset</label>
              <textarea
                rows={3} value={resetReason} onChange={(e) => setResetReason(e.target.value)}
                placeholder="Describe why you need a password reset (e.g. forgot password, compromised account)…"
                maxLength={500}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
                required
              />
              <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '2px 0 0' }}>{resetReason.length}/500</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submittingReset || !resetReason.trim()}>
                {submittingReset ? 'Submitting…' : 'Submit Request'}
              </button>
              <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => { setShowResetForm(false); setResetReason(''); }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {resetRequests.length > 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {resetRequests.map((req) => {
              const statusColor = req.status === 'approved' ? '#059669' : req.status === 'rejected' ? '#dc2626' : '#f59e0b';
              const statusBg    = req.status === 'approved' ? '#d1fae5' : req.status === 'rejected' ? '#fee2e2' : '#fef3c7';
              return (
                <div key={req._id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: `4px solid ${statusColor}`, borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <p style={{ fontSize: '0.875rem', margin: 0 }}><strong>Reason:</strong> {req.reason}</p>
                    <span style={{ background: statusBg, color: statusColor, borderRadius: 10, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700, marginLeft: 8, whiteSpace: 'nowrap' }}>
                      {req.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0' }}>
                    Requested: {new Date(req.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {req.resolvedAt && ` · Resolved: ${new Date(req.resolvedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                  </p>
                  {req.adminComment && (
                    <p style={{ fontSize: '0.82rem', color: '#475569', background: '#f8fafc', padding: '4px 8px', borderRadius: 6, marginTop: 4 }}>
                      Admin: {req.adminComment}
                    </p>
                  )}
                  {req.status === 'approved' && (
                    <p style={{ fontSize: '0.82rem', color: '#059669', marginTop: 4 }}>
                      Your password has been reset. Please login with the new credentials shared by the Admin.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          !showResetForm && <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>No password reset requests yet.</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, onClick }) {
  return (
    <div
      className={`stat-box${onClick ? ' stat-box-link' : ''}`}
      onClick={onClick}
    >
      <h2>{value}</h2>
      <p>{label}</p>
    </div>
  );
}

export default OrganizerDashboard;
