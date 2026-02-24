const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const IIIT_DOMAINS = ['@students.iiit.ac.in', '@iiit.ac.in', '@research.iiit.ac.in'];

const isIIITEmail = (email) => {
  return IIIT_DOMAINS.some((domain) => email.toLowerCase().endsWith(domain));
};

const isValidPhoneNumber = (phone) => /^[0-9]{10}$/.test(phone);

router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      participantType,
      firstName,
      lastName,
      college,
      contactNumber
    } = req.body;

    if (!name || !email || !password || !participantType || !contactNumber) {
      return res.status(400).json({ message: 'Please fill in all required fields' });
    }

    if (!['iiit', 'external'].includes(participantType)) {
      return res.status(400).json({ message: 'Invalid participant type' });
    }

    if (participantType === 'iiit' && !isIIITEmail(email)) {
      return res.status(400).json({
        message: 'IIIT students must register with an IIIT email address'
      });
    }

    if (participantType === 'external' && isIIITEmail(email)) {
      return res.status(400).json({
        message: 'This email belongs to IIIT. Please register as an IIIT Student.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const cleanPhone = contactNumber.replace(/\D/g, '');

    if (!isValidPhoneNumber(cleanPhone)) {
      return res.status(400).json({
        message: 'Contact number must be exactly 10 digits'
      });
    }

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const existingPhone = await User.findOne({ contactNumber: cleanPhone });
    if (existingPhone) {
      return res.status(400).json({ message: 'Contact number already in use' });
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: 'participant',
      isIIITStudent: participantType === 'iiit',
      firstName: firstName || '',
      lastName: lastName || '',
      college: college || '',
      contactNumber: cleanPhone
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isIIITStudent: user.isIIITStudent,
      onboardingDone: user.onboardingDone,
      token: generateToken(user._id)
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please enter email and password' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.isDisabled) {
      return res.status(403).json({ message: 'Your account has been disabled. Please contact the administrator.' });
    }
    if (user.isArchived) {
      return res.status(403).json({ message: 'This account has been archived and is no longer active.' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isIIITStudent: user.isIIITStudent,
      clubName: user.clubName,
      onboardingDone: user.onboardingDone,
      token: generateToken(user._id)
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

router.get(
  '/me',
  require('../middleware/authMiddleware').protect,
  async (req, res) => {
    res.json(req.user);
  }
);

module.exports = router;
