import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { io as socketIO } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import API from '../api';

const SOCKET_URL = 'http://localhost:5000';

function EventDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event, setEvent]       = useState(null);
  const [myReg, setMyReg]       = useState(null);  // current user's registration
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [message, setMessage]   = useState('');

  // Modals
  const [regModal, setRegModal]         = useState(false);
  const [merchModal, setMerchModal]     = useState(false);
  const [ticketModal, setTicketModal]   = useState(false);
  const [teamModal, setTeamModal]       = useState(false);  // create team
  const [joinModal, setJoinModal]       = useState(false);  // join via code

  // Team state
  const [myTeam, setMyTeam]             = useState(null);

  // Payment proof upload
  const [proofFile, setProofFile]       = useState(null);
  const [proofUploading, setProofUploading] = useState(false);

  // Feedback
  const [myFeedback,      setMyFeedback]      = useState(null);  // null = not loaded | { submitted, rating, comment }
  const [fbRating,        setFbRating]        = useState(0);
  const [fbComment,       setFbComment]       = useState('');
  const [fbSubmitting,    setFbSubmitting]    = useState(false);

  // Registration form
  const [formResponses, setFormResponses]   = useState({});
  const [selections, setSelections]         = useState([]);
  const headers = user?.token ? { Authorization: `Bearer ${user.token}` } : {};

  const fetchEvent = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/events/${id}`, { headers });
      setEvent(data);
    } catch {
      setError('Event not found.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchMyReg = useCallback(async () => {
    if (!user?.token || user.role !== 'participant') return;
    try {
      const { data } = await axios.get(`${API}/registrations/my/list`, { headers });
      const found = data.find((r) => r.event?._id === id || r.event === id);
      setMyReg(found || null);
    } catch { /* silent */ }
  }, [id, user]);

  const fetchMyTeam = useCallback(async () => {
    if (!user?.token || user.role !== 'participant') return;
    try {
      const { data } = await axios.get(`${API}/teams/my/${id}`, { headers });
      setMyTeam(data || null);
    } catch { /* silent */ }
  }, [id, user]);

  useEffect(() => {
    fetchEvent();
    fetchMyReg();
    fetchMyTeam();
  }, [fetchEvent, fetchMyReg, fetchMyTeam]);

  // Fetch existing feedback once we know the user attended
  useEffect(() => {
    if (user?.role === 'participant' && myReg?.status === 'attended' && myFeedback === null) {
      axios.get(`${API}/feedback/${id}/mine`, { headers })
        .then(({ data }) => setMyFeedback(data))
        .catch(() => setMyFeedback({ submitted: false }));
    }
  }, [myReg?.status]);  // eslint-disable-line

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  // ── Payment proof upload ─────────────────────────────────────────────────────
  const handleProofUpload = async (e) => {
    e.preventDefault();
    if (!proofFile) { alert('Please select an image file.'); return; }
    setProofUploading(true);
    try {
      const fd = new FormData();
      fd.append('paymentProof', proofFile);
      await axios.post(`${API}/registrations/${myReg._id}/payment-proof`, fd, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      setMessage('Payment proof uploaded! Awaiting organizer approval.');
      setProofFile(null);
      fetchMyReg();
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed.');
    } finally {
      setProofUploading(false);
    }
  };

  // ── Registration gates ──────────────────────────────────────────────────────
  const now = new Date();
  const deadlinePassed = event?.registrationDeadline && new Date(event.registrationDeadline) < now;
  const isClosed       = event?.status === 'closed';
  const alreadyReg     = myReg && myReg.status !== 'cancelled';
  const isMerchandise  = event?.eventType === 'merchandise';
  const isTeamEvent    = !!event?.isTeamEvent;
  const inTeam         = !!myTeam && myTeam.status !== 'cancelled';

  // IIIT-only restriction for external participants
  const isIIITOnlyEvent    = user?.role === 'participant' && /iiit/i.test(event?.eligibility || '');
  const isExternalBlocked  = isIIITOnlyEvent && user?.isIIITStudent === false;

  // Out-of-stock check (all variants of all items exhausted)
  const allOutOfStock = isMerchandise && event?.merchandiseItems?.every(
    (item) => item.variants?.length > 0 && item.variants.every((v) => v.stock <= 0)
  );

  const canRegister = !deadlinePassed && !isClosed && !alreadyReg && !allOutOfStock
    && !isExternalBlocked
    && event?.status === 'approved';

  // ── Register / order ────────────────────────────────────────────────────────
  const openRegAction = () => {
    if (!user) { navigate('/login'); return; }
    if (isMerchandise) { setSelections([]); setMerchModal(true); }
    else if (event?.customFormFields?.length > 0) { setFormResponses({}); setRegModal(true); }
    else submitRegistration({}, []);
  };

  const submitRegistration = async (responses, merch) => {
    try {
      const { data } = await axios.post(
        `${API}/registrations/${id}`,
        { formResponses: responses, merchandiseSelections: merch },
        { headers }
      );
      setMyReg(data.registration);
      setRegModal(false);
      setMerchModal(false);
      // If merchandise requires payment, don't show ticket yet
      if (data.registration?.paymentStatus === 'pending_proof') {
        setMessage('Order placed! Please upload your payment proof below to confirm your order.');
      } else {
        setMessage('Registration successful! Check your email for your ticket.');
        setTicketModal(true);
      }
      fetchEvent();
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.');
      setTimeout(() => setError(''), 4000);
    }
  };

  const handleCancelReg = async () => {
    if (!window.confirm('Cancel your registration?')) return;
    try {
      await axios.delete(`${API}/registrations/${id}`, { headers });
      setMyReg(null);
      setMessage('Registration cancelled.');
      fetchEvent();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not cancel.');
    }
  };

  // ── Merchandise helpers ──────────────────────────────────────────────────────
  const addSelection = (itemIndex, item) =>
    setSelections((p) => [...p, { itemIndex, size: '', color: '', quantity: 1, _item: item }]);
  const updSel = (i, k, v) => setSelections((p) => { const a = [...p]; a[i] = { ...a[i], [k]: v }; return a; });
  const rmSel  = (i)        => setSelections((p) => p.filter((_, idx) => idx !== i));
  const orderTotal = selections.reduce((s, sel) => s + (sel._item?.price || 0) * (Number(sel.quantity) || 1), 0);

  if (loading) return <div className="page"><p>Loading event…</p></div>;
  if (!event)  return <div className="page"><div className="error-msg">{error || 'Event not found.'}</div></div>;

  const ticketId = myReg ? (myReg.ticketId || ('FEL-' + myReg._id.toString().slice(-8).toUpperCase())) : null;

  return (
    <div className="page">
      {message && <div className="success-msg">{message}</div>}
      {error   && <div className="error-msg">{error}</div>}

      {/* Breadcrumb */}
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 16 }}>
        <Link to="/events" style={{ color: '#2563eb' }}>Events</Link> › {event.title}
      </p>

      <div className="card">
        {/* Badges */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="badge badge-approved">{event.category}</span>
          {isMerchandise && <span className="badge badge-pending" style={{ background: '#fef3c7', color: '#92400e' }}>Merchandise</span>}
          {event.status === 'closed' && <span className="badge badge-cancelled">Full</span>}
        </div>

        <h2 style={{ marginBottom: 8 }}>{event.title}</h2>
        <p style={{ color: '#475569', lineHeight: 1.6, marginBottom: 20 }}>{event.description}</p>

        {/* Details grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12, marginBottom: 20 }}>
          <DetailBox icon="" label="Start Date" value={fmt(event.startDate || event.date)} />
          {event.endDate && <DetailBox icon="" label="End Date" value={fmt(event.endDate)} />}
          <DetailBox icon="" label="Venue" value={event.venue} />
          <DetailBox icon="" label="Organizer"
            value={<Link to={`/clubs/${event.organizer?._id}`} style={{ color: '#2563eb' }}>{event.organizer?.clubName || event.organizer?.name}</Link>} />
          <DetailBox icon="" label="Fee" value={event.registrationFee > 0 ? `₹${event.registrationFee}` : 'Free'} />
          <DetailBox icon="" label="Eligibility" value={event.eligibility || 'Open to all'} />
          {event.maxParticipants > 0 && <DetailBox icon="" label="Capacity" value={`${event.maxParticipants} spots`} />}
          {event.registrationDeadline && (
            <DetailBox icon="" label="Registration Deadline"
              value={<span style={{ color: deadlinePassed ? '#ef4444' : '#374151' }}>{fmt(event.registrationDeadline)}{deadlinePassed ? ' (Passed)' : ''}</span>} />
          )}
        </div>

        {/* Tags */}
        {event.tags?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {event.tags.map((t) => (
              <span key={t} style={{ background: '#e8f4fd', borderRadius: 12, padding: '2px 10px', marginRight: 6, color: '#1d4ed8', fontSize: '0.82rem' }}>#{t}</span>
            ))}
          </div>
        )}

        {/* Merchandise items */}
        {isMerchandise && event.merchandiseItems?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <h4 style={{ marginBottom: 8 }}>Available Items</h4>
            {event.merchandiseItems.map((item, i) => (
              <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  <span style={{ fontWeight: 700, color: '#059669' }}>₹{item.price}</span>
                </div>
                {item.description && <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0' }}>{item.description}</p>}
                {item.variants?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {item.variants.map((v, vi) => (
                      <span key={vi} style={{
                        background: v.stock > 0 ? '#f0fdf4' : '#fef2f2',
                        color: v.stock > 0 ? '#166534' : '#991b1b',
                        border: `1px solid ${v.stock > 0 ? '#bbf7d0' : '#fecaca'}`,
                        borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem',
                      }}>
                        {[v.size, v.color].filter(Boolean).join('/')} — {v.stock > 0 ? `${v.stock} left` : 'Out of stock'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Custom form notice */}
        {!isMerchandise && event.customFormFields?.length > 0 && (
          <p style={{ fontSize: '0.85rem', color: '#7c3aed', marginBottom: 20 }}>
            This event requires you to fill in {event.customFormFields.length} additional question(s) upon registration.
          </p>
        )}

        {/* Organizer card */}
        {event.organizer && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
            <p style={{ fontWeight: 600, marginBottom: 2 }}>{event.organizer.clubName || event.organizer.name}</p>
            {event.organizer.category && <span className="badge badge-registered" style={{ fontSize: '0.72rem' }}>{event.organizer.category}</span>}
            {event.organizer.description && <p style={{ fontSize: '0.85rem', color: '#475569', marginTop: 6 }}>{event.organizer.description}</p>}
            {event.organizer.contactEmail && <p style={{ fontSize: '0.85rem', color: '#2563eb', marginTop: 4 }}>{event.organizer.contactEmail}</p>}
          </div>
        )}

        {/* Action section */}
        <div style={{ gap: 10 }}>
          {user?.role === 'participant' && (
            <>
              {/* ── TEAM EVENT ── */}
              {isTeamEvent && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: '0.875rem', color: '#1e40af' }}>
                    This is a <strong>Team Event</strong> — create a team or join using an invite code (min {event.minTeamSize}, max {event.maxTeamSize} members).
                  </div>
                  {inTeam ? (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
                      <p style={{ fontWeight: 600, color: '#166534', marginBottom: 4 }}>You are in team: <strong>{myTeam.name}</strong></p>
                      <p style={{ fontSize: '0.85rem', color: '#374151', marginBottom: 4 }}>Invite Code: <strong style={{ fontFamily: 'monospace', fontSize: '1rem' }}>{myTeam.inviteCode}</strong>
                        <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/join-team/${myTeam.inviteCode}`); setMessage('Invite link copied!'); }}
                          style={{ marginLeft: 8, background: 'none', border: '1px solid #059669', borderRadius: 4, color: '#059669', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 6px' }}>
                          Copy Link
                        </button>
                      </p>
                      <p style={{ fontSize: '0.82rem', color: '#6b7280' }}>Status: <strong>{myTeam.status}</strong> · Members: {myTeam.members?.length || 0}/{myTeam.maxSize}</p>
                      {myTeam.members?.map((m, i) => (
                        <span key={i} style={{ display: 'inline-block', background: '#dcfce7', color: '#166534', borderRadius: 12, padding: '2px 8px', fontSize: '0.75rem', marginRight: 4, marginTop: 4 }}>
                          {m.user?.name || 'Member'}{myTeam.leader?._id === m.user?._id ? ' (Leader)' : ''}
                        </span>
                      ))}
                      {myTeam.status === 'complete' && alreadyReg && (
                        <button className="btn btn-secondary btn-sm" style={{ width: 'auto', marginTop: 8 }} onClick={() => setTicketModal(true)}>
                          View Ticket ({ticketId})
                        </button>
                      )}
                      {myTeam.status === 'forming' && myTeam.leader?._id === user?._id && (
                        <p style={{ fontSize: '0.8rem', color: '#f59e0b', marginTop: 6 }}>Waiting for {myTeam.maxSize - (myTeam.members?.length || 0)} more member(s) to join.</p>
                      )}
                    </div>
                  ) : isExternalBlocked ? (
                    <div className="error-msg" style={{ marginBottom: 0 }}>
                      This event is open to <strong>IIIT students only</strong>. External participants are not eligible to register.
                    </div>
                  ) : !deadlinePassed && !isClosed && ['approved','ongoing'].includes(event.status) ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-success" style={{ width: 'auto' }} onClick={() => setTeamModal(true)}>Create Team</button>
                      <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setJoinModal(true)}>Join with Code</button>
                    </div>
                  ) : (
                    <button className="btn btn-secondary" disabled style={{ width: 'auto', opacity: 0.7 }}>
                      {deadlinePassed ? 'Registration Closed' : isClosed ? 'Event Full' : 'Unavailable'}
                    </button>
                  )}
                </div>
              )}

              {/* ── NORMAL / MERCH EVENT ── */}
              {!isTeamEvent && (
                <div style={{ marginBottom: 10 }}>
                  {alreadyReg ? (
                    <div>
                      {/* Payment proof upload flow */}
                      {myReg?.paymentStatus === 'pending_proof' && (
                        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
                          <p style={{ fontWeight: 600, color: '#c2410c', marginBottom: 6 }}>Upload Payment Proof</p>
                          <p style={{ fontSize: '0.85rem', color: '#374151', marginBottom: 10 }}>Your order is placed. Please upload proof of payment (bank transfer / UPI screenshot) to complete your order.</p>
                          <form onSubmit={handleProofUpload} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <input type="file" accept="image/*" onChange={(e) => setProofFile(e.target.files[0])}
                              style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: '0.85rem' }} />
                            <button type="submit" className="btn btn-success" style={{ width: 'auto' }} disabled={proofUploading}>
                              {proofUploading ? 'Uploading…' : 'Submit Proof'}
                            </button>
                          </form>
                        </div>
                      )}
                      {myReg?.paymentStatus === 'pending_approval' && (
                        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                          <p style={{ fontWeight: 600, color: '#92400e' }}>Payment Pending Approval</p>
                          <p style={{ fontSize: '0.85rem', color: '#374151', margin: '4px 0 0' }}>Your payment proof has been submitted. The organizer will review and approve your order shortly.</p>
                          {myReg.paymentProof && <a href={myReg.paymentProof.startsWith('http') ? myReg.paymentProof : `http://localhost:5000${myReg.paymentProof}`} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: '#2563eb', marginTop: 6, display: 'inline-block' }}>View uploaded proof ↗</a>}
                        </div>
                      )}
                      {myReg?.paymentStatus === 'rejected' && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                          <p style={{ fontWeight: 600, color: '#991b1b' }}>Payment Rejected</p>
                          <p style={{ fontSize: '0.85rem', color: '#374151', margin: '4px 0 4px' }}>Your payment was rejected by the organizer. Please re-upload a valid payment proof.</p>
                          <form onSubmit={handleProofUpload} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                            <input type="file" accept="image/*" onChange={(e) => setProofFile(e.target.files[0])}
                              style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: '0.85rem' }} />
                            <button type="submit" className="btn btn-success" style={{ width: 'auto' }} disabled={proofUploading}>
                              {proofUploading ? 'Uploading…' : 'Re-submit Proof'}
                            </button>
                          </form>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {/* Only show ticket button when payment is approved or not required */}
                        {(!myReg?.paymentStatus || ['not_required','approved'].includes(myReg?.paymentStatus)) && (
                          <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setTicketModal(true)}>
                            View Ticket ({ticketId})
                          </button>
                        )}
                        {myReg?.status === 'registered' && (!myReg?.paymentStatus || myReg?.paymentStatus === 'not_required') && (
                          <button className="btn btn-danger" style={{ width: 'auto' }} onClick={handleCancelReg}>Cancel Registration</button>
                        )}
                      </div>
                    </div>
                  ) : isExternalBlocked ? (
                    <div className="error-msg" style={{ marginBottom: 0 }}>
                      This event is open to <strong>IIIT students only</strong>. External participants are not eligible to register.
                    </div>
                  ) : canRegister ? (
                    <button className="btn btn-success" style={{ width: 'auto' }} onClick={openRegAction}>
                      {isMerchandise ? 'Order Now' : 'Register Now'}
                    </button>
                  ) : (
                    <button className="btn btn-secondary" disabled style={{ width: 'auto', opacity: 0.7 }}>
                      {deadlinePassed ? 'Registration Closed' : allOutOfStock ? 'Out of Stock' : isClosed ? 'Event Full' : 'Unavailable'}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {!user && (
            <button className="btn btn-success" style={{ width: 'auto' }} onClick={() => navigate('/login')}>
              Login to {isMerchandise ? 'Order' : isTeamEvent ? 'Join' : 'Register'}
            </button>
          )}
        </div>
      </div>

      {/* ── Feedback Form (attended participants only) ── */}
      {user?.role === 'participant' && myReg?.status === 'attended' && (
        <FeedbackForm
          eventId={id}
          headers={headers}
          myFeedback={myFeedback}
          setMyFeedback={setMyFeedback}
          fbRating={fbRating}
          setFbRating={setFbRating}
          fbComment={fbComment}
          setFbComment={setFbComment}
          fbSubmitting={fbSubmitting}
          setFbSubmitting={setFbSubmitting}
          API={API}
        />
      )}

      {/* ── Discussion Forum ── */}
      {user && (myReg || (user.role === 'organizer' && event.organizer?._id === user._id) || user.role === 'admin') && (
        <ForumSection
          eventId={id}
          user={user}
          headers={headers}
          isOrganizer={user.role === 'organizer' && event.organizer?._id === user._id}
          isModerator={user.role === 'admin' || (user.role === 'organizer' && event.organizer?._id === user._id)}
        />
      )}

      {/* ── Normal registration modal ── */}
      {regModal && event.customFormFields?.length > 0 && (
        <RegFormModal
          event={event}
          formResponses={formResponses}
          setFormResponses={setFormResponses}
          onSubmit={(e) => { e.preventDefault(); submitRegistration(formResponses, []); }}
          onClose={() => setRegModal(false)}
        />
      )}

      {/* ── Merchandise order modal ── */}
      {merchModal && (
        <MerchModal
          event={event}
          selections={selections}
          orderTotal={orderTotal}
          addSelection={addSelection}
          updSel={updSel}
          rmSel={rmSel}
          onSubmit={(e) => { e.preventDefault(); submitRegistration({}, selections.map(({ itemIndex, size, color, quantity }) => ({ itemIndex, size, color, quantity: Number(quantity) || 1 }))); }}
          onClose={() => setMerchModal(false)}
        />
      )}

      {/* ── Ticket modal ── */}
      {ticketModal && myReg && (
        <TicketModal reg={myReg} event={event} onClose={() => setTicketModal(false)} />
      )}

      {/* ── Create Team modal ── */}
      {teamModal && (
        <CreateTeamModal
          event={event}
          headers={headers}
          onSuccess={(team) => { setMyTeam(team); setTeamModal(false); setMessage(`Team “${team.name}” created! Share the invite code: ${team.inviteCode}`); }}
          onClose={() => setTeamModal(false)}
        />
      )}

      {/* ── Join Team modal ── */}
      {joinModal && (
        <JoinTeamModal
          headers={headers}
          onSuccess={(team) => { setMyTeam(team); fetchMyReg(); setJoinModal(false); setMessage(`Joined team “${team.name}”! ${team.status === 'complete' ? 'Team is complete — your ticket has been sent to your email.' : ''}`); }}
          onClose={() => setJoinModal(false)}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function DetailBox({ icon, label, value }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: 2 }}>{icon} {label}</p>
      <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{value}</p>
    </div>
  );
}

