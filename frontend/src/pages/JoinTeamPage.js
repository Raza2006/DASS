import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import API from '../api';
import { useAuth } from '../context/AuthContext';

export default function JoinTeamPage() {
  const { code }    = useParams();
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const headers     = user ? { Authorization: `Bearer ${user.token}` } : {};

  const [teamInfo,  setTeamInfo]  = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [joining,   setJoining]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    axios.get(`${API}/teams/invite/${code}`)
      .then(({ data }) => setTeamInfo(data))
      .catch((err) => setError(err.response?.data?.message || 'Invalid or expired invite link.'))
      .finally(() => setLoading(false));
  }, [code, user, navigate]);

  const handleJoin = async () => {
    setJoining(true);
    setError('');
    try {
      const { data } = await axios.post(`${API}/teams/join/${code}`, {}, { headers });
      setSuccess(data.message || 'Joined successfully!');
      setTimeout(() => navigate(`/events/${data.team?.event}`), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to join team.');
    } finally {
      setJoining(false);
    }
  };

  if (loading) return <div className="page"><div className="card" style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>Loading invite…</div></div>;

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 480, margin: '60px auto' }}>
        <h2 style={{ marginBottom: 4 }}>Team Invite</h2>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 20 }}>Code: <code style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{code}</code></p>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
        {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}

        {teamInfo && !success && (
          <>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
              <p style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 4 }}>{teamInfo.teamName}</p>
              <p style={{ color: '#475569', fontSize: '0.875rem', marginBottom: 4 }}>Event: <strong>{teamInfo.eventTitle}</strong></p>
              <p style={{ color: '#475569', fontSize: '0.875rem', marginBottom: 4 }}>
                Members: <strong>{teamInfo.memberCount}</strong> / {teamInfo.maxSize}
                {teamInfo.slotsLeft <= 0
                  ? <span style={{ color: '#dc2626', marginLeft: 8 }}>(Team Full)</span>
                  : <span style={{ color: '#059669', marginLeft: 8 }}>({teamInfo.slotsLeft} slot{teamInfo.slotsLeft !== 1 ? 's' : ''} left)</span>
                }
              </p>
              <p style={{ color: '#475569', fontSize: '0.875rem' }}>Status: <strong>{teamInfo.status}</strong></p>
            </div>

            {teamInfo.slotsLeft <= 0 || teamInfo.status !== 'forming' ? (
              <p style={{ color: '#dc2626', textAlign: 'center', fontWeight: 600 }}>
                {teamInfo.status !== 'forming' ? 'This team is no longer accepting members.' : 'This team is already full.'}
              </p>
            ) : (
              <>
                {user?.role !== 'participant' && (
                  <p style={{ color: '#f59e0b', marginBottom: 12, fontSize: '0.875rem' }}>Only participants can join teams.</p>
                )}
                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={handleJoin}
                  disabled={joining || user?.role !== 'participant'}
                >
                  {joining ? 'Joining…' : 'Join Team'}
                </button>
              </>
            )}
          </>
        )}

        {!teamInfo && !error && (
          <p style={{ color: '#94a3b8', textAlign: 'center' }}>No team found for this code.</p>
        )}

        <button
          className="btn btn-secondary"
          style={{ width: '100%', marginTop: 12 }}
          onClick={() => navigate('/events')}
        >
          ← Browse Events
        </button>
      </div>
    </div>
  );
}
