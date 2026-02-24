import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';

// Valid IIIT email domains — must match backend validation
const IIIT_DOMAINS = ['@students.iiit.ac.in', '@iiit.ac.in', '@research.iiit.ac.in'];
const isIIITEmail = (email) => IIIT_DOMAINS.some((d) => email.toLowerCase().endsWith(d));

function Register() {
  const [participantType, setParticipantType] = useState('iiit');
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '',
    college: 'IIIT Hyderabad', contactNumber: '',
    password: '', confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const generatePassword = () => {
    const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower   = 'abcdefghijklmnopqrstuvwxyz';
    const digits  = '0123456789';
    const special = '!@#$%^&*_+-=?';
    const all = upper + lower + digits + special;
    let chars = [
      upper[Math.floor(Math.random() * upper.length)],
      lower[Math.floor(Math.random() * lower.length)],
      digits[Math.floor(Math.random() * digits.length)],
      special[Math.floor(Math.random() * special.length)],
    ];
    for (let i = 4; i < 14; i++) chars.push(all[Math.floor(Math.random() * all.length)]);
    const pwd = chars.sort(() => Math.random() - 0.5).join('');
    setForm((p) => ({ ...p, password: pwd, confirmPassword: pwd }));
    setShowPassword(true);
  };

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (!form.firstName.trim()) return 'First name is required.';
    if (!form.lastName.trim())  return 'Last name is required.';
    if (!form.email.trim())     return 'Email is required.';
    if (participantType === 'iiit' && !isIIITEmail(form.email)) {
      return 'IIIT students must use an IIIT email (@students.iiit.ac.in, @iiit.ac.in, or @research.iiit.ac.in).';
    }
    if (participantType === 'external' && isIIITEmail(form.email)) {
      return 'IIIT email detected — please register as IIIT Student.';
    }
    if (form.password.length < 6) return 'Password must be at least 6 characters.';
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/auth/register`, {
        name:          `${form.firstName.trim()} ${form.lastName.trim()}`,
        firstName:     form.firstName.trim(),
        lastName:      form.lastName.trim(),
        email:         form.email,
        password:      form.password,
        participantType,
        college:       form.college,
        contactNumber: form.contactNumber,
      });
      login(data);
      // Send participant to onboarding; admin/organiser never self-register
      navigate('/onboarding');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-wrap">
    <div className="auth-container">
      <h2>Participant Registration</h2>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: 16 }}>
        Organizer accounts are created by the Admin.
      </p>

      {error && <div className="error-msg">{error}</div>}

      {/* Participant type toggle */}
      <div className="form-group">
        <label>I am a...</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button type="button"
            className={`btn btn-sm ${participantType === 'iiit' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, width: 'auto' }}
            onClick={() => { setParticipantType('iiit'); setForm((p) => ({ ...p, email: '', college: 'IIIT Hyderabad' })); }}
          >
            IIIT Student
          </button>
          <button type="button"
            className={`btn btn-sm ${participantType === 'external' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, width: 'auto' }}
            onClick={() => { setParticipantType('external'); setForm((p) => ({ ...p, email: '', college: '' })); }}
          >
            External Participant
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>First Name *</label>
            <input type="text" name="firstName" placeholder="First name"
              value={form.firstName} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>Last Name *</label>
            <input type="text" name="lastName" placeholder="Last name"
              value={form.lastName} onChange={handleChange} required />
          </div>
        </div>

        <div className="form-group">
          <label>{participantType === 'iiit' ? 'IIIT Email Address *' : 'Email Address *'}</label>
          <input type="email" name="email"
            placeholder={participantType === 'iiit' ? 'yourname@students.iiit.ac.in' : 'yourname@example.com'}
            value={form.email} onChange={handleChange} required />
          {participantType === 'iiit' && (
            <small style={{ color: '#888', fontSize: '0.8rem' }}>
              Must be @students.iiit.ac.in, @iiit.ac.in, or @research.iiit.ac.in
            </small>
          )}
        </div>

        <div className="form-group">
          <label>{participantType === 'iiit' ? 'College / Institution' : 'College / Organisation'}</label>
          <input type="text" name="college"
            placeholder={participantType === 'iiit' ? 'IIIT Hyderabad' : 'Your college or organisation'}
            value={form.college} onChange={handleChange} />
        </div>

        <div className="form-group">
          <label>Contact Number</label>
          <input type="tel" name="contactNumber" placeholder="10-digit mobile number"
            value={form.contactNumber} onChange={handleChange} />
        </div>

        <div className="form-group">
          <label>Password *</label>
          <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              placeholder="Minimum 6 characters"
              value={form.password}
              onChange={handleChange}
              required
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => setShowPassword((v) => !v)}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ whiteSpace: 'nowrap' }}
              onClick={generatePassword}
              title="Generate a strong random password"
            >
              Generate
            </button>
          </div>
          {form.password && showPassword && (
            <small style={{ color: '#6b7280', fontSize: '0.78rem', marginTop: 4, display: 'block', wordBreak: 'break-all' }}>
              Save this password somewhere safe before continuing.
            </small>
          )}
        </div>

        <div className="form-group">
          <label>Confirm Password *</label>
          <input
            type={showPassword ? 'text' : 'password'}
            name="confirmPassword"
            placeholder="Re-enter password"
            value={form.confirmPassword}
            onChange={handleChange}
            required
          />
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account & Continue'}
        </button>
      </form>

      <p style={{ marginTop: 16, textAlign: 'center' }}>
        Already have an account? <Link to="/login">Login here</Link>
      </p>
    </div>
    </div>
  );
}

export default Register;