function RegFormModal({ event, formResponses, setFormResponses, onSubmit, onClose }) {
  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ marginBottom: 16 }}>Register for {event.title}</h3>
        <form onSubmit={onSubmit}>
          {event.customFormFields.map((field, i) => (
            <div className="form-group" key={i}>
              <label>{field.label}{field.required && ' *'}</label>
              {field.fieldType === 'textarea' ? (
                <textarea required={field.required} value={formResponses[field.label] || ''}
                  onChange={(e) => setFormResponses((p) => ({ ...p, [field.label]: e.target.value }))} />
              ) : field.fieldType === 'select' ? (
                <select required={field.required} value={formResponses[field.label] || ''}
                  onChange={(e) => setFormResponses((p) => ({ ...p, [field.label]: e.target.value }))}>
                  <option value="">Select…</option>
                  {(field.options || []).map((opt) => <option key={opt}>{opt}</option>)}
                </select>
              ) : field.fieldType === 'checkbox' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox"
                    checked={formResponses[field.label] === 'true'}
                    onChange={(e) => setFormResponses((p) => ({ ...p, [field.label]: e.target.checked ? 'true' : 'false' }))} />
                  {field.label}
                </label>
              ) : (
                <input type={field.fieldType === 'number' ? 'number' : 'text'} required={field.required}
                  value={formResponses[field.label] || ''}
                  onChange={(e) => setFormResponses((p) => ({ ...p, [field.label]: e.target.value }))} />
              )}
            </div>
          ))}
          {event.registrationFee > 0 && <p style={{ color: '#059669', fontWeight: 600, marginBottom: 12 }}>Fee: ₹{event.registrationFee}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-success">Submit Registration</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MerchModal({ event, selections, orderTotal, addSelection, updSel, rmSel, onSubmit, onClose }) {
  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 560 }}>
        <h3 style={{ marginBottom: 4 }}>Order from {event.title}</h3>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 16 }}>Limit: {event.purchaseLimitPerParticipant || 1} item(s) total.</p>
        <form onSubmit={onSubmit}>
          {event.merchandiseItems?.map((item, idx) => (
            <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{item.name} — ₹{item.price}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => addSelection(idx, item)}>+ Add</button>
              </div>
              {item.variants?.length > 0 && (
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>
                  {item.variants.map((v) => `${[v.size, v.color].filter(Boolean).join('/')} (${v.stock})`).join(' · ')}
                </p>
              )}
            </div>
          ))}
          {selections.length > 0 && (
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, marginTop: 8 }}>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Your Cart</p>
              {selections.map((sel, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 60px auto', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem' }}>{sel._item.name}</span>
                  <input placeholder="Size" value={sel.size}   onChange={(e) => updSel(i, 'size', e.target.value)} />
                  <input placeholder="Color" value={sel.color} onChange={(e) => updSel(i, 'color', e.target.value)} />
                  <input type="number" min="1" value={sel.quantity} onChange={(e) => updSel(i, 'quantity', e.target.value)} />
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => rmSel(i)}>×</button>
                </div>
              ))}
              <p style={{ fontWeight: 700, color: '#059669' }}>Total: ₹{orderTotal}</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" className="btn btn-success" disabled={selections.length === 0}>Place Order</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TicketModal({ reg, event, onClose }) {
  const tid = reg.ticketId || ('FEL-' + reg._id.toString().slice(-8).toUpperCase());
  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const isMerch = event?.eventType === 'merchandise';
  // Only show QR when payment is not required or already approved
  const showQR  = !reg.paymentStatus || ['not_required', 'approved'].includes(reg.paymentStatus);
  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 420 }}>
        <div style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)', color: '#fff', borderRadius: '8px 8px 0 0', padding: '20px 24px', margin: '-24px -24px 20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Your Ticket</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '0.9rem' }}>{event?.title}</p>
        </div>
        {showQR ? (
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <QRCodeSVG value={`FELICITY:${tid}`} size={160} includeMargin level="M" />
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 2, marginTop: 10 }}>TICKET ID</p>
            <p style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: '#2563eb', letterSpacing: 2 }}>{tid}</p>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginBottom: 20, padding: '16px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>
              {reg.paymentStatus === 'rejected' ? 'Rejected' : 'Pending'}
            </div>
            <p style={{ fontWeight: 600, color: reg.paymentStatus === 'rejected' ? '#991b1b' : '#92400e', marginBottom: 4 }}>
              {reg.paymentStatus === 'rejected' ? 'Payment Rejected' : 'Awaiting Payment Approval'}
            </p>
            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>QR code will appear once payment is approved.</p>
          </div>
        )}
        <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <Row label="Event" value={event?.title} />
          <Row label="Type"  value={isMerch ? 'Merchandise' : 'Normal Event'} />
          <Row label="Date"  value={fmt(event?.startDate)} />
          <Row label="Venue" value={event?.venue} />
          <Row label="Status" value={reg.status} />
          {reg.paymentStatus && reg.paymentStatus !== 'not_required' && (
            <Row label="Payment" value={reg.paymentStatus.replace(/_/g, ' ')} />
          )}
        </div>
        {isMerch && reg.merchandiseSelections?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {reg.merchandiseSelections.map((sel, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span>{sel.itemName}{sel.size ? ` (${sel.size}/${sel.color})` : ''}</span>
                <span>×{sel.quantity} — ₹{sel.priceEach * sel.quantity}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 6 }}>
              <span>Total</span><span>₹{reg.totalAmount}</span>
            </div>
          </div>
        )}
        {showQR && <p style={{ fontSize: '0.72rem', color: '#94a3b8', textAlign: 'center', marginBottom: 16 }}>Show this QR code or Ticket ID at the venue for entry verification.</p>}
        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ── Create Team Modal ───────────────────────────────────────────────────
