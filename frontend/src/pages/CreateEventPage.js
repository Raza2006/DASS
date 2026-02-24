import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';

const CATEGORIES = ['General','Technical','Cultural','Sports','Workshop','Competition','Talk','Gaming','Music','Art','Social','Finance'];
const EVENT_TYPES = ['normal', 'merchandise'];

const defaultForm = {
  title: '',
  description: '',
  venue: '',
  startDate: '',
  endDate: '',
  category: 'General',
  eventType: 'normal',
  eligibility: 'Open to all',
  registrationFee: '0',
  tags: '',
  maxParticipants: '',
  registrationDeadline: '',
  customFormFields: [],
  merchandiseItems: [],
  purchaseLimitPerParticipant: '1',
  isTeamEvent: false,
  minTeamSize: '2',
  maxTeamSize: '5',
};

function CreateEventPage() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const headers   = { Authorization: `Bearer ${user.token}` };

  const [form, setForm]       = useState(defaultForm);
  const [message, setMessage] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  // ── Custom form field helpers ─────────────────────────────────────────────
  const addField = () =>
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

  // ── Merchandise helpers ───────────────────────────────────────────────────
  const addMerchItem = () =>
    setForm((p) => ({ ...p, merchandiseItems: [...p.merchandiseItems, { name: '', description: '', price: '0', variants: [] }] }));
  const updMerch = (i, k, v) =>
    setForm((p) => { const a = [...p.merchandiseItems]; a[i] = { ...a[i], [k]: v }; return { ...p, merchandiseItems: a }; });
  const rmMerch = (i) =>
    setForm((p) => ({ ...p, merchandiseItems: p.merchandiseItems.filter((_, idx) => idx !== i) }));
  const addVariant = (ii) =>
    setForm((p) => {
      const a = [...p.merchandiseItems];
      a[ii] = { ...a[ii], variants: [...a[ii].variants, { size: '', color: '', stock: '0' }] };
      return { ...p, merchandiseItems: a };
    });
  const updVariant = (ii, vi, k, v) =>
    setForm((p) => {
      const a = [...p.merchandiseItems];
      const vars = [...a[ii].variants];
      vars[vi] = { ...vars[vi], [k]: v };
      a[ii] = { ...a[ii], variants: vars };
      return { ...p, merchandiseItems: a };
    });
  const rmVariant = (ii, vi) =>
    setForm((p) => {
      const a = [...p.merchandiseItems];
      a[ii] = { ...a[ii], variants: a[ii].variants.filter((_, idx) => idx !== vi) };
      return { ...p, merchandiseItems: a };
    });

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = async (saveAsDraft) => {
    if (!form.title.trim() || !form.description.trim() || !form.venue.trim() || !form.startDate) {
      setError('Title, description, venue and start date are required.');
      return;
    }

    setLoading(true);
    setError('');
    const payload = {
      ...form,
      saveAsDraft,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      registrationFee:            Number(form.registrationFee) || 0,
      purchaseLimitPerParticipant: Number(form.purchaseLimitPerParticipant) || 1,
      isTeamEvent: !!form.isTeamEvent,
      minTeamSize: Number(form.minTeamSize) || 2,
      maxTeamSize: Number(form.maxTeamSize) || 5,
      maxParticipants:            form.maxParticipants ? Number(form.maxParticipants) : 0,
      customFormFields: form.customFormFields.map((f) => ({
        label:     f.label,
        fieldType: f.fieldType,
        options:   f.fieldType === 'select'
          ? (typeof f.options === 'string' ? f.options.split(',').map((o) => o.trim()).filter(Boolean) : f.options)
          : [],
        required: !!f.required,
      })),
      merchandiseItems: form.merchandiseItems.map((item) => ({
        name:        item.name,
        description: item.description,
        price:       Number(item.price) || 0,
        variants: (item.variants || []).map((v) => ({
          size:  v.size,
          color: v.color,
          stock: Number(v.stock) || 0,
        })),
      })),
    };

    try {
      const { data } = await axios.post(`${API}/events`, payload, { headers });
      setMessage(saveAsDraft ? 'Event saved as draft!' : 'Event submitted for approval!');
      setTimeout(() => navigate(`/organizer/events/${data._id}`), 1200);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create event.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <h2>Create New Event</h2>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Fill in the event details below. Save as a draft to continue editing later, or submit for admin approval.
      </p>

      {message && <div className="success-msg">{message}</div>}
      {error   && <div className="error-msg">{error}</div>}

      <div className="card">
        {/* ── Basic Info ── */}
        <h3 style={{ marginBottom: 16 }}>Basic Information</h3>

        <div className="form-group">
          <label>Event Title *</label>
          <input name="title" value={form.title} onChange={handleChange} placeholder="e.g. Hackathon 2025" required />
        </div>

        <div className="form-group">
          <label>Description *</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={4}
            placeholder="Describe your event, what participants can expect…" required />
        </div>

        <div className="form-group">
          <label>Venue *</label>
          <input name="venue" value={form.venue} onChange={handleChange} placeholder="e.g. Auditorium, H105, Online" required />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Start Date *</label>
            <input type="date" name="startDate" value={form.startDate} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input type="date" name="endDate" value={form.endDate} onChange={handleChange} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Category</label>
            <select name="category" value={form.category} onChange={handleChange}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Event Type</label>
            <select name="eventType" value={form.eventType} onChange={handleChange}>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t === 'normal' ? 'Normal (Registration)' : 'Merchandise (Sales)'}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Eligibility</label>
            <input name="eligibility" value={form.eligibility} onChange={handleChange} placeholder="Open to all, IIIT only…" />
          </div>
          <div className="form-group">
            <label>Registration Fee (₹) — 0 for free</label>
            <input type="number" min="0" name="registrationFee" value={form.registrationFee} onChange={handleChange} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Max Participants (0 = unlimited)</label>
            <input type="number" min="0" name="maxParticipants" value={form.maxParticipants} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label>Registration Deadline</label>
            <input type="date" name="registrationDeadline" value={form.registrationDeadline} onChange={handleChange} />
          </div>
        </div>

        <div className="form-group">
          <label>Tags (comma-separated)</label>
          <input name="tags" value={form.tags} onChange={handleChange} placeholder="e.g. coding, team, iiit" />
        </div>

        {/* ── Team Event Toggle (normal events only) ── */}
        {form.eventType === 'normal' && (
          <div className="form-group" style={{ borderTop: '1px dashed #e2e8f0', paddingTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={!!form.isTeamEvent}
                onChange={(e) => setForm((p) => ({ ...p, isTeamEvent: e.target.checked }))}
              />
              Team-based Event (Hackathon-style) — participants register as teams
            </label>
            {form.isTeamEvent && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div className="form-group">
                  <label>Min Team Size</label>
                  <input type="number" min="1" max="20" name="minTeamSize" value={form.minTeamSize}
                    onChange={(e) => setForm((p) => ({ ...p, minTeamSize: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Max Team Size</label>
                  <input type="number" min="1" max="20" name="maxTeamSize" value={form.maxTeamSize}
                    onChange={(e) => setForm((p) => ({ ...p, maxTeamSize: e.target.value }))} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Custom Form Builder (normal events) ── */}
        {form.eventType === 'normal' && (
          <div className="form-group">
            <label style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 8, display: 'block', borderTop: '1px dashed #e2e8f0', paddingTop: 16 }}>
              Registration Form Builder
            </label>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 10 }}>
              Add custom questions to collect additional information from registrants.
            </p>

            {form.customFormFields.map((field, i) => (
              <div key={i} style={{ background: '#f8f9fa', borderRadius: 8, padding: 12, marginBottom: 10, border: '1px solid #e0e0e0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto auto auto', gap: 6, marginBottom: 8 }}>
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
                  <button type="button" title="Move up" onClick={() => moveField(i, -1)}
                    style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', padding: '4px 8px' }}>↑</button>
                  <button type="button" title="Move down" onClick={() => moveField(i, 1)}
                    style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', padding: '4px 8px' }}>↓</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => rmField(i)}>×</button>
                </div>
                {field.fieldType === 'select' && (
                  <input placeholder="Options (comma-separated, e.g. Option A, Option B)"
                    value={field.options || ''}
                    onChange={(e) => updField(i, 'options', e.target.value)}
                    style={{ marginBottom: 8 }} />
                )}
                <label style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!field.required} onChange={(e) => updField(i, 'required', e.target.checked)} />
                  Required field
                </label>
              </div>
            ))}

            <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={addField}>
              + Add Question
            </button>
          </div>
        )}

        {/* ── Merchandise Builder ── */}
        {form.eventType === 'merchandise' && (
          <div className="form-group">
            <label style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 8, display: 'block', borderTop: '1px dashed #e2e8f0', paddingTop: 16 }}>
              Merchandise Items
            </label>
            <div className="form-group">
              <label>Purchase Limit per Participant</label>
              <input type="number" min="1" name="purchaseLimitPerParticipant"
                value={form.purchaseLimitPerParticipant} onChange={handleChange} style={{ maxWidth: 120 }} />
            </div>

            {form.merchandiseItems.map((item, i) => (
              <div key={i} style={{ background: '#f8f9fa', borderRadius: 8, padding: 14, marginBottom: 12, border: '1px solid #e0e0e0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 100px auto', gap: 8, marginBottom: 10 }}>
                  <input placeholder="Item name *" value={item.name}
                    onChange={(e) => updMerch(i, 'name', e.target.value)} required />
                  <input placeholder="Description" value={item.description}
                    onChange={(e) => updMerch(i, 'description', e.target.value)} />
                  <input type="number" min="0" placeholder="Price (₹)" value={item.price}
                    onChange={(e) => updMerch(i, 'price', e.target.value)} />
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => rmMerch(i)}>× Remove</button>
                </div>

                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 6 }}>Variants (size / color / stock):</p>
                {item.variants.map((v, vi) => (
                  <div key={vi} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px auto', gap: 6, marginBottom: 6 }}>
                    <input placeholder="Size (e.g. M, L, XL)" value={v.size}
                      onChange={(e) => updVariant(i, vi, 'size', e.target.value)} />
                    <input placeholder="Color" value={v.color}
                      onChange={(e) => updVariant(i, vi, 'color', e.target.value)} />
                    <input type="number" min="0" placeholder="Stock" value={v.stock}
                      onChange={(e) => updVariant(i, vi, 'stock', e.target.value)} />
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => rmVariant(i, vi)}>×</button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" style={{ width: 'auto', marginTop: 6 }}
                  onClick={() => addVariant(i)}>+ Add Variant</button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={addMerchItem}>
              + Add Merchandise Item
            </button>
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div style={{ display: 'flex', gap: 12, marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: 'auto', minWidth: 160 }}
            disabled={loading}
            onClick={() => submit(true)}
          >
            💾 Save as Draft
          </button>
          <button
            type="button"
            className="btn btn-success"
            style={{ width: 'auto', minWidth: 200 }}
            disabled={loading}
            onClick={() => submit(false)}
          >
            Submit for Approval
          </button>
        </div>
        <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 10 }}>
          Draft events are only visible to you. Submitted events require admin approval before going public.
        </p>
      </div>
    </div>
  );
}

export default CreateEventPage;
