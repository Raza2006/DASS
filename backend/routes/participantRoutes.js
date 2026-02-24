const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Event = require('../models/Event');
const { protect, allowRoles } = require('../middleware/authMiddleware');

// All routes here require a logged-in participant
router.use(protect, allowRoles('participant'));

// GET /api/participants/profile
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('followedOrganizers', 'name clubName category description contactEmail');
    res.json(user);
  } catch {
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// PUT /api/participants/profile
router.put('/profile', async (req, res) => {
  try {
    const { firstName, lastName, college, contactNumber } = req.body;
    const user = await User.findById(req.user._id);
    if (firstName     !== undefined) user.firstName     = firstName;
    if (lastName      !== undefined) user.lastName      = lastName;
    if (college       !== undefined) user.college       = college;
    if (contactNumber !== undefined) user.contactNumber = contactNumber;
    await user.save();
    res.json({ message: 'Profile updated' });
  } catch {
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// PUT /api/participants/preferences
router.put('/preferences', async (req, res) => {
  try {
    const { interests, followedOrganizers } = req.body;
    const user = await User.findById(req.user._id);
    if (Array.isArray(interests))          user.interests          = interests;
    if (Array.isArray(followedOrganizers)) user.followedOrganizers = followedOrganizers;
    user.onboardingDone = true;
    await user.save();
    res.json({ message: 'Preferences saved' });
  } catch {
    res.status(500).json({ message: 'Error saving preferences' });
  }
});

// POST /api/participants/onboarding/skip
router.post('/onboarding/skip', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { onboardingDone: true });
    res.json({ message: 'Onboarding skipped' });
  } catch {
    res.status(500).json({ message: 'Error skipping onboarding' });
  }
});

// PUT /api/participants/follow/:organizerId  - toggle follow/unfollow
router.put('/follow/:organizerId', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const orgId = req.params.organizerId;
    const idx = user.followedOrganizers.findIndex((id) => id.toString() === orgId);
    if (idx === -1) {
      user.followedOrganizers.push(orgId);
    } else {
      user.followedOrganizers.splice(idx, 1);
    }
    await user.save();
    const isFollowing = idx === -1;
    res.json({ message: isFollowing ? 'Followed' : 'Unfollowed', following: isFollowing });
  } catch (err) {
    res.status(500).json({ message: 'Error toggling follow' });
  }
});

// POST /api/participants/change-password
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Both current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    const user = await User.findById(req.user._id);
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(401).json({ message: 'Current password is incorrect' });
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch {
    res.status(500).json({ message: 'Error changing password' });
  }
});

// GET /api/participants/organizers  - all approved organizers
router.get('/organizers', async (req, res) => {
  try {
    const organizers = await User.find({ role: 'organizer' })
      .select('name clubName category description contactEmail');
    res.json(organizers);
  } catch {
    res.status(500).json({ message: 'Error fetching organizers' });
  }
});

// GET /api/participants/organizers/:id  - organizer detail + their events
router.get('/organizers/:id', async (req, res) => {
  try {
    const org = await User.findById(req.params.id).select('name clubName category description contactEmail');
    if (!org || org.role === undefined) {
      // fetch without role filter since select removes role
      const check = await User.findById(req.params.id).select('role');
      if (!check || check.role !== 'organizer') {
        return res.status(404).json({ message: 'Organizer not found' });
      }
    }
    const now = new Date();
    const upcoming = await Event.find({ organizer: req.params.id, status: 'approved', startDate: { $gte: now } })
      .sort({ startDate: 1 });
    const past = await Event.find({ organizer: req.params.id, status: 'approved', startDate: { $lt: now } })
      .sort({ startDate: -1 });
    res.json({ organizer: org, upcoming, past });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching organizer details' });
  }
});

module.exports = router;


// GET /api/participants/profile  - get full profile + preferences
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('followedOrganizers', 'name clubName category description contactEmail');
    res.json(user);
  } catch {
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// PUT /api/participants/profile  - update personal details
router.put('/profile', async (req, res) => {
  try {
    const { firstName, lastName, college, contactNumber } = req.body;
    const user = await User.findById(req.user._id);
    if (firstName     !== undefined) user.firstName     = firstName;
    if (lastName      !== undefined) user.lastName      = lastName;
    if (college       !== undefined) user.college       = college;
    if (contactNumber !== undefined) user.contactNumber = contactNumber;
    await user.save();
    res.json({ message: 'Profile updated' });
  } catch {
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// PUT /api/participants/preferences  - save or update interest + follow preferences
router.put('/preferences', async (req, res) => {
  try {
    const { interests, followedOrganizers } = req.body;
    const user = await User.findById(req.user._id);
    if (Array.isArray(interests))          user.interests          = interests;
    if (Array.isArray(followedOrganizers)) user.followedOrganizers = followedOrganizers;
    user.onboardingDone = true;   // mark onboarding complete
    await user.save();
    res.json({ message: 'Preferences saved' });
  } catch {
    res.status(500).json({ message: 'Error saving preferences' });
  }
});

// POST /api/participants/onboarding/skip  - skip onboarding without saving prefs
router.post('/onboarding/skip', async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { onboardingDone: true });
    res.json({ message: 'Onboarding skipped' });
  } catch {
    res.status(500).json({ message: 'Error skipping onboarding' });
  }
});

// GET /api/participants/organizers  - list all organizers (for the follow selector)
router.get('/organizers', async (req, res) => {
  try {
    const organizers = await User.find({ role: 'organizer' })
      .select('name clubName category description contactEmail');
    res.json(organizers);
  } catch {
    res.status(500).json({ message: 'Error fetching organizers' });
  }
});

module.exports = router;