function CreateTeamModal({ event, headers, onSuccess, onClose }) {
  const API_URL = require('../api').default || require('../api');
  const [name, setName]     = useState('');
  const [size, setSize]     = useState(event.maxTeamSize || 4);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Team name is required'); return; }
    setLoading(true);
    try {
      const { data } = await (require('axios').default || require('axios')).post(
        `${API_URL}/teams`,
        { eventId: event._id, teamName: name.trim(), maxSize: size },
        { headers }
      );
      onSuccess(data);
    } catch (error) {
      setErr(error.response?.data?.message || 'Error creating team');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 400 }}>
        <h3 style={{ marginBottom: 4 }}>Create a Team</h3>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 16 }}>For <strong>{event.title}</strong></p>
        {err && <div className="error-msg" style={{ marginBottom: 10 }}>{err}</div>}
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label>Team Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Team Phoenix" required autoFocus />
          </div>
          <div className="form-group">
            <label>Team Size (incl. yourself) * &mdash; min {event.minTeamSize}, max {event.maxTeamSize}</label>
            <input type="number" min={event.minTeamSize} max={event.maxTeamSize} value={size} onChange={(e) => setSize(Number(e.target.value))} required />
          </div>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: 12 }}>You will be the team leader. Share the auto-generated invite code with your teammates.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-success" disabled={loading}>{loading ? 'Creating…' : 'Create Team'}</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Join Team Modal ────────────────────────────────────────────────────
