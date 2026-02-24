import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';

// Shows all approved events to anyone
function EventsPage() {
  const [events, setEvents] = useState([]);
  const [recommendedCount, setRecommendedCount] = useState(0);
  const [registeredEventIds, setRegisteredEventIds] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Search & filter state
  const [searchQuery, setSearchQuery]         = useState('');
  const [searchResults, setSearchResults]     = useState(null); // null = not searching
  const [trendingEvents, setTrendingEvents]   = useState([]);
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState('');
  const [dateFrom, setDateFrom]               = useState('');
  const [dateTo, setDateTo]                   = useState('');
  const [followedOnly, setFollowedOnly]       = useState(false);
  const [searchLoading, setSearchLoading]     = useState(false);

  // Modal state
  const [regModal, setRegModal]   = useState(null); // { event }
  const [merchModal, setMerchModal] = useState(null); // { event }
  const [formResponses, setFormResponses] = useState({});
  const [selections, setSelections] = useState([]); // merchandise order items

  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const fetchEvents = async () => {
    try {
      const config = user?.token ? { headers: { Authorization: `Bearer ${user.token}` } } : {};
      const { data } = await axios.get(`${API}/events`, config);
      setEvents(data.events || data);
      setRecommendedCount(data.recommendedCount || 0);
    } catch {
      setError('Could not load events.');
    }
  };

  const fetchTrending = async () => {
    try {
      const { data } = await axios.get(`${API}/events/trending`);
      setTrendingEvents(data);
    } catch { /* silent */ }
  };

  const fetchMyRegistrations = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/registrations/my/list`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setRegisteredEventIds(
        data.filter((r) => r.status !== 'cancelled').map((r) => String(r.event?._id || r.event))
      );
    } catch { /* silent */ }
  }, [user]);

  const runSearch = useCallback(async () => {
    const params = {};
    if (searchQuery.trim())    params.q           = searchQuery.trim();
    if (eventTypeFilter)       params.eventType   = eventTypeFilter;
    if (eligibilityFilter)     params.eligibility = eligibilityFilter;
    if (dateFrom)              params.from        = dateFrom;
    if (dateTo)                params.to          = dateTo;
    if (followedOnly && user)  params.followed    = 'true';

    const hasFilter = Object.keys(params).length > 0;
    if (!hasFilter) { setSearchResults(null); return; }

    setSearchLoading(true);
    try {
      const config = user?.token ? { headers: { Authorization: `Bearer ${user.token}` } } : {};
      const { data } = await axios.get(`${API}/events/search`, { params, ...config });
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, eventTypeFilter, eligibilityFilter, dateFrom, dateTo, followedOnly, user]);

  // Debounce search on query/filter change
  useEffect(() => {
    const t = setTimeout(() => runSearch(), 350);
    return () => clearTimeout(t);
  }, [runSearch]);

  useEffect(() => {
    fetchEvents();
    fetchTrending();
    if (user?.role === 'participant') fetchMyRegistrations();
  }, [user, fetchMyRegistrations, location.pathname]);

  const clearSearch = () => {
    setSearchQuery('');
    setEventTypeFilter('');
    setEligibilityFilter('');
    setDateFrom('');
    setDateTo('');
    setFollowedOnly(false);
    setSearchResults(null);
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  // ── Normal event registration ───────────────────────────────────────────────
  const openRegModal = (event) => {
    if (!user) { navigate('/login'); return; }
    if (!event.customFormFields?.length) {
      // No custom form — register directly
      submitRegistration(event._id, {}, []);
      return;
    }
    setFormResponses({});
    setRegModal({ event });
  };

  const submitRegistration = async (eventId, responses, merch) => {
    try {
      await axios.post(
        `${API}/registrations/${eventId}`,
        { formResponses: responses, merchandiseSelections: merch },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      setRegisteredEventIds((prev) => [...prev, eventId]);
      setMessage('Successfully registered!');
      setRegModal(null);
      setMerchModal(null);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.');
      setTimeout(() => setError(''), 4000);
    }
  };

  const handleRegFormSubmit = (e) => {
    e.preventDefault();
    submitRegistration(regModal.event._id, formResponses, []);
  };

  // ── Merchandise order ───────────────────────────────────────────────────────
  const openMerchModal = (event) => {
    if (!user) { navigate('/login'); return; }
    setSelections([]); // reset
    setMerchModal({ event });
  };

  const addSelection = (itemIndex, item) =>
    setSelections((prev) => [...prev, { itemIndex, size: '', color: '', quantity: 1, _item: item }]);

  const updateSelection = (i, field, value) =>
    setSelections((prev) => {
      const updated = [...prev];
      updated[i] = { ...updated[i], [field]: value };
      return updated;
    });

  const removeSelection = (i) =>
    setSelections((prev) => prev.filter((_, idx) => idx !== i));

  const handleMerchSubmit = (e) => {
    e.preventDefault();
    const payload = selections.map(({ itemIndex, size, color, quantity }) => ({
      itemIndex, size, color, quantity: Number(quantity) || 1,
    }));
    submitRegistration(merchModal.event._id, {}, payload);
  };

  const orderTotal = selections.reduce((sum, s) => sum + (s._item?.price || 0) * (Number(s.quantity) || 1), 0);

  // ── Render ──────────────────────────────────────────────────────────────────
  const isExternalParticipant = user?.role === 'participant' && user?.isIIITStudent === false;
  const rawDisplay   = searchResults !== null ? searchResults : events;
  // Hide IIIT-only events entirely from external participants
  const displayEvents = isExternalParticipant
    ? rawDisplay.filter((ev) => !/iiit/i.test(ev.eligibility || ''))
    : rawDisplay;
  const isFiltering   = searchResults !== null;

  return (
    <div className="page">
      <div className="section-header">
        <h2>Events</h2>
      </div>

      {message && <div className="success-msg">{message}</div>}
      {error   && <div className="error-msg">{error}</div>}

      {/* ── Search bar ── */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search events or organizers…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.95rem', outline: 'none' }}
        />
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', cursor: 'pointer' }}>
          <option value="">All Types</option>
          <option value="normal">Normal</option>
          <option value="merchandise">Merchandise</option>
        </select>

        <input type="text" placeholder="Eligibility…" value={eligibilityFilter}
          onChange={(e) => setEligibilityFilter(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', width: 130 }} />

        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          title="From date"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }} />
        <span style={{ color: '#94a3b8' }}>–</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          title="To date"
          style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }} />

        {user?.role === 'participant' && (
          <button
            className={followedOnly ? 'btn btn-success btn-sm' : 'btn btn-secondary btn-sm'}
            style={{ width: 'auto' }}
            onClick={() => setFollowedOnly((p) => !p)}
          >
            {followedOnly ? 'My Clubs' : 'My Clubs'}
          </button>
        )}

        {isFiltering && (
          <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={clearSearch}>
            Clear
          </button>
        )}
      </div>

      {/* ── Trending section (hide when actively filtering) ── */}
      {!isFiltering && trendingEvents.filter((ev) => !isExternalParticipant || !/iiit/i.test(ev.eligibility || '')).length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontWeight: 600, color: '#dc2626', marginBottom: 10 }}>Trending (last 24h)</p>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
            {trendingEvents.filter((ev) => !isExternalParticipant || !/iiit/i.test(ev.eligibility || '')).map((ev) => (
              <Link key={ev._id} to={`/events/${ev._id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  minWidth: 180, maxWidth: 200, background: '#fff', border: '1.5px solid #fecaca',
                  borderRadius: 10, padding: '12px 14px', flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.07)', cursor: 'pointer',
                }}>
                  <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', marginBottom: 4, lineHeight: 1.3 }}>{ev.title}</p>
                  <p style={{ fontSize: '0.75rem', color: '#64748b' }}>{ev.organizer?.clubName || ev.organizer?.name}</p>
                  <span className="badge badge-approved" style={{ marginTop: 4, fontSize: '0.7rem' }}>{ev.category}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Results label ── */}
      {isFiltering && (
        <p style={{ color: '#475569', fontWeight: 600, marginBottom: 12 }}>
          {searchLoading ? 'Searching…' : `${displayEvents.length} result(s) found`}
        </p>
      )}

      {displayEvents.length === 0 && !searchLoading ? (
        <p style={{ color: '#888', marginTop: 16 }}>{isFiltering ? 'No events match your search.' : 'No events available right now. Check back soon!'}</p>
      ) : (
        <>
          {!isFiltering && recommendedCount > 0 && (
            <>
              <p style={{ color: '#2563eb', fontWeight: 600, marginBottom: 12 }}>
                Recommended for you ({recommendedCount})
              </p>
              <div className="events-grid" style={{ marginBottom: 32 }}>
                {displayEvents.slice(0, recommendedCount).map((ev) => renderCard(ev))}
              </div>
              {displayEvents.length > recommendedCount && (
                <>
                  <p style={{ fontWeight: 600, color: '#475569', marginBottom: 12 }}>Other Events</p>
                  <div className="events-grid">{displayEvents.slice(recommendedCount).map((ev) => renderCard(ev))}</div>
                </>
              )}
            </>
          )}
          {(isFiltering || recommendedCount === 0) && (
            <div className="events-grid">{displayEvents.map((ev) => renderCard(ev))}</div>
          )}
        </>
      )}

      {/* ── Normal registration modal ── */}
      {regModal && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3>Register for {regModal.event.title}</h3>
            <p style={{ color: '#555', marginBottom: 16 }}>Please fill in the registration form below.</p>
            <form onSubmit={handleRegFormSubmit}>
              {regModal.event.customFormFields.map((field, i) => (
                <div className="form-group" key={i}>
                  <label>{field.label}{field.required && ' *'}</label>
                  {field.fieldType === 'textarea' ? (
                    <textarea required={field.required}
                      value={formResponses[field.label] || ''}
                      onChange={(e) => setFormResponses((p) => ({ ...p, [field.label]: e.target.value }))} />
                  ) : field.fieldType === 'select' ? (
                    <select required={field.required}
                      value={formResponses[field.label] || ''}
                      onChange={(e) => setFormResponses((p) => ({ ...p, [field.label]: e.target.value }))}>
                      <option value="">Select…</option>
                      {(field.options || []).map((opt) => <option key={opt}>{opt}</option>)}
                    </select>
                  ) : field.fieldType === 'checkbox' ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                      <input type="checkbox"
                        checked={formResponses[field.label] === 'true'}
                        onChange={(e) => setFormResponses((p) => ({ ...p, [field.label]: e.target.checked ? 'true' : 'false' }))} />
                      {field.label}
                    </label>
                  ) : (
                    <input type={field.fieldType === 'number' ? 'number' : 'text'}
                      required={field.required}
                      value={formResponses[field.label] || ''}
                      onChange={(e) => setFormResponses((p) => ({ ...p, [field.label]: e.target.value }))} />
                  )}
                </div>
              ))}
              {regModal.event.registrationFee > 0 && (
                <p style={{ color: '#059669', fontWeight: 600, marginBottom: 12 }}>
                  Registration fee: ₹{regModal.event.registrationFee}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-success">Submit</button>
                <button type="button" className="btn btn-secondary" onClick={() => setRegModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Merchandise order modal ── */}
      {merchModal && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 600 }}>
            <h3>Order from {merchModal.event.title}</h3>
            <p style={{ color: '#555', marginBottom: 12 }}>
              Purchase limit: {merchModal.event.purchaseLimitPerParticipant || 1} item(s) total.
            </p>
            <form onSubmit={handleMerchSubmit}>
              {/* Available items */}
              {merchModal.event.merchandiseItems?.map((item, idx) => (
                <div key={idx} style={{ borderRadius: 8, border: '1px solid #e0e0e0', padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{item.name} — ₹{item.price}</span>
                    <button type="button" className="btn btn-secondary btn-sm"
                      onClick={() => addSelection(idx, item)}>+ Add</button>
                  </div>
                  {item.description && <p style={{ fontSize: 13, color: '#666' }}>{item.description}</p>}
                  {item.variants?.length > 0 && (
                    <p style={{ fontSize: 12, color: '#888' }}>
                      Variants: {item.variants.map((v) => `${v.size}/${v.color} (${v.stock} left)`).join(' · ')}
                    </p>
                  )}
                </div>
              ))}

              {/* Cart */}
              {selections.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontWeight: 600, marginBottom: 6 }}>Your Order:</p>
                  {selections.map((sel, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 60px auto', gap: 6, marginBottom: 6 }}>
                      <span style={{ alignSelf: 'center', fontSize: 13 }}>{sel._item.name}</span>
                      <input placeholder="Size" value={sel.size}
                        onChange={(e) => updateSelection(i, 'size', e.target.value)} />
                      <input placeholder="Color" value={sel.color}
                        onChange={(e) => updateSelection(i, 'color', e.target.value)} />
                      <input type="number" min="1" value={sel.quantity}
                        onChange={(e) => updateSelection(i, 'quantity', e.target.value)} />
                      <button type="button" className="btn btn-danger btn-sm"
                        onClick={() => removeSelection(i)}>×</button>
                    </div>
                  ))}
                  <p style={{ fontWeight: 700, color: '#059669', marginTop: 8 }}>
                    Total: ₹{orderTotal}
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="submit" className="btn btn-success" disabled={selections.length === 0}>
                  Place Order
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setMerchModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  function renderCard(event) {
    const isMerchandise = event.eventType === 'merchandise';
    const isRegistered  = registeredEventIds.includes(String(event._id));
    return (
      <div className="card" key={event._id}>
        {/* Badges */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-approved">{event.category}</span>
          {isMerchandise && (
            <span className="badge badge-pending" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
              Merchandise
            </span>
          )}
        </div>

        <h3>{event.title}</h3>
        <p>{event.description}</p>

        {/* Dates */}
        <p>{formatDate(event.startDate || event.date)}
          {event.endDate && ` – ${formatDate(event.endDate)}`}
        </p>
        <p>{event.venue}</p>
        <p>{event.organizer?.clubName || event.organizer?.name}</p>

        {/* Fee */}
        {event.registrationFee > 0
          ? <p style={{ fontWeight: 600, color: '#059669' }}>₹{event.registrationFee}</p>
          : <p style={{ color: '#059669' }}>Free</p>
        }

        {/* Eligibility */}
        {event.eligibility && event.eligibility !== 'Open to all' && (
          <p style={{ fontSize: 13, color: '#d97706' }}>{event.eligibility}</p>
        )}

        {/* Capacity */}
        {event.maxParticipants > 0 && (
          <p style={{ fontSize: 13 }}>Max {event.maxParticipants} participants</p>
        )}

        {/* Deadline */}
        {event.registrationDeadline && (
          <p style={{ fontSize: 13, color: '#ef4444' }}>Deadline: {formatDate(event.registrationDeadline)}</p>
        )}

        {/* Tags */}
        {event.tags?.length > 0 && (
          <p style={{ fontSize: 12, marginTop: 4 }}>
            {event.tags.map((t) => (
              <span key={t} style={{ background: '#e8f4fd', borderRadius: 12, padding: '2px 8px', marginRight: 4, color: '#1d4ed8' }}>
                #{t}
              </span>
            ))}
          </p>
        )}

        {/* Merch items preview */}
        {isMerchandise && event.merchandiseItems?.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>Items available:</p>
            {event.merchandiseItems.map((item, i) => (
              <p key={i} style={{ fontSize: '0.85rem', color: '#64748b' }}>• {item.name} — ₹{item.price}</p>
            ))}
          </div>
        )}

        {/* Custom form notice */}
        {!isMerchandise && event.customFormFields?.length > 0 && (
          <p style={{ fontSize: 12, color: '#7c3aed', marginTop: 4 }}>
            {event.customFormFields.length} additional question(s) on registration
          </p>
        )}

        {/* Actions */}
        <div className="card-actions">
          <Link to={`/events/${event._id}`} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none', display: 'inline-block' }}>
            View Details
          </Link>
          {user?.role === 'participant' && (
            isRegistered ? (
              <button className="btn btn-secondary btn-sm" disabled>
                {isMerchandise ? 'Ordered ✓' : 'Registered ✓'}
              </button>
            ) : (
              <button className="btn btn-success btn-sm"
                onClick={() => isMerchandise ? openMerchModal(event) : openRegModal(event)}>
                {isMerchandise ? 'Order Now' : 'Register'}
              </button>
            )
          )}
          {!user && (
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/login')}>
              Login to {isMerchandise ? 'Order' : 'Register'}
            </button>
          )}
        </div>
      </div>
    );
  }
}

// Simple modal overlay styles
const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
};
const modalStyle = {
  background: '#fff', borderRadius: 12, padding: 28, width: '90%', maxWidth: 480,
  maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
};

export default EventsPage;
