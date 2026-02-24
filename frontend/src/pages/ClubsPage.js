import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';

function ClubsPage() {
  const { user } = useAuth();
  const [organizers, setOrganizers]   = useState([]);
  const [followed, setFollowed]       = useState(new Set());
  const [loading, setLoading]         = useState(true);
  const [message, setMessage]         = useState('');
  const [error, setError]             = useState('');
  const [search, setSearch]           = useState('');

  const headers = user?.token ? { Authorization: `Bearer ${user.token}` } : {};

  const fetchOrganizers = async () => {
    try {
      const { data } = await axios.get(`${API}/participants/organizers`, { headers });
      setOrganizers(data);
    } catch {
      setError('Could not load organizers.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMyFollowed = async () => {
    if (!user?.token) return;
    try {
      const { data } = await axios.get(`${API}/participants/profile`, { headers });
      const ids = (data.followedOrganizers || []).map((o) => (typeof o === 'object' ? o._id : o));
      setFollowed(new Set(ids));
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchOrganizers();
    fetchMyFollowed();
  }, []);

  const toggleFollow = async (orgId) => {
    if (!user) return;
    try {
      const { data } = await axios.put(
        `${API}/participants/follow/${orgId}`,
        {},
        { headers }
      );
      setFollowed((prev) => {
        const next = new Set(prev);
        if (data.following) next.add(orgId);
        else next.delete(orgId);
        return next;
      });
      setMessage(data.following ? 'Following!' : 'Unfollowed.');
      setTimeout(() => setMessage(''), 2500);
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
      setTimeout(() => setError(''), 3000);
    }
  };

  const filtered = organizers.filter((org) => {
    const q = search.toLowerCase();
    return !q || (org.clubName || org.name || '').toLowerCase().includes(q) ||
      (org.category || '').toLowerCase().includes(q) ||
      (org.description || '').toLowerCase().includes(q);
  });

  if (loading) return <div className="page"><p>Loading clubs…</p></div>;

  return (
    <div className="page">
      <div className="section-header">
        <h2>Clubs &amp; Organizers</h2>
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
          Follow clubs to get personalised event recommendations.
        </p>
      </div>

      {message && <div className="success-msg">{message}</div>}
      {error   && <div className="error-msg">{error}</div>}

      <input
        type="text"
        placeholder="Search clubs…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: '0.95rem', marginBottom: 20 }}
      />

      {filtered.length === 0 ? (
        <p style={{ color: '#888' }}>{search ? 'No clubs match your search.' : 'No clubs registered yet.'}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map((org) => {
            const isFollowing = followed.has(org._id);
            return (
              <div key={org._id} className="card" style={{ position: 'relative' }}>
                {/* Category badge */}
                {org.category && (
                  <span className="badge badge-registered" style={{ fontSize: '0.72rem', marginBottom: 8, display: 'inline-block' }}>
                    {org.category}
                  </span>
                )}

                <h3 style={{ marginBottom: 4, marginTop: 4 }}>
                  <Link to={`/clubs/${org._id}`} style={{ color: '#1e293b', textDecoration: 'none' }}>
                    {org.clubName || org.name}
                  </Link>
                </h3>

                {org.description && (
                  <p style={{ color: '#475569', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: 8, minHeight: 40 }}>
                    {org.description.length > 100 ? org.description.slice(0, 100) + '…' : org.description}
                  </p>
                )}

                {org.contactEmail && (
                  <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 10 }}>
                    ✉ {org.contactEmail}
                  </p>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <Link to={`/clubs/${org._id}`}
                    className="btn btn-secondary btn-sm"
                    style={{ textDecoration: 'none', flex: 1, textAlign: 'center' }}>
                    View Events
                  </Link>
                  {user?.role === 'participant' && (
                    <button
                      className={isFollowing ? 'btn btn-danger btn-sm' : 'btn btn-success btn-sm'}
                      style={{ flex: 1 }}
                      onClick={() => toggleFollow(org._id)}
                    >
                      {isFollowing ? '✓ Following' : '+ Follow'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ClubsPage;