function JoinTeamModal({ headers, onSuccess, onClose }) {
  const API_URL = require('../api').default || require('../api');
  const [code, setCode]       = useState('');
  const [teamInfo, setTeamInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');

  const lookupCode = async () => {
    if (!code.trim()) return;
    setErr('');
    try {
      const { data } = await (require('axios').default || require('axios')).get(
        `${API_URL}/teams/invite/${code.trim().toUpperCase()}`,
        { headers }
      );
      setTeamInfo(data);
    } catch (error) {
      setErr(error.response?.data?.message || 'Invalid code');
      setTeamInfo(null);
    }
  };

  const handleJoin = async () => {
    setLoading(true);
    try {
      const { data } = await (require('axios').default || require('axios')).post(
        `${API_URL}/teams/join/${code.trim().toUpperCase()}`,
        {},
        { headers }
      );
      onSuccess(data.team);
    } catch (error) {
      setErr(error.response?.data?.message || 'Error joining team');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={{ ...modalStyle, maxWidth: 400 }}>
        <h3 style={{ marginBottom: 4 }}>Join a Team</h3>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 16 }}>Enter the invite code shared by your team leader.</p>
        {err && <div className="error-msg" style={{ marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. A3B2C1" maxLength={6}
            style={{ flex: 1, fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: 2, textTransform: 'uppercase', padding: '8px 12px', border: '2px solid #cbd5e1', borderRadius: 6 }}
          />
          <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={lookupCode}>Look up</button>
        </div>
        {teamInfo && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
            <p style={{ fontWeight: 600, color: '#166534' }}>{teamInfo.name}</p>
            <p style={{ fontSize: '0.85rem', color: '#374151', margin: '2px 0' }}>Event: {teamInfo.event?.title}</p>
            <p style={{ fontSize: '0.85rem', color: '#374151', margin: '2px 0' }}>Members: {teamInfo.memberCount}/{teamInfo.maxSize} ({teamInfo.slotsLeft} slot{teamInfo.slotsLeft !== 1 ? 's' : ''} left)</p>
            <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '2px 0' }}>Status: {teamInfo.status}</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {teamInfo && teamInfo.slotsLeft > 0 && teamInfo.status === 'forming' && (
            <button className="btn btn-success" onClick={handleJoin} disabled={loading}>{loading ? 'Joining…' : 'Join Team'}</button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '0.875rem' }}>
      <span style={{ color: '#64748b', minWidth: 90 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  );
}

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 };
const modalStyle   = { background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxWidth: 480 };

// ─────────────────────────────────────────────────────────────────────────────
// Discussion Forum Section
// ─────────────────────────────────────────────────────────────────────────────
const EMOJIS = ['👍','❤️','😂','🎉','🤔','🙌'];

// ─────────────────────────────────────────────────────────────────────────────
// Anonymous Feedback Form
// ─────────────────────────────────────────────────────────────────────────────
function FeedbackForm({ eventId, headers, myFeedback, setMyFeedback, fbRating, setFbRating, fbComment, setFbComment, fbSubmitting, setFbSubmitting, API }) {
  const [localError, setLocalError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!fbRating) { setLocalError('Please select a star rating.'); return; }
    setFbSubmitting(true);
    setLocalError('');
    try {
      await axios.post(`${API}/feedback/${eventId}`, { rating: fbRating, comment: fbComment }, { headers });
      setMyFeedback({ submitted: true, rating: fbRating, comment: fbComment });
    } catch (err) {
      setLocalError(err.response?.data?.message || 'Failed to submit feedback.');
    } finally {
      setFbSubmitting(false);
    }
  };

  return (
    <div style={{ marginTop: 28, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', borderTop: '3px solid #8b5cf6' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 700 }}>Leave Feedback</h3>
      <p style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: 16 }}>Your feedback is anonymous. Help the organizer improve future events.</p>

      {myFeedback?.submitted ? (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          
          <p style={{ fontWeight: 600, color: '#059669', marginBottom: 4 }}>Thank you for your feedback!</p>
          <p style={{ fontSize: '0.875rem' }}>
            You rated this event{'★'.repeat(myFeedback.rating)}<span style={{ color: '#cbd5e1' }}>{'★'.repeat(5 - myFeedback.rating)}</span>
          </p>
          {myFeedback.comment && <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>&ldquo;{myFeedback.comment}&rdquo;</p>}
        </div>
      ) : (
        <form onSubmit={submit}>
          {localError && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 10 }}>{localError}</p>}
          {/* Star picker */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Rating</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1,2,3,4,5].map((s) => (
                <button key={s} type="button"
                  onClick={() => setFbRating(s)}
                  style={{
                    fontSize: '1.8rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px',
                    color: s <= fbRating ? '#f59e0b' : '#cbd5e1',
                    transform: s <= fbRating ? 'scale(1.15)' : 'scale(1)',
                    transition: 'all 0.15s',
                  }}>
                  ★
                </button>
              ))}
            </div>
            {fbRating > 0 && (
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                {['','Poor','Fair','Good','Very Good','Excellent'][fbRating]}
              </p>
            )}
          </div>
          {/* Comment */}
          <div className="form-group">
            <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>Comment <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
            <textarea
              value={fbComment}
              onChange={(e) => setFbComment(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="What did you like or think could be improved?"
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '2px 0 0' }}>{fbComment.length}/1000</p>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: 'auto', marginTop: 8 }}
            disabled={fbSubmitting || !fbRating}>
            {fbSubmitting ? 'Submitting…' : 'Submit Feedback'}
          </button>
        </form>
      )}
    </div>
  );
}

