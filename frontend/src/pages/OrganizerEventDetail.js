import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';

const STATUS_COLORS = {
  draft:     { bg: '#f1f5f9', color: '#475569' },
  pending:   { bg: '#fef3c7', color: '#92400e' },
  approved:  { bg: '#d1fae5', color: '#065f46' },
  rejected:  { bg: '#fee2e2', color: '#991b1b' },
  ongoing:   { bg: '#dbeafe', color: '#1e40af' },
  completed: { bg: '#ede9fe', color: '#5b21b6' },
  closed:    { bg: '#f1f5f9', color: '#64748b' },
};

function OrganizerEventDetail() {
  const { id }              = useParams();
  const [searchParams]      = useSearchParams();
  const { user }            = useAuth();
  const headers             = { Authorization: `Bearer ${user.token}` };

  const [event, setEvent]           = useState(null);
  const [analytics, setAnalytics]   = useState(null);
  const [participants, setParticipants] = useState([]);
  const [orders, setOrders]         = useState([]);
  const [teams, setTeams]           = useState([]);
  const [feedback, setFeedback]     = useState(null); // { feedbacks, total, avg, dist }
  const [fbRatingFilter, setFbRatingFilter] = useState(0); // 0 = all
  const [loading, setLoading]       = useState(true);
  const [message, setMessage]       = useState('');
  const [error, setError]           = useState('');
  const [activeTab, setActiveTab]   = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Edit form state
  const [editing, setEditing]       = useState(searchParams.get('edit') === '1');
  const [form, setForm]             = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [evRes, pRes, anlRes] = await Promise.all([
        axios.get(`${API}/events/${id}`, { headers }),
        axios.get(`${API}/events/${id}/participants`, { headers }),
        axios.get(`${API}/organizer/events/${id}/analytics`, { headers }),
      ]);
      setEvent(evRes.data);
      setParticipants(pRes.data);
      setAnalytics(anlRes.data);

      // Fetch orders for merchandise events
      if (evRes.data.eventType === 'merchandise') {
        try {
          const ordRes = await axios.get(`${API}/organizer/orders/${id}`, { headers });
          setOrders(ordRes.data);
        } catch { /* non-fatal */ }
      }

      // Fetch teams for team events
      if (evRes.data.isTeamEvent) {
        try {
          const teamRes = await axios.get(`${API}/organizer/teams/${id}`, { headers });
          setTeams(teamRes.data);
        } catch { /* non-fatal */ }
      }

      // Pre-fill edit form
      const ev = evRes.data;
      setForm({
        title:            ev.title,
        description:      ev.description,
        startDate:        ev.startDate?.slice(0, 10) || '',
        endDate:          ev.endDate?.slice(0, 10) || '',
        venue:            ev.venue,
        maxParticipants:  ev.maxParticipants || '',
        registrationDeadline: ev.registrationDeadline?.slice(0, 10) || '',
        category:         ev.category || 'General',
        eligibility:      ev.eligibility || 'Open to all',
        registrationFee:  ev.registrationFee?.toString() || '0',
        tags:             (ev.tags || []).join(', '),
        eventType:        ev.eventType || 'normal',
        isTeamEvent:      ev.isTeamEvent || false,
        minTeamSize:      ev.minTeamSize?.toString() || '2',
        maxTeamSize:      ev.maxTeamSize?.toString() || '5',
        customFormFields: ev.customFormFields || [],
        merchandiseItems: (ev.merchandiseItems || []).map((item) => ({
          ...item,
          price:    item.price?.toString() || '0',
          variants: (item.variants || []).map((v) => ({ ...v, stock: v.stock?.toString() || '0' })),
        })),
        purchaseLimitPerParticipant: ev.purchaseLimitPerParticipant?.toString() || '1',
      });
    } catch {
      setError('Could not load event data.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  // ── Status change ────────────────────────────────────────────────────────────
  const changeStatus = async (newStatus) => {
    try {
      const { data } = await axios.patch(
        `${API}/organizer/events/${id}/status`,
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
  // ── Order approve / reject ─────────────────────────────────────────────────────
  const approveOrder = async (regId) => {
    try {
      await axios.patch(`${API}/organizer/orders/${regId}/approve`, {}, { headers });
      setMessage('Payment approved! Ticket generated and email sent.');
      fetchAll();
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      setError(err.response?.data?.message || 'Approval failed.');
      setTimeout(() => setError(''), 4000);
    }
  };

  const rejectOrder = async (regId) => {
    if (!window.confirm('Reject this payment? The participant will need to resubmit.')) return;
    try {
      await axios.patch(`${API}/organizer/orders/${regId}/reject`, {}, { headers });
      setMessage('Payment rejected.');
      fetchAll();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Rejection failed.');
      setTimeout(() => setError(''), 3000);
    }
  };
  // ── Attendance marking ───────────────────────────────────────────────────────
  const markAttended = async (regId) => {
    try {
      await axios.put(`${API}/events/${id}/attendance/${regId}`, {}, { headers });
      setMessage('Attendance marked!');
      fetchAll();
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setError('Could not mark attendance.');
      setTimeout(() => setError(''), 3000);
    }
  };

  // ── Edit form handlers ────────────────────────────────────────────────────────
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        registrationFee: Number(form.registrationFee) || 0,
        purchaseLimitPerParticipant: Number(form.purchaseLimitPerParticipant) || 1,
        merchandiseItems: form.merchandiseItems.map((item) => ({
          ...item,
          price: Number(item.price) || 0,
          variants: (item.variants || []).map((v) => ({ ...v, stock: Number(v.stock) || 0 })),
        })),
        customFormFields: form.customFormFields.map((f) => ({
          label: f.label,
          fieldType: f.fieldType,
          options: f.fieldType === 'select' ? (typeof f.options === 'string' ? f.options.split(',').map((o) => o.trim()).filter(Boolean) : f.options) : [],
          required: !!f.required,
        })),
      };
      await axios.put(`${API}/events/${id}`, payload, { headers });
      setMessage('Event updated!');
      setEditing(false);
      fetchAll();
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save event.');
      setTimeout(() => setError(''), 4000);
    }
  };

  // ── Form field helpers ───────────────────────────────────────────────────────
  const addFormField = () =>
    setForm((p) => ({ ...p, customFormFields: [...p.customFormFields, { label: '', fieldType: 'text', options: '', required: false }] }));
  const updField = (i, k, v) =>
    setForm((p) => { const a = [...p.customFormFields]; a[i] = { ...a[i], [k]: v }; return { ...p, customFormFields: a }; });
  const rmField  = (i) =>
    setForm((p) => ({ ...p, customFormFields: p.customFormFields.filter((_, idx) => idx !== i) }));
  const moveField = (i, dir) =>
    setForm((p) => {
      const a = [...p.customFormFields];
      const j = i + dir;
      if (j < 0 || j >= a.length) return p;
      [a[i], a[j]] = [a[j], a[i]];
      return { ...p, customFormFields: a };
    });

  // ── Merchandise helpers ───────────────────────────────────────────────────────
  const addMerchItem = () =>
    setForm((p) => ({ ...p, merchandiseItems: [...p.merchandiseItems, { name: '', description: '', price: '0', variants: [] }] }));
  const updMerch = (i, k, v) =>
    setForm((p) => { const a = [...p.merchandiseItems]; a[i] = { ...a[i], [k]: v }; return { ...p, merchandiseItems: a }; });
  const rmMerch = (i) =>
    setForm((p) => ({ ...p, merchandiseItems: p.merchandiseItems.filter((_, idx) => idx !== i) }));
  const addVariant = (ii) =>
    setForm((p) => { const a = [...p.merchandiseItems]; a[ii] = { ...a[ii], variants: [...a[ii].variants, { size: '', color: '', stock: '0' }] }; return { ...p, merchandiseItems: a }; });
  const updVariant = (ii, vi, k, v) =>
    setForm((p) => { const a = [...p.merchandiseItems]; const vars = [...a[ii].variants]; vars[vi] = { ...vars[vi], [k]: v }; a[ii] = { ...a[ii], variants: vars }; return { ...p, merchandiseItems: a }; });
  const rmVariant = (ii, vi) =>
    setForm((p) => { const a = [...p.merchandiseItems]; a[ii] = { ...a[ii], variants: a[ii].variants.filter((_, idx) => idx !== vi) }; return { ...p, merchandiseItems: a }; });

  // ── CSV Export ────────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const headers_ = ['Name', 'Email', 'IIIT Student', 'Reg Date', 'Status', 'Amount', 'Ticket ID', 'Form Responses'];
    const rows = filteredParticipants.map((r) => [
      r.participant?.name || '',
      r.participant?.email || '',
      r.participant?.isIIITStudent ? 'Yes' : 'No',
      r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '',
      r.status,
      r.totalAmount || 0,
      r.ticketId || '',
      JSON.stringify(r.formResponses || {}),
    ]);
    const csv = [headers_, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${event?.title || 'participants'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Filtered participants ─────────────────────────────────────────────────────
  const filteredParticipants = participants.filter((r) => {
    const q = searchTerm.toLowerCase();
    const name  = (r.participant?.name  || '').toLowerCase();
    const email = (r.participant?.email || '').toLowerCase();
    const matchSearch = !q || name.includes(q) || email.includes(q);
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) return <div className="page"><p>Loading event details…</p></div>;
  if (!event)  return <div className="page"><div className="error-msg">{error || 'Event not found.'}</div></div>;

  const sc = STATUS_COLORS[event.status] || STATUS_COLORS.draft;
  const isDraft    = event.status === 'draft';
  const isPending  = event.status === 'pending';
  const isApproved = event.status === 'approved';
  const isOngoing  = event.status === 'ongoing';
  return (
    <div className="page">
      {message && <div className="success-msg">{message}</div>}
      {error   && <div className="error-msg">{error}</div>}

      {/* Breadcrumb */}
      <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 16 }}>
        <Link to="/dashboard" style={{ color: '#2563eb' }}>Dashboard</Link> › {event.title}
      </p>

      {/* Header */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{ padding: '3px 12px', borderRadius: 20, fontWeight: 700, fontSize: '0.8rem', background: sc.bg, color: sc.color }}>
                {event.status.toUpperCase()}
              </span>
              <span className="badge badge-approved">{event.category}</span>
              {event.formLocked && (
                <span style={{ fontSize: '0.75rem', color: '#dc2626', background: '#fee2e2', padding: '2px 8px', borderRadius: 12 }}>
                  🔒 Form locked
                </span>
              )}
            </div>
            <h2 style={{ marginBottom: 4 }}>{event.title}</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
              {event.eventType === 'merchandise' ? 'Merchandise' : 'Normal Event'} · {fmt(event.startDate)}
            </p>
          </div>

          {/* Status action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isDraft && (
              <>
                <button className="btn btn-success" style={{ width: 'auto' }} onClick={() => changeStatus('pending')}>
                  Publish for Approval
                </button>
                <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setEditing(true)}>Edit</button>
              </>
            )}
            {isPending && (
              <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => changeStatus('draft')}>Pull to Draft</button>
            )}
            {isApproved && (
              <>
                <button className="btn btn-secondary" style={{ width: 'auto', background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' }}
                  onClick={() => changeStatus('ongoing')}>Mark Ongoing</button>
                <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => changeStatus('closed')}>Close Reg.</button>
                <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => setEditing(true)}>Edit</button>
              </>
            )}
            {isOngoing && (
              <>
                <button className="btn btn-secondary" style={{ width: 'auto', background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd' }}
                  onClick={() => changeStatus('completed')}>Mark Completed</button>
                <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => changeStatus('closed')}>Close</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #e2e8f0', flexWrap: 'wrap' }}>
        {['overview', 'analytics', 'participants',
          ...(event.eventType === 'merchandise' ? ['orders'] : []),
          ...(event.isTeamEvent ? ['teams'] : []),
          'feedback',
        ].map((tab) => (
          <button key={tab} onClick={() => {
              setActiveTab(tab);
              if (tab === 'feedback' && !feedback) {
                axios.get(`${API}/feedback/${id}`, { headers })
                  .then(({ data }) => setFeedback(data))
                  .catch(() => {});
              }
            }} style={{
            padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem',
            fontWeight: activeTab === tab ? 700 : 400,
            color: activeTab === tab ? '#2563eb' : '#64748b',
            borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
            marginBottom: -2, textTransform: 'capitalize',
          }}>
            {tab}{tab === 'orders' && orders.filter(o => o.paymentStatus === 'pending_approval').length > 0 && (
              <span style={{ marginLeft: 6, background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: '0.7rem' }}>
                {orders.filter(o => o.paymentStatus === 'pending_approval').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && !editing && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
            <DBox icon="" label="Start Date"  value={fmt(event.startDate)} />
            <DBox icon="" label="End Date"    value={fmt(event.endDate)} />
            <DBox icon="" label="Venue"       value={event.venue} />
            <DBox icon="" label="Type"        value={event.eventType} />
            <DBox icon="" label="Fee"         value={event.registrationFee > 0 ? `₹${event.registrationFee}` : 'Free'} />
            <DBox icon="" label="Eligibility" value={event.eligibility} />
            <DBox icon="" label="Capacity"    value={event.maxParticipants > 0 ? `${event.maxParticipants}` : 'Unlimited'} />
            {event.registrationDeadline && <DBox icon="" label="Reg. Deadline" value={fmt(event.registrationDeadline)} />}
          </div>
          <p style={{ color: '#475569', lineHeight: 1.6, marginBottom: 16 }}>{event.description}</p>
          {event.tags?.length > 0 && (
            <div>
              {event.tags.map((t) => (
                <span key={t} style={{ background: '#e8f4fd', borderRadius: 12, padding: '2px 10px', marginRight: 6, color: '#1d4ed8', fontSize: '0.82rem' }}>#{t}</span>
              ))}
            </div>
          )}
          {event.customFormFields?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4>Registration Form Fields{event.formLocked && ' 🔒'}</h4>
              {event.customFormFields.map((f, i) => (
                <div key={i} style={{ background: '#f8fafc', borderRadius: 6, padding: '8px 12px', marginTop: 6, fontSize: '0.875rem' }}>
                  <strong>{f.label}</strong> — {f.fieldType}{f.required ? ' (required)' : ''}
                  {f.options?.length > 0 && <span style={{ color: '#64748b' }}> [{f.options.join(', ')}]</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── EDIT FORM (inline) ── */}
      {activeTab === 'overview' && editing && form && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3>Edit Event</h3>
            <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={() => setEditing(false)}>Cancel</button>
          </div>
          {isApproved && (
            <div style={{ background: '#fef3c7', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.875rem', color: '#92400e' }}>
              ⚠️ Event is published. You may only update the description, extend the deadline, or increase the participant limit.
            </div>
          )}
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label>Description *</label>
              <textarea name="description" value={form.description} onChange={handleFormChange} required />
            </div>
            {!isApproved && (
              <>
                <div className="form-group"><label>Title *</label>
                  <input name="title" value={form.title} onChange={handleFormChange} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>Start Date *</label>
                    <input type="date" name="startDate" value={form.startDate} onChange={handleFormChange} required />
                  </div>
                  <div className="form-group"><label>End Date</label>
                    <input type="date" name="endDate" value={form.endDate} onChange={handleFormChange} />
                  </div>
                </div>
                <div className="form-group"><label>Venue *</label>
                  <input name="venue" value={form.venue} onChange={handleFormChange} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>Category</label>
                    <select name="category" value={form.category} onChange={handleFormChange}>
                      {['General','Technical','Cultural','Sports','Workshop','Competition','Talk','Gaming','Music','Art','Social','Finance'].map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>Eligibility</label>
                    <input name="eligibility" value={form.eligibility} onChange={handleFormChange} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group"><label>Fee (₹)</label>
                    <input type="number" name="registrationFee" value={form.registrationFee} onChange={handleFormChange} min="0" />
                  </div>
                  <div className="form-group"><label>Tags (comma-separated)</label>
                    <input name="tags" value={form.tags} onChange={handleFormChange} />
                  </div>
                </div>
              </>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Max Participants (0 = unlimited)</label>
                <input type="number" name="maxParticipants" value={form.maxParticipants} onChange={handleFormChange} min={isApproved ? (event.maxParticipants || 0) : 0} />
              </div>
              <div className="form-group">
                <label>Registration Deadline</label>
                <input type="date" name="registrationDeadline" value={form.registrationDeadline} onChange={handleFormChange} />
              </div>
            </div>

            {/* Form builder — only for draft/pending and if not locked */}
            {!isApproved && form.eventType === 'normal' && !event.formLocked && (
              <div className="form-group">
                <label style={{ fontWeight: 600 }}>Registration Form Fields</label>
                {form.customFormFields.map((field, i) => (
                  <div key={i} style={{ background: '#f8f9fa', borderRadius: 8, padding: 10, marginBottom: 8, border: '1px solid #e0e0e0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto auto auto', gap: 6, marginBottom: 6 }}>
                      <input placeholder="Field label *" value={field.label}
                        onChange={(e) => updField(i, 'label', e.target.value)} required />
                      <select value={field.fieldType} onChange={(e) => updField(i, 'fieldType', e.target.value)}>
                        <option value="text">Short text</option>
                        <option value="textarea">Long text</option>
                        <option value="number">Number</option>
                        <option value="select">Dropdown</option>
                        <option value="checkbox">Checkbox</option>
                        <option value="file">File upload</option>
                      </select>
                      <button type="button" onClick={() => moveField(i, -1)} title="Move up" style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', padding: '2px 6px' }}>↑</button>
                      <button type="button" onClick={() => moveField(i,  1)} title="Move down" style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', padding: '2px 6px' }}>↓</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => rmField(i)}>×</button>
                    </div>
                    {field.fieldType === 'select' && (
                      <input placeholder="Options (comma-separated)" value={field.options || ''} onChange={(e) => updField(i, 'options', e.target.value)} style={{ marginBottom: 6 }} />
                    )}
                    <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={!!field.required} onChange={(e) => updField(i, 'required', e.target.checked)} />
                      Required
                    </label>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={addFormField} style={{ width: 'auto' }}>+ Add Field</button>
              </div>
            )}
            {event.formLocked && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 12 }}>🔒 Registration form is locked (a registration has been received).</p>}

            {/* Merchandise items */}
            {!isApproved && form.eventType === 'merchandise' && (
              <div className="form-group">
                <label style={{ fontWeight: 600 }}>Merchandise Items</label>
                {form.merchandiseItems.map((item, i) => (
                  <div key={i} style={{ background: '#f8f9fa', borderRadius: 8, padding: 10, marginBottom: 10, border: '1px solid #e0e0e0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 8, marginBottom: 6 }}>
                      <input placeholder="Item name *" value={item.name} onChange={(e) => updMerch(i, 'name', e.target.value)} required />
                      <input placeholder="Description" value={item.description} onChange={(e) => updMerch(i, 'description', e.target.value)} />
                      <input type="number" min="0" placeholder="Price (₹)" value={item.price} onChange={(e) => updMerch(i, 'price', e.target.value)} />
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => rmMerch(i)}>×</button>
                    </div>
                    {(item.variants || []).map((v, vi) => (
                      <div key={vi} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px auto', gap: 6, marginTop: 4 }}>
                        <input placeholder="Size" value={v.size}  onChange={(e) => updVariant(i, vi, 'size', e.target.value)} />
                        <input placeholder="Color" value={v.color} onChange={(e) => updVariant(i, vi, 'color', e.target.value)} />
                        <input type="number" min="0" placeholder="Stock" value={v.stock} onChange={(e) => updVariant(i, vi, 'stock', e.target.value)} />
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => rmVariant(i, vi)}>×</button>
                      </div>
                    ))}
                    <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto', marginTop: 6 }} onClick={() => addVariant(i)}>+ Variant</button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={addMerchItem} style={{ width: 'auto' }}>+ Add Item</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-success">Save Changes</button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── ANALYTICS TAB ── */}
      {activeTab === 'analytics' && analytics && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            <ACard label="Registrations"  value={analytics.totalRegistrations} color="#2563eb" />
            <ACard label="Attended"        value={analytics.attended}            color="#059669" />
            <ACard label="Cancelled"       value={analytics.cancelled}           color="#dc2626" />
            <ACard label="Revenue"         value={`₹${analytics.revenue}`}       color="#7c3aed" />
            <ACard label="Attendance Rate" value={`${analytics.attendanceRate}%`} color="#d97706" />
            {analytics.isFull !== null && <ACard label="Capacity" value={analytics.isFull ? 'Full' : `${analytics.totalRegistrations}/${event.maxParticipants || '∞'}`} color="#475569" />}
            {analytics.sales !== null && <ACard label="Units Sold" value={analytics.sales} color="#0891b2" />}
          </div>

          {/* Attendance progress bar */}
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '14px 16px' }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Attendance Rate</p>
            <div style={{ height: 12, background: '#e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${analytics.attendanceRate}%`, height: '100%', background: 'linear-gradient(90deg,#2563eb,#7c3aed)', borderRadius: 6, transition: 'width 0.6s ease' }} />
            </div>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 6 }}>
              {analytics.attended} out of {analytics.totalRegistrations} registered participants attended ({analytics.attendanceRate}%)
            </p>
          </div>
        </div>
      )}

      {/* ── PARTICIPANTS TAB ── */}
      {activeTab === 'participants' && (
        <div>
          {/* Search + Filter bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text" placeholder="Search by name or email…"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: '0.875rem' }}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: '0.875rem' }}>
              <option value="">All Statuses</option>
              <option value="registered">Registered</option>
              <option value="attended">Attended</option>
              <option value="completed">Completed</option>
            </select>
            <button className="btn btn-secondary btn-sm" style={{ width: 'auto' }} onClick={exportCSV}>
              ⬇ Export CSV
            </button>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 12 }}>
            Showing {filteredParticipants.length} of {participants.length} registrations
          </p>

          {filteredParticipants.length === 0 ? (
            <p style={{ color: '#888' }}>No participants match your filter.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', minWidth: 700 }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    {['Name', 'Email', 'Type', 'Reg. Date', 'Status', 'Payment', 'Ticket ID', 'Action'].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredParticipants.map((reg) => (
                    <tr key={reg._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px' }}>{reg.participant?.name}</td>
                      <td style={{ padding: '10px 12px', color: '#2563eb' }}>{reg.participant?.email}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: '0.75rem', background: reg.participant?.isIIITStudent ? '#eff6ff' : '#f0fdf4', color: reg.participant?.isIIITStudent ? '#1d4ed8' : '#166534', borderRadius: 10, padding: '2px 8px' }}>
                          {reg.participant?.isIIITStudent ? 'IIIT' : 'External'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {reg.createdAt ? new Date(reg.createdAt).toLocaleDateString('en-IN') : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className={`badge badge-${reg.status}`}>{reg.status}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#059669' }}>
                        {reg.totalAmount > 0 ? `₹${reg.totalAmount}` : 'Free'}
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#7c3aed' }}>
                        {reg.ticketId || '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {reg.status === 'registered' && (
                          <button className="btn btn-success btn-sm" onClick={() => markAttended(reg._id)}>
                            Mark Attended
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ORDERS TAB ── */}
      {activeTab === 'orders' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
              {orders.length} order(s) · {orders.filter(o => o.paymentStatus === 'pending_approval').length} pending approval
            </p>
          </div>
          {orders.length === 0 ? (
            <p style={{ color: '#888' }}>No merchandise orders yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', minWidth: 800 }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    {['Participant', 'Email', 'Items', 'Amount', 'Payment Status', 'Proof', 'Actions'].map((h) => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((reg) => {
                    const BACKEND = 'http://localhost:5000';
                    const proofUrl = reg.paymentProof ? (reg.paymentProof.startsWith('http') ? reg.paymentProof : `${BACKEND}${reg.paymentProof}`) : null;
                    const psColor = reg.paymentStatus === 'approved' ? { bg: '#d1fae5', color: '#065f46' } :
                                    reg.paymentStatus === 'rejected' ? { bg: '#fee2e2', color: '#991b1b' } :
                                    reg.paymentStatus === 'pending_approval' ? { bg: '#fef3c7', color: '#92400e' } :
                                    { bg: '#dbeafe', color: '#1e40af' };
                    return (
                      <tr key={reg._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>{reg.participant?.name}</td>
                        <td style={{ padding: '10px 12px', color: '#2563eb', fontSize: '0.82rem' }}>{reg.participant?.email}</td>
                        <td style={{ padding: '10px 12px', fontSize: '0.82rem' }}>
                          {reg.merchandiseSelections?.map((sel, i) => (
                            <div key={i}>{sel.itemName}{sel.size ? ` (${sel.size})` : ''} ×{sel.quantity}</div>
                          ))}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#059669' }}>
                          {reg.totalAmount > 0 ? `₹${reg.totalAmount}` : 'Free'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: psColor.bg, color: psColor.color, borderRadius: 12, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 600 }}>
                            {(reg.paymentStatus || 'Not Required').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {proofUrl ? (
                            <a href={proofUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: '0.82rem', textDecoration: 'underline' }}>
                              View Proof ↗
                            </a>
                          ) : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {reg.paymentStatus === 'pending_approval' && (
                              <>
                                <button className="btn btn-success btn-sm" onClick={() => approveOrder(reg._id)}>Approve</button>
                                <button className="btn btn-danger btn-sm" onClick={() => rejectOrder(reg._id)}>Reject</button>
                              </>
                            )}
                            {reg.paymentStatus === 'approved' && (
                              <span style={{ fontSize: '0.8rem', color: '#059669' }}>Approved</span>
                            )}
                            {reg.paymentStatus === 'rejected' && (
                              <button className="btn btn-success btn-sm" onClick={() => approveOrder(reg._id)}>Approve anyway</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TEAMS TAB ── */}
      {activeTab === 'teams' && (
        <div>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: 12 }}>
            {teams.length} team(s) · {teams.filter(t => t.status === 'complete').length} complete · {teams.filter(t => t.status === 'forming').length} forming
          </p>
          {teams.length === 0 ? (
            <p style={{ color: '#888' }}>No teams registered yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
              {teams.map((team) => (
                <div key={team._id} className="card" style={{ borderTop: `3px solid ${team.status === 'complete' ? '#059669' : team.status === 'cancelled' ? '#ef4444' : '#f59e0b'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <p style={{ fontWeight: 600, marginBottom: 2 }}>{team.name}</p>
                      <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Leader: {team.leader?.name}</p>
                    </div>
                    <span style={{ background: team.status === 'complete' ? '#dcfce7' : team.status === 'cancelled' ? '#fee2e2' : '#fef3c7', color: team.status === 'complete' ? '#166534' : team.status === 'cancelled' ? '#991b1b' : '#92400e', borderRadius: 12, padding: '2px 10px', fontSize: '0.72rem', fontWeight: 700 }}>
                      {team.status}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', marginBottom: 6 }}>Size: {team.members?.length || 0}/{team.maxSize}</p>
                  <div>
                    {team.members?.map((m, i) => (
                      <span key={i} style={{ display: 'inline-block', background: '#eff6ff', color: '#1d4ed8', borderRadius: 12, padding: '2px 8px', fontSize: '0.72rem', marginRight: 4, marginBottom: 4 }}>
                        {m.user?.name || 'Member'}{team.leader?._id === m.user?._id ? ' (Leader)' : ''}
                      </span>
                    ))}
                  </div>
                  {team.status === 'forming' && (
                    <p style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: 6 }}>Code: <code style={{ fontFamily: 'monospace', fontWeight: 700 }}>{team.inviteCode}</code></p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── FEEDBACK TAB ── */}
      {activeTab === 'feedback' && (
        <div>
          {!feedback ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>Loading feedback…</p>
          ) : feedback.total === 0 ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>No feedback submitted yet.</p>
          ) : (
            <>
              {/* ── Aggregated Stats ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px 24px', marginBottom: 20, alignItems: 'center' }}>
                <div style={{ textAlign: 'center', minWidth: 100 }}>
                  <p style={{ fontSize: '3rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{feedback.avg.toFixed(1)}</p>
                  <p style={{ fontSize: '1.3rem', letterSpacing: 2, margin: '4px 0' }}>
                    {'★'.repeat(Math.round(feedback.avg))}{'☆'.repeat(5 - Math.round(feedback.avg))}
                  </p>
                  <p style={{ fontSize: '0.82rem', color: '#64748b' }}>{feedback.total} review{feedback.total !== 1 ? 's' : ''}</p>
                </div>
                <div style={{ display: 'grid', gap: 5 }}>
                  {[5,4,3,2,1].map((star) => {
                    const count = feedback.dist[star] || 0;
                    const pct   = feedback.total ? Math.round((count / feedback.total) * 100) : 0;
                    return (
                      <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748b', minWidth: 16, textAlign: 'right' }}>{star}</span>
                        <span style={{ fontSize: '0.85rem' }}>★</span>
                        <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: star >= 4 ? '#22c55e' : star === 3 ? '#f59e0b' : '#ef4444', borderRadius: 4, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: '0.78rem', color: '#64748b', minWidth: 32 }}>{count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Filter ── */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Filter:</span>
                {[0,5,4,3,2,1].map((r) => (
                  <button key={r} onClick={() => setFbRatingFilter(r)}
                    style={{ padding: '4px 12px', borderRadius: 14, border: '1px solid', fontSize: '0.8rem', cursor: 'pointer',
                      background: fbRatingFilter === r ? '#2563eb' : '#fff',
                      color:      fbRatingFilter === r ? '#fff'     : '#475569',
                      borderColor: fbRatingFilter === r ? '#2563eb' : '#e2e8f0',
                    }}>
                    {r === 0 ? 'All' : `${'★'.repeat(r)} (${r})`}
                  </button>
                ))}
              </div>

              {/* ── Individual Feedback Cards ── */}
              <div style={{ display: 'grid', gap: 10 }}>
                {feedback.feedbacks
                  .filter((f) => fbRatingFilter === 0 || f.rating === fbRatingFilter)
                  .map((f) => (
                    <div key={f._id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px', borderLeft: `4px solid ${f.rating >= 4 ? '#22c55e' : f.rating === 3 ? '#f59e0b' : '#ef4444'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '1.1rem', letterSpacing: 1 }}>
                          {'★'.repeat(f.rating)}<span style={{ color: '#cbd5e1' }}>{'★'.repeat(5 - f.rating)}</span>
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {new Date(f.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      {f.comment ? (
                        <p style={{ fontSize: '0.875rem', color: '#374151', margin: 0 }}>{f.comment}</p>
                      ) : (
                        <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: 0, fontStyle: 'italic' }}>No comment provided.</p>
                      )}
                    </div>
                  ))}
                {feedback.feedbacks.filter((f) => fbRatingFilter === 0 || f.rating === fbRatingFilter).length === 0 && (
                  <p style={{ color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>No feedback for this rating.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DBox({ icon, label, value }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: 2 }}>{icon} {label}</p>
      <p style={{ fontWeight: 500, fontSize: '0.9rem' }}>{value || '—'}</p>
    </div>
  );
}

function ACard({ label, value, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', borderTop: `3px solid ${color}` }}>
      <p style={{ fontWeight: 700, fontSize: '1.5rem', color, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>{label}</p>
    </div>
  );
}

export default OrganizerEventDetail;
