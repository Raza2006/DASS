import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import API from '../api';

const TABS = ['All', 'Normal', 'Merchandise', 'Completed', 'Cancelled'];

function ParticipantDashboard() {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState([]);
  const [teams, setTeams]                 = useState([]);
  const [activeTab, setActiveTab] = useState('All');
  const [ticket, setTicket]       = useState(null);
  const [message, setMessage]     = useState('');
  const [error, setError]         = useState('');
  const headers = { Authorization: `Bearer ${user.token}` };

  useEffect(() => { fetchMyRegistrations(); fetchMyTeams(); }, []);

  const fetchMyRegistrations = async () => {
    try {
      const { data } = await axios.get(`${API}/registrations/my/list`, { headers });
      setRegistrations(data);
    } catch {
      setError('Could not load your registrations.');
    }
  };

  const fetchMyTeams = async () => {
    try {
      const { data } = await axios.get(`${API}/teams/mine`, { headers });
      setTeams(data || []);
    } catch { /* silent */ }
  };

  const handleCancel = async (eventId) => {
    if (!window.confirm('Cancel your registration for this event?')) return;
    try {
      await axios.delete(`${API}/registrations/${eventId}`, { headers });
      setMessage('Registration cancelled.');
      fetchMyRegistrations();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not cancel.');
      setTimeout(() => setError(''), 3000);
    }
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const now = new Date();
  const upcoming = registrations.filter((r) => {
    const evDate = r.event?.startDate || r.event?.date;
    return r.status !== 'cancelled' && evDate && new Date(evDate) >= now;
  });

  const filteredHistory = registrations.filter((r) => {
    if (activeTab === 'All')         return true;
    if (activeTab === 'Normal')      return r.event?.eventType === 'normal'      && r.status !== 'cancelled';
    if (activeTab === 'Merchandise') return r.event?.eventType === 'merchandise' && r.status !== 'cancelled' && r.paymentStatus !== 'rejected';
    if (activeTab === 'Completed')   return r.status === 'attended' || r.status === 'completed';
    if (activeTab === 'Cancelled')   return r.status === 'cancelled' || r.paymentStatus === 'rejected';
    return true;
  });

  const ticketId = (reg) => reg.ticketId || ('FEL-' + reg._id.toString().slice(-8).toUpperCase());

  return (
    <div className="page">
      <div className="section-header">
        <div>
          <h2>My Dashboard</h2>
          <p style={{ color: '#666', marginTop: 4 }}>
            Welcome, {user.firstName || user.name}!{' '}
            <span className="badge badge-approved" style={{ fontSize: '0.75rem' }}>
              {user.isIIITStudent ? 'IIIT Student' : 'External'}
            </span>
          </p>
        </div>
        <Link to="/events" className="btn btn-success" style={{ width: 'auto', textDecoration: 'none' }}>
          + Browse Events
        </Link>
      </div>

      {message && <div className="success-msg">{message}</div>}
      {error   && <div className="error-msg">{error}</div>}

      {/* ── My Teams ── */}
      {teams.length > 0 && (
        <>
          <h3 style={{ marginBottom: 12, marginTop: 8 }}>My Teams</h3>
          <div className="events-grid" style={{ marginBottom: 28 }}>
            {teams.map((team) => (
              <div className="card" key={team._id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <h3 style={{ marginBottom: 2 }}>
                      <Link to={`/events/${team.event?._id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                        {team.name}
                      </Link>
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: '#64748b' }}>{team.event?.title}</p>
                  </div>
                  <span style={{ background: team.status === 'complete' ? '#dcfce7' : team.status === 'cancelled' ? '#fee2e2' : '#fef3c7', color: team.status === 'complete' ? '#166534' : team.status === 'cancelled' ? '#991b1b' : '#92400e', borderRadius: 12, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
                    {team.status}
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', marginBottom: 4 }}>Members: {team.members?.length || 0}/{team.maxSize}</p>
                <div style={{ marginBottom: 8 }}>
                  {team.members?.map((m, i) => (
                    <span key={i} style={{ display: 'inline-block', background: '#eff6ff', color: '#1d4ed8', borderRadius: 12, padding: '2px 8px', fontSize: '0.72rem', marginRight: 4, marginBottom: 4 }}>
                      {m.user?.name || 'Member'}{team.leader?._id === m.user?._id ? ' (Leader)' : ''}
                    </span>
                  ))}
                </div>
                {team.status === 'forming' && (
                  <div style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 2 }}>Invite Code:</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <code style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700, color: '#2563eb', letterSpacing: 2 }}>{team.inviteCode}</code>
                      <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/join-team/${team.inviteCode}`); setMessage('Invite link copied!'); setTimeout(() => setMessage(''), 3000); }}
                        style={{ background: 'none', border: '1px solid #2563eb', borderRadius: 4, color: '#2563eb', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 8px' }}>
                        Copy Link
                      </button>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: 4 }}>Waiting for {team.maxSize - (team.members?.length || 0)} more member(s) to join.</p>
                  </div>
                )}
                <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{team.event?.title} · {formatDate(team.event?.startDate)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Pending Payments ── */}
      {(() => {
        const pending = registrations.filter((r) =>
          r.event?.eventType === 'merchandise' && ['pending_proof','pending_approval','rejected'].includes(r.paymentStatus)
        );
        if (pending.length === 0) return null;
        return (
          <>
            <h3 style={{ marginBottom: 12, marginTop: 8 }}>Pending Payments</h3>
            <div style={{ marginBottom: 28 }}>
              {pending.map((reg) => (
                <div className="card" key={reg._id} style={{ borderLeft: `4px solid ${reg.paymentStatus === 'rejected' ? '#ef4444' : reg.paymentStatus === 'pending_approval' ? '#f59e0b' : '#3b82f6'}`, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <h4 style={{ marginBottom: 2 }}>
                        <Link to={`/events/${reg.event?._id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{reg.event?.title}</Link>
                      </h4>
                      <p style={{ fontSize: '0.82rem', color: '#64748b' }}>{formatDate(reg.event?.startDate)} · ₹{reg.totalAmount}</p>
                    </div>
                    <span style={{ background: reg.paymentStatus === 'rejected' ? '#fee2e2' : reg.paymentStatus === 'pending_approval' ? '#fef3c7' : '#dbeafe', color: reg.paymentStatus === 'rejected' ? '#991b1b' : reg.paymentStatus === 'pending_approval' ? '#92400e' : '#1e40af', borderRadius: 12, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>
                      {reg.paymentStatus === 'rejected' ? 'Rejected' : reg.paymentStatus === 'pending_approval' ? 'Awaiting Approval' : 'Awaiting Proof'}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#475569', marginTop: 8 }}>
                    {reg.paymentStatus === 'pending_proof' ? 'Please go to the event page to upload your payment proof.' : reg.paymentStatus === 'pending_approval' ? 'Your payment proof is under review by the organizer.' : 'Your payment was rejected. Go to the event page to resubmit.'}
                  </p>
                  <div style={{ marginTop: 8 }}>
                    <Link to={`/events/${reg.event?._id}`} className="btn btn-secondary btn-sm" style={{ width: 'auto', textDecoration: 'none', display: 'inline-block' }}>
                      {reg.paymentStatus === 'pending_proof' || reg.paymentStatus === 'rejected' ? 'Upload Proof' : 'View Order'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {/* ── Upcoming Events ── */}
      <h3 style={{ marginBottom: 12, marginTop: 8 }}>Upcoming Events</h3>
      {upcoming.length === 0 ? (
        <div className="card"><p>No upcoming events. <Link to="/events">Browse and register!</Link></p></div>
      ) : (
        <div className="events-grid" style={{ marginBottom: 32 }}>
          {upcoming.map((reg) => (
            <div className="card" key={reg._id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ marginBottom: 4 }}>
                    <Link to={`/events/${reg.event?._id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                      {reg.event?.title || 'Event'}
                    </Link>
                  </h3>
                  <p style={{ fontSize: 13, color: '#64748b' }}>
                    {reg.event?.eventType === 'merchandise' ? 'Merchandise' : 'Normal'}
                    &nbsp;·&nbsp;{reg.event?.organizer?.clubName || reg.event?.clubName || '—'}
                  </p>
                </div>
                <span className={`badge badge-${reg.status}`}>{reg.status}</span>
              </div>
              <p>{formatDate(reg.event?.startDate)}</p>
              {reg.event?.endDate && <p>Ends: {formatDate(reg.event?.endDate)}</p>}
              <p>{reg.event?.venue}</p>
              {reg.totalAmount > 0 && <p>₹{reg.totalAmount}</p>}
              <div className="card-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setTicket(reg)}>
                  View Ticket
                </button>
                {reg.status === 'registered' && (
                  <button className="btn btn-danger btn-sm" onClick={() => handleCancel(reg.event?._id)}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Participation History ── */}
      <h3 style={{ marginBottom: 12 }}>Participation History</h3>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '6px 16px', borderRadius: 20, border: '2px solid',
            borderColor: activeTab === tab ? '#2563eb' : '#e2e8f0',
            background:  activeTab === tab ? '#eff6ff' : '#fff',
            color:       activeTab === tab ? '#2563eb' : '#64748b',
            fontWeight:  activeTab === tab ? 600 : 400,
            cursor: 'pointer', fontSize: '0.85rem',
          }}>
            {tab}
          </button>
        ))}
      </div>

      {filteredHistory.length === 0 ? (
        <div className="card"><p>No records in this category.</p></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Type</th>
                <th>Organizer</th>
                <th>Date</th>
                <th>Status</th>
                <th>Ticket ID</th>
                <th>Amount</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((reg) => (
                <tr key={reg._id}>
                  <td>
                    <Link to={`/events/${reg.event?._id}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500 }}>
                      {reg.event?.title || '—'}
                    </Link>
                  </td>
                  <td>{reg.event?.eventType === 'merchandise' ? 'Merch' : 'Normal'}</td>
                  <td>{reg.event?.organizer?.clubName || reg.event?.clubName || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(reg.event?.startDate)}</td>
                  <td><span className={`badge badge-${reg.status}`}>{reg.status}</span></td>
                  <td>
                    {reg.status !== 'cancelled' ? (
                      <button onClick={() => setTicket(reg)} style={{
                        background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer',
                        fontFamily: 'monospace', fontSize: '0.8rem', textDecoration: 'underline', padding: 0,
                      }}>
                        {ticketId(reg)}
                      </button>
                    ) : <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '0.8rem' }}>—</span>}
                  </td>
                  <td>
                    {reg.totalAmount > 0 ? `₹${reg.totalAmount}` : (reg.event?.registrationFee > 0 ? `₹${reg.event.registrationFee}` : 'Free')}
                  </td>
                  <td>
                    {reg.status === 'registered' && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleCancel(reg.event?._id)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ticket && <TicketModal reg={ticket} onClose={() => setTicket(null)} />}
    </div>
  );
}

// ─── Ticket Modal ──────────────────────────────────────────────────────────────
function TicketModal({ reg, onClose }) {
  const tid = reg.ticketId || ('FEL-' + reg._id.toString().slice(-8).toUpperCase());
  const qrValue = `FELICITY:${tid}`;
  const event = reg.event || {};
  const isMerch = event.eventType === 'merchandise';
  const showQR  = !reg.paymentStatus || ['not_required', 'approved'].includes(reg.paymentStatus);

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 420 }}>
        <div style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', color: '#fff', borderRadius: '8px 8px 0 0', padding: '20px 24px', margin: '-24px -24px 20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Your Ticket</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '0.9rem' }}>{event.title}</p>
        </div>

        {showQR ? (
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <QRCodeSVG value={qrValue} size={160} includeMargin level="M" />
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 2, marginTop: 10 }}>TICKET ID</p>
            <p style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: '#2563eb', letterSpacing: 2 }}>{tid}</p>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0', marginBottom: 12 }}>
            <div style={{ fontSize: '3rem' }}>{reg.paymentStatus === 'rejected' ? 'X' : '...'}</div>
            <p style={{ fontWeight: 600, color: reg.paymentStatus === 'rejected' ? '#991b1b' : '#92400e', marginTop: 8 }}>
              {reg.paymentStatus === 'rejected' ? 'Payment Rejected' : 'Awaiting Payment Approval'}
            </p>
            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>QR code will appear once payment is verified.</p>
          </div>
        )}

        <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <Row label="Event"    value={event.title} />
          <Row label="Type"     value={isMerch ? 'Merchandise' : 'Normal Event'} />
          <Row label="Date"     value={fmt(event.startDate)} />
          {event.endDate && <Row label="End Date" value={fmt(event.endDate)} />}
          <Row label="Venue"    value={event.venue} />
          <Row label="Organizer" value={event.organizer?.clubName || event.organizer?.name || event.clubName} />
          <Row label="Status"   value={reg.status} />
        </div>

        {isMerch && reg.merchandiseSelections?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }}>Order Summary</p>
            {reg.merchandiseSelections.map((sel, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>{sel.itemName}{sel.size && ` (${sel.size}`}{sel.color && `/${sel.color}`}{sel.size && ')'}</span>
                <span>×{sel.quantity} — ₹{sel.priceEach * sel.quantity}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 6 }}>
              <span>Total</span><span>₹{reg.totalAmount}</span>
            </div>
          </div>
        )}

        <p style={{ fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center', marginBottom: 16 }}>
          Show this QR code or Ticket ID at the venue for entry verification.
        </p>
        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '0.875rem' }}>
      <span style={{ color: '#64748b', minWidth: 90 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: 220, wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  );
}

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 };
const modalStyle  = { background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' };

export default ParticipantDashboard;
