import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';

// Interest categories that match event categories
const ALL_INTERESTS = [
  'Technical', 'Cultural', 'Sports', 'Workshop',
  'Talk', 'Competition', 'Gaming', 'Music',
  'Art', 'Social', 'Finance', 'General',
];

function Onboarding() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [interests, setInterests] = useState([]);
  const [organizers, setOrganizers] = useState([]);
  const [followed, setFollowed] = useState([]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1); // 1 = interests, 2 = follow organizers

  // Redirect if not a participant or already done onboarding via login (not new)
  useEffect(() => {
    if (!user || user.role !== 'participant') navigate('/dashboard');
    fetchOrganizers();
  }, []);

  const fetchOrganizers = async () => {
    try {
      const { data } = await axios.get(`${API}/participants/organizers`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      setOrganizers(data);
    } catch {
      // soft fail — organizer list is optional
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

  const saveAndContinue = async () => {
    setSaving(true);
    try {
      await axios.put(
        `${API}/participants/preferences`,
        { interests, followedOrganizers: followed },
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      updateUser({ onboardingDone: true });
      navigate('/dashboard');
    } catch {
      navigate('/dashboard'); // don't block on failure
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    try {
      await axios.post(`${API}/participants/onboarding/skip`, {}, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      updateUser({ onboardingDone: true });
    } catch { /* silent */ }
    navigate('/dashboard');
  };

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Progress indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {[1, 2].map((s) => (
          <div key={s} style={{
            flex: 1, height: 4, borderRadius: 4,
            background: s <= step ? '#2563eb' : '#e2e8f0',
          }} />
        ))}
      </div>

      {step === 1 && (
        <>
          <h2>Welcome to Felicity!</h2>
          <p style={{ color: '#555', marginBottom: 24 }}>
            Select the areas you're interested in — we'll use these to surface the most
            relevant events for you. You can change these any time from your profile.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 32 }}>
            {ALL_INTERESTS.map((interest) => (
              <button
                key={interest}
                type="button"
                onClick={() => toggleInterest(interest)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 20,
                  border: '2px solid',
                  borderColor: interests.includes(interest) ? '#2563eb' : '#cbd5e1',
                  background:  interests.includes(interest) ? '#eff6ff' : '#fff',
                  color:       interests.includes(interest) ? '#2563eb' : '#475569',
                  fontWeight:  interests.includes(interest) ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {interests.includes(interest) ? '✓ ' : ''}{interest}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-primary" onClick={() => setStep(2)}>
              Continue →
            </button>
            <button className="btn btn-secondary" onClick={skip}>
              Skip for now
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h2>Follow Organisers</h2>
          <p style={{ color: '#555', marginBottom: 24 }}>
            Follow organisers whose events you don't want to miss. Their events will
            always appear at the top of your events page.
          </p>

          {organizers.length === 0 ? (
            <div className="card"><p>No organisers registered yet — you can follow them later from your profile.</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 32 }}>
              {organizers.map((org) => {
                const isFollowed = followed.includes(org._id);
                return (
                  <div
                    key={org._id}
                    onClick={() => toggleFollow(org._id)}
                    style={{
                      padding: 16, borderRadius: 12, cursor: 'pointer',
                      border: '2px solid',
                      borderColor: isFollowed ? '#2563eb' : '#e2e8f0',
                      background:  isFollowed ? '#eff6ff' : '#fff',
                      transition: 'all 0.15s',
                    }}
                  >
                    <p style={{ fontWeight: 600, marginBottom: 2 }}>{org.clubName || org.name}</p>
                    {org.category && (
                      <span className="badge badge-registered" style={{ fontSize: '0.75rem' }}>
                        {org.category}
                      </span>
                    )}
                    {org.description && (
                      <p style={{ color: '#64748b', fontSize: '0.82rem', marginTop: 6, lineHeight: 1.4 }}>
                        {org.description.slice(0, 80)}{org.description.length > 80 ? '…' : ''}
                      </p>
                    )}
                    {isFollowed && (
                      <p style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.85rem', marginTop: 8 }}>✓ Following</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" onClick={saveAndContinue} disabled={saving}>
              {saving ? 'Saving...' : 'Save & Go to Dashboard'}
            </button>
            <button className="btn btn-secondary" onClick={skip}>Skip</button>
          </div>
        </>
      )}
    </div>
  );
}

export default Onboarding;