function ForumSection({ eventId, user, headers, isModerator }) {
  const [posts,       setPosts]       = useState([]);
  const [newMsg,      setNewMsg]      = useState('');
  const [replyTo,     setReplyTo]     = useState(null);  // { _id, authorName }
  const [loading,     setLoading]     = useState(true);
  const [submitting,  setSubmitting]  = useState(false);
  const [postType,    setPostType]    = useState('message'); // 'message' | 'announcement'
  const [newCount,    setNewCount]    = useState(0);
  const [focused,     setFocused]     = useState(false);
  const bottomRef   = useRef(null);
  const socketRef   = useRef(null);

  const fetchPosts = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/forum/${eventId}`, { headers });
      setPosts(data);
    } catch {
      // user not yet registered — silently ignore
    } finally {
      setLoading(false);
    }
  }, [eventId]);  // eslint-disable-line

  useEffect(() => {
    fetchPosts();

    // Connect socket
    const socket = socketIO(SOCKET_URL, { transports: ['polling'] });
    socketRef.current = socket;
    socket.emit('forum:join', { eventId });

    socket.on('forum:new',    (post)    => { setPosts((p) => [...p, post]); setNewCount((n) => n + 1); });
    socket.on('forum:delete', ({ _id }) => { setPosts((p) => p.map((post) => post._id === _id ? { ...post, deleted: true, content: '[deleted]' } : post)); });
    socket.on('forum:pin',    (updated) => { setPosts((p) => p.map((post) => post._id === updated._id ? updated : post).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))); });
    socket.on('forum:react',  (updated) => { setPosts((p) => p.map((post) => post._id === updated._id ? updated : post)); });

    return () => {
      socket.emit('forum:leave', { eventId });
      socket.disconnect();
    };
  }, [eventId, fetchPosts]);

  // Auto-scroll when new message arrives and user hasn't scrolled up
  useEffect(() => {
    if (focused) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [posts.length, focused]);

  const submit = async (e) => {
    e.preventDefault();
    if (!newMsg.trim()) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/forum/${eventId}`, {
        content:  newMsg.trim(),
        type:     postType,
        parentId: replyTo?._id || null,
      }, { headers });
      setNewMsg('');
      setReplyTo(null);
      setPostType('message');
      setNewCount(0);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to post');
    } finally {
      setSubmitting(false);
    }
  };

  const deletePost = async (postId) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await axios.delete(`${API}/forum/${postId}`, { headers });
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete');
    }
  };

  const pinPost = async (postId) => {
    try {
      await axios.patch(`${API}/forum/${postId}/pin`, {}, { headers });
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to pin');
    }
  };

  const react = async (postId, emoji) => {
    if (!user) return;
    try {
      await axios.patch(`${API}/forum/${postId}/react`, { emoji }, { headers });
    } catch { /* ignore */ }
  };

  // Build threaded structure
  const topLevel = posts.filter((p) => !p.parentId);
  const replies  = (parentId) => posts.filter((p) => p.parentId === parentId);

  const fmtTime = (d) => {
    const dt = new Date(d);
    const now = new Date();
    const diff = (now - dt) / 1000;
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return dt.toLocaleDateString();
  };

  const PostCard = ({ post, depth = 0 }) => {
    const isOwn    = post.author?._id === user?._id || post.author === user?._id;
    const canDel   = isModerator || isOwn;
    const authorRole = post.author?.role;
    const badgeColor = authorRole === 'admin' ? '#dc2626' : authorRole === 'organizer' ? '#7c3aed' : '#2563eb';
    const borderColor = post.type === 'announcement' ? '#f59e0b' : post.pinned ? '#8b5cf6' : '#e2e8f0';

    return (
      <div style={{
        marginLeft: depth * 24,
        marginBottom: 8,
        border: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 8,
        padding: '10px 14px',
        background: post.type === 'announcement' ? '#fffbeb' : post.pinned ? '#f5f3ff' : '#fff',
        opacity: post.deleted ? 0.5 : 1,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{post.author?.name || 'Unknown'}</span>
            {authorRole && authorRole !== 'participant' && (
              <span style={{ background: `${badgeColor}20`, color: badgeColor, borderRadius: 10, padding: '1px 8px', fontSize: '0.7rem', fontWeight: 700 }}>
                {authorRole === 'organizer' ? post.author?.clubName || 'Organizer' : 'Admin'}
              </span>
            )}
            {post.type === 'announcement' && <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 10, padding: '1px 8px', fontSize: '0.7rem', fontWeight: 700 }}>Announcement</span>}
            {post.pinned && !post.deleted && <span style={{ background: '#ede9fe', color: '#7c3aed', borderRadius: 10, padding: '1px 8px', fontSize: '0.7rem', fontWeight: 600 }}>Pinned</span>}
          </div>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtTime(post.createdAt)}</span>
        </div>

        <p style={{ fontSize: '0.875rem', margin: '0 0 8px', wordBreak: 'break-word', color: post.deleted ? '#94a3b8' : '#1e293b', fontStyle: post.deleted ? 'italic' : 'normal' }}>
          {post.parentId && <span style={{ color: '#7c3aed', marginRight: 4 }}>↩</span>}
          {post.content}
        </p>

        {/* Reactions */}
        {!post.deleted && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            {post.reactions?.map((r) => (
              <button key={r.emoji} onClick={() => react(post._id, r.emoji)}
                style={{ background: r.users?.includes(user?._id) ? '#dbeafe' : '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12, padding: '2px 8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                {r.emoji} {r.users?.length}
              </button>
            ))}
            {/* Emoji picker */}
            {user && (
              <div style={{ display: 'flex', gap: 2 }}>
                {EMOJIS.map((em) => (
                  <button key={em} onClick={() => react(post._id, em)}
                    title={`React ${em}`}
                    style={{ background: 'none', border: 'none', fontSize: '0.9rem', cursor: 'pointer', opacity: 0.5, padding: '1px 3px' }}>
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        {!post.deleted && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {user && depth === 0 && (
              <button onClick={() => setReplyTo({ _id: post._id, authorName: post.author?.name })}
                style={{ fontSize: '0.75rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Reply
              </button>
            )}
            {isModerator && (
              <button onClick={() => pinPost(post._id)}
                style={{ fontSize: '0.75rem', color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {post.pinned ? 'Unpin' : 'Pin'}
              </button>
            )}
            {canDel && (
              <button onClick={() => deletePost(post._id)}
                style={{ fontSize: '0.75rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginTop: 32, borderTop: '2px solid #e2e8f0', paddingTop: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
          Discussion Forum
          {newCount > 0 && !focused && (
            <span style={{ background: '#ef4444', color: '#fff', borderRadius: 12, padding: '2px 8px', fontSize: '0.72rem', marginLeft: 8, fontWeight: 700 }}>
              {newCount} new
            </span>
          )}
        </h3>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{posts.filter(p => !p.deleted).length} message{posts.filter(p => !p.deleted).length !== 1 ? 's' : ''}</span>
      </div>

      {/* Posts list */}
      <div
        style={{ maxHeight: 420, overflowY: 'auto', padding: '0 4px', marginBottom: 16 }}
        onFocus={() => { setFocused(true); setNewCount(0); }}
        onMouseEnter={() => setNewCount(0)}
      >
        {loading && <p style={{ color: '#94a3b8', textAlign: 'center' }}>Loading messages…</p>}
        {!loading && topLevel.length === 0 && (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No messages yet. Be the first to post!</p>
        )}
        {topLevel.map((post) => (
          <div key={post._id}>
            <PostCard post={post} depth={0} />
            {replies(post._id).map((r) => (
              <PostCard key={r._id} post={r} depth={1} />
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Compose area */}
      {user && (
        <form onSubmit={submit} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
          {replyTo && (
            <div style={{ background: '#ede9fe', borderRadius: 6, padding: '4px 10px', marginBottom: 8, fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>↩ Replying to <strong>{replyTo.authorName}</strong></span>
              <button type="button" onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontWeight: 700 }}>✕</button>
            </div>
          )}
          {isModerator && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {['message', 'announcement'].map((t) => (
                <label key={t} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  <input type="radio" checked={postType === t} onChange={() => setPostType(t)} />
                  {t === 'announcement' ? 'Announcement' : 'Message'}
                </label>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e); } }}
              placeholder={replyTo ? `Reply to ${replyTo.authorName}…` : 'Write a message… (Enter to send, Shift+Enter for new line)'}
              rows={2}
              maxLength={2000}
              style={{ flex: 1, borderRadius: 8, border: '1px solid #e2e8f0', padding: '8px 12px', fontSize: '0.875rem', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <button type="submit" className="btn btn-primary" style={{ width: 'auto', alignSelf: 'flex-end' }} disabled={submitting || !newMsg.trim()}>
              {submitting ? '…' : 'Send'}
            </button>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '4px 0 0' }}>{newMsg.length}/2000</p>
        </form>
      )}
    </div>
  );
}

export default EventDetailsPage;
