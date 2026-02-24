import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import API from '../api';

const ALL_INTERESTS = [
  'Technical', 'Cultural', 'Sports', 'Workshop',
  'Talk', 'Competition', 'Gaming', 'Music',
  'Art', 'Social', 'Finance', 'General',
];

function Profile() {
  const { user, updateUser } = useAuth();
  const headers = { Authorization: `Bearer ${user.token}` };

  // Profile fields
  const [profile, setProfile] = useState({
    firstName: '', lastName: '', college: '', contactNumber: '',
  });
  // Preferences
  const [interests, setInterests] = useState([]);
  const [followed, setFollowed] = useState([]);   // array of organizer _ids
  const [allOrganizers, setAllOrganizers] = useState([]);

  const [profileMsg, setProfileMsg] = useState('');
  const [prefMsg, setPrefMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [prefLoading, setPrefLoading] = useState(false);

  // Password change state
  const [pwForm, setPwForm]   = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwMsg, setPwMsg]     = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  useEffect(() => {
    fetchProfile();
    fetchOrganizers();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data } = await axios.get(`${API}/participants/profile`, { headers });
      setProfile({
        firstName:     data.firstName     || '',
        lastName:      data.lastName      || '',
        college:       data.college       || '',
        contactNumber: data.contactNumber || '',
      });
      setInterests(data.interests || []);
      setFollowed((data.followedOrganizers || []).map((o) => (typeof o === 'object' ? o._id : o)));
    } catch { /* silent */ }
  };

  const fetchOrganizers = async () => {
    try {
      const { data } = await axios.get(`${API}/participants/organizers`, { headers });
      setAllOrganizers(data);
    } catch { /* silent */ }
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.put(`${API}/participants/profile`, profile, { headers });
      // Update the display name in context
      updateUser({ name: `${profile.firstName} ${profile.lastName}`.trim() });
      setProfileMsg('Profile updated successfully!');
      setTimeout(() => setProfileMsg(''), 3000);
    } catch {
      setProfileMsg('Could not update profile.');
      setTimeout(() => setProfileMsg(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const toggleInterest = (interest) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  const toggleFollow = (id) => {
    setFollowed((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const savePreferences = async () => {
    setPrefLoading(true);
    try {
      await axios.put(
        `${API}/participants/preferences`,
        { interests, followedOrganizers: followed },
        { headers }
      );
      updateUser({ onboardingDone: true });
      setPrefMsg('Preferences saved!');
      setTimeout(() => setPrefMsg(''), 3000);
    } catch {
      setPrefMsg('Could not save preferences.');
      setTimeout(() => setPrefMsg(''), 3000);
    } finally {
      setPrefLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    if (pwForm.newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    setPwLoading(true);
    try {
      await axios.post(
        `${API}/participants/change-password`,
        { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword },
        { headers }
      );
      setPwMsg('Password changed successfully!');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setPwMsg(''), 4000);
    } catch (err) {
      setPwError(err.response?.data?.message || 'Could not change password.');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="page">
      <h2>My Profile</h2>
      <p style={{ color: '#666', marginBottom: 28 }}>
        Logged in as <strong>{user.email}</strong> &nbsp;·&nbsp;
        <span className="badge badge-approved">{user.isIIITStudent ? 'IIIT Student' : 'External'}</span>
      </p>

      {/* ── Personal Details ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Personal Details</h3>
        {profileMsg && <div className="success-msg">{profileMsg}</div>}

        <form onSubmit={saveProfile}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>First Name</label>
              <input type="text" name="firstName" value={profile.firstName}
                onChange={handleProfileChange} placeholder="First name" />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input type="text" name="lastName" value={profile.lastName}
                onChange={handleProfileChange} placeholder="Last name" />
            </div>
          </div>

          <div className="form-group">
            <label>Email (cannot change)</label>
            <input type="email" value={user.email} disabled
              style={{ background: '#f8fafc', cursor: 'not-allowed', opacity: 0.7 }} />
          </div>

          <div className="form-group">
            <label>{user.isIIITStudent ? 'College / Institution' : 'College / Organisation'}</label>
            <input type="text" name="college" value={profile.college}
              onChange={handleProfileChange}
              placeholder={user.isIIITStudent ? 'IIIT Hyderabad' : 'Your organisation'} />
          </div>

          <div className="form-group">
            <label>Contact Number</label>
            <input type="tel" name="contactNumber" value={profile.contactNumber}
              onChange={handleProfileChange} placeholder="10-digit mobile number" />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: 'auto' }}>
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>

      {/* ── Interests ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Areas of Interest</h3>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 16 }}>
          Events matching your interests will appear at the top of the Events page.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {ALL_INTERESTS.map((interest) => (
            <button
              key={interest}
              type="button"
              onClick={() => toggleInterest(interest)}
              style={{
                padding: '7px 16px', borderRadius: 20, border: '2px solid',
                borderColor: interests.includes(interest) ? '#2563eb' : '#cbd5e1',
                background:  interests.includes(interest) ? '#eff6ff' : '#fff',
                color:       interests.includes(interest) ? '#2563eb' : '#475569',
                fontWeight:  interests.includes(interest) ? 600 : 400,
                cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.15s',
              }}
            >
              {interests.includes(interest) ? '✓ ' : ''}{interest}
            </button>
          ))}
        </div>
      </div>

      {/* ── Followed Organisers ── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Followed Organisers</h3>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 16 }}>
          Events from followed organisers are always recommended to you first.
        </p>

        {allOrganizers.length === 0 ? (
          <p style={{ color: '#888' }}>No organisers registered yet.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            {allOrganizers.map((org) => {
              const isFollowed = followed.includes(org._id);
              return (
                <div
                  key={org._id}
                  onClick={() => toggleFollow(org._id)}
                  style={{
                    padding: 14, borderRadius: 10, cursor: 'pointer', border: '2px solid',
                    borderColor: isFollowed ? '#2563eb' : '#e2e8f0',
                    background:  isFollowed ? '#eff6ff' : '#fff',
                    transition: 'all 0.15s',
                  }}
                >
                  <p style={{ fontWeight: 600, marginBottom: 2 }}>{org.clubName || org.name}</p>
                  {org.category && (
                    <span className="badge badge-registered" style={{ fontSize: '0.72rem' }}>{org.category}</span>
                  )}
                  {isFollowed && (
                    <p style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.82rem', marginTop: 6 }}>✓ Following</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save Preferences button */}
      {prefMsg && <div className="success-msg" style={{ marginBottom: 12 }}>{prefMsg}</div>}
      <button className="btn btn-success" onClick={savePreferences} disabled={prefLoading} style={{ width: 'auto' }}>
        {prefLoading ? 'Saving preferences...' : 'Save Preferences'}
      </button>

      {/* ── Security / Change Password ── */}
      <div className="card" style={{ marginTop: 32 }}>
        <h3 style={{ marginBottom: 4 }}>Security Settings</h3>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 16 }}>Update your password below. Must be at least 6 characters.</p>

        {pwMsg   && <div className="success-msg" style={{ marginBottom: 12 }}>{pwMsg}</div>}
        {pwError && <div className="error-msg"   style={{ marginBottom: 12 }}>{pwError}</div>}

        <form onSubmit={handleChangePassword}>
          <div className="form-group">
            <label>Current Password *</label>
            <input type="password" required autoComplete="current-password"
              value={pwForm.currentPassword}
              onChange={(e) => setPwForm((p) => ({ ...p, currentPassword: e.target.value }))}
              placeholder="Enter your current password" />
          </div>
          <div className="form-group">
            <label>New Password *</label>
            <input type="password" required autoComplete="new-password"
              value={pwForm.newPassword}
              onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))}
              placeholder="At least 6 characters" />
          </div>
          <div className="form-group">
            <label>Confirm New Password *</label>
            <input type="password" required autoComplete="new-password"
              value={pwForm.confirmPassword}
              onChange={(e) => setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))}
              placeholder="Repeat new password" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={pwLoading} style={{ width: 'auto' }}>
            {pwLoading ? 'Changing…' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Profile;
