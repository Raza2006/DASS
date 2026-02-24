import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';

function OrganizerDetailPage() {
  const { id }       = useParams();
  const { user }     = useAuth();
  const navigate     = useNavigate();

  const [organizer, setOrganizer]   = useState(null);
  const [upcoming, setUpcoming]     = useState([]);
  const [past, setPast]             = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading]       = useState(true);
  const [message, setMessage]       = useState('');
  const [error, setError]           = useState('');

  const headers = user?.token ? { Authorization: `Bearer ${user.token}` } : {};

  const fetchDetail = async () => {
    try {
      const [detailRes, profileRes] = await Promise.all([
        axios.get(`${API}/participants/organizers/${id}`, { headers }),
        user?.token ? axios.get(`${API}/participants/profile`, { headers }) : Promise.resolve({ data: null }),
      ]);

      setOrganizer(detailRes.data.organizer);
      setUpcoming(detailRes.data.upcoming || []);
      setPast(detailRes.data.past || []);

      if (profileRes.data) {
        const ids = (profileRes.data.followedOrganizers || []).map((o) => (typeof o === 'object' ? o._id : o));
        setIsFollowing(ids.includes(id));
      }
    } catch {
      setError('Could not load organizer details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDetail(); }, [id]);

  const toggleFollow = async () => {
    if (!user) { navigate('/login'); return; }
    try {
      const { data } = await axios.put(`${API}/participants/follow/${id}`, {}, { headers });
      setIsFollowing(data.following);
      setMessage(data.following ? 'Now following!' : 'Unfollowed.');
      setTimeout(() => setMessage(''), 2500);
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed.');
      setTimeout(() => setError(''), 3000);
    }
  };

  const fmt = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  if (loading) return <div className="page"><p>Loading…</p></div>;
  if (!organizer) return <div className="page"><div className="error-msg">{error || 'Organizer not found.'}</div></div>;

  return (
    <div className="page">
      {message && <div className="success-msg">{message}</div>}
      {error   && <div className="error-msg">{error}</div>}

      {/* Breadcrumb */}
      <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 16 }}>
        <Link to="/clubs" style={{ color: '#2563eb' }}>Clubs</Link> › {organizer.clubName || organizer.name}
      </p>

      {/* Organizer info card */}
      <div className="card" style={{ marginBottom: 24 }}>
        {organizer.category && (
          <span className="badge badge-registered" style={{ marginBottom: 10, display: 'inline-block', fontSize: '0.75rem' }}>
            {organizer.category}
          </span>
        )}
        <h2 style={{ marginBottom: 6 }}>{organizer.clubName || organizer.name}</h2>

        {organizer.description && (
          <p style={{ color: '#475569', lineHeight: 1.6, marginBottom: 12 }}>{organizer.description}</p>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          {organizer.contactEmail && (
            <span style={{ fontSize: '0.875rem', color: '#2563eb' }}>✉ {organizer.contactEmail}</span>
          )}
          <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Event Count: {upcoming.length + past.length}</span>
        </div>

        {user?.role === 'participant' && (
          <button
            className={isFollowing ? 'btn btn-danger' : 'btn btn-success'}
            style={{ width: 'auto' }}
            onClick={toggleFollow}
          >
            {isFollowing ? '✓ Unfollow' : '+ Follow'}
          </button>
        )}
      </div>

      {/* Upcoming Events */}
      <h3 style={{ marginBottom: 12, color: '#1e293b' }}>
        Upcoming Events ({upcoming.length})
      </h3>

      {upcoming.length === 0 ? (
        <p style={{ color: '#888', marginBottom: 24 }}>No upcoming events.</p>
      ) : (
        <div className="events-grid" style={{ marginBottom: 32 }}>
          {upcoming.map((ev) => (
            <div className="card" key={ev._id}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <span className="badge badge-approved">{ev.category}</span>
                {ev.eventType === 'merchandise' && (
                  <span className="badge badge-pending" style={{ background: '#fef3c7', color: '#92400e' }}>Merch</span>
                )}
              </div>
              <h4 style={{ marginBottom: 4 }}>
                <Link to={`/events/${ev._id}`} style={{ color: '#1e293b', textDecoration: 'none' }}>{ev.title}</Link>
              </h4>
              <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 6 }}>{ev.description?.slice(0, 80)}{ev.description?.length > 80 ? '…' : ''}</p>
              <p style={{ fontSize: '0.8rem' }}>{fmt(ev.startDate || ev.date)}</p>
              <p style={{ fontSize: '0.8rem' }}>{ev.venue}</p>
              {ev.registrationFee > 0
                ? <p style={{ fontWeight: 600, color: '#059669', fontSize: '0.85rem' }}>₹{ev.registrationFee}</p>
                : <p style={{ color: '#059669', fontSize: '0.85rem' }}>Free</p>}
              <div style={{ marginTop: 8 }}>
                <Link to={`/events/${ev._id}`} className="btn btn-success btn-sm" style={{ textDecoration: 'none', display: 'inline-block' }}>
                  Register / View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Past Events */}
      <h3 style={{ marginBottom: 12, color: '#1e293b' }}>
        Past Events ({past.length})
      </h3>

      {past.length === 0 ? (
        <p style={{ color: '#888' }}>No past events.</p>
      ) : (
        <div className="events-grid">
          {past.map((ev) => (
            <div className="card" key={ev._id} style={{ opacity: 0.8 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <span className="badge badge-approved">{ev.category}</span>
              </div>
              <h4 style={{ marginBottom: 4 }}>
                <Link to={`/events/${ev._id}`} style={{ color: '#475569', textDecoration: 'none' }}>{ev.title}</Link>
              </h4>
              <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{fmt(ev.startDate || ev.date)}</p>
              <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{ev.venue}</p>
              <div style={{ marginTop: 8 }}>
                <Link to={`/events/${ev._id}`} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none', display: 'inline-block' }}>
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default OrganizerDetailPage;
