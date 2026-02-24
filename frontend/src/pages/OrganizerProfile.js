import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import API from '../api';

const CATEGORIES = ['General','Technical','Cultural','Sports','Workshop','Competition','Talk','Gaming','Music','Art','Social','Finance'];

function OrganizerProfile() {
  const { user }  = useAuth();
  const headers   = { Authorization: `Bearer ${user.token}` };

  const [form, setForm]           = useState({
    name: '', clubName: '', category: 'General', description: '', contactEmail: '', contactNumber: '', discordWebhook: '',
  });
  const [loginEmail, setLoginEmail] = useState('');
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [testing, setTesting]       = useState(false);
  const [message, setMessage]       = useState('');
  const [error, setError]           = useState('');

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/organizer/profile`, { headers });
      setLoginEmail(data.email || '');
      setForm({
        name:          data.name || '',
        clubName:      data.clubName || '',
        category:      data.category || 'General',
        description:   data.description || '',
        contactEmail:  data.contactEmail || '',
        contactNumber: data.contactNumber || '',
        discordWebhook: data.discordWebhook || '',
      });
    } catch {
      setError('Could not load profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await axios.put(`${API}/organizer/profile`, form, { headers });
      setMessage('Profile saved successfully!');
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const testWebhook = async () => {
    if (!form.discordWebhook || !form.discordWebhook.startsWith('https://discord.com/api/webhooks/')) {
      setError('Please enter a valid Discord webhook URL first.');
      setTimeout(() => setError(''), 4000);
      return;
    }
    setTesting(true);
    try {
      await axios.post(form.discordWebhook, {
        embeds: [{
          title: 'Test from Felicity',
          description: 'Your Discord webhook is connected to your organizer profile!',
          color: 3447003,
          fields: [
            { name: 'Club', value: form.clubName || form.name || 'Your Club', inline: true },
            { name: 'Status', value: 'Connected', inline: true },
          ],
          footer: { text: 'Felicity — IIIT Hyderabad Event Management' },
          timestamp: new Date().toISOString(),
        }],
      });
      setMessage('Test message sent to Discord!');
      setTimeout(() => setMessage(''), 4000);
    } catch {
      setError('Webhook test failed. Check the URL and that it is a valid Discord webhook.');
      setTimeout(() => setError(''), 5000);
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="page"><p>Loading profile…</p></div>;

  return (
    <div className="page">
      <h2>Organizer Profile</h2>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Update your club's public profile information. This is shown to participants who browse your events.
      </p>

      {message && <div className="success-msg">{message}</div>}
      {error   && <div className="error-msg">{error}</div>}

      <form onSubmit={handleSave}>
        {/* ── Basic Info ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>Basic Information</h3>

          <div className="form-group">
            <label>Login Email (cannot be changed)</label>
            <input value={loginEmail} disabled style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Organizer / Contact Name *</label>
              <input name="name" value={form.name} onChange={handleChange} required placeholder="Your full name" />
            </div>
            <div className="form-group">
              <label>Club / Organization Name</label>
              <input name="clubName" value={form.clubName} onChange={handleChange} placeholder="e.g. DEVCLUB, Felicity Club" />
            </div>
          </div>

          <div className="form-group">
            <label>Category</label>
            <select name="category" value={form.category} onChange={handleChange}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Club Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={4}
              placeholder="Describe your club/organization — this is shown on your public profile page." />
          </div>
        </div>

        {/* ── Contact ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 16 }}>Contact Information</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Contact Email (public)</label>
              <input type="email" name="contactEmail" value={form.contactEmail} onChange={handleChange}
                placeholder="contact@yourclub.com" />
            </div>
            <div className="form-group">
              <label>Contact Number</label>
              <input type="tel" name="contactNumber" value={form.contactNumber} onChange={handleChange}
                placeholder="+91 9876543210" />
            </div>
          </div>
        </div>

        {/* ── Discord Webhook ── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 8 }}>Discord Notifications</h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: 14 }}>
            When your event is submitted for approval, a notification will automatically be sent to this Discord channel.
            Create a webhook in your Discord server settings → Integrations → Webhooks.
          </p>

          <div className="form-group">
            <label>Discord Webhook URL</label>
            <input name="discordWebhook" value={form.discordWebhook} onChange={handleChange}
              placeholder="https://discord.com/api/webhooks/…" />
          </div>

          {form.discordWebhook && (
            <button type="button" className="btn btn-secondary" style={{ width: 'auto', marginBottom: 8 }}
              onClick={testWebhook} disabled={testing}>
              {testing ? 'Sending…' : 'Send Test Notification'}
            </button>
          )}

          <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '10px 14px', fontSize: '0.825rem', color: '#0369a1' }}>
            <strong>How to get a webhook URL:</strong><br />
            1. Open your Discord server → Server Settings → Integrations<br />
            2. Click <strong>Webhooks</strong> → <strong>New Webhook</strong><br />
            3. Choose a channel, give it a name, then click <strong>Copy Webhook URL</strong><br />
            4. Paste it above and click Test.
          </div>
        </div>

        <button type="submit" className="btn btn-success" style={{ width: 'auto', minWidth: 200 }} disabled={saving}>
          {saving ? 'Saving…' : '💾 Save Profile'}
        </button>
      </form>
    </div>
  );
}

export default OrganizerProfile;
