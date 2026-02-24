const express      = require('express');
const router       = express.Router();
const Feedback     = require('../models/Feedback');
const Registration = require('../models/Registration');
const Event        = require('../models/Event');
const { protect, allowRoles } = require('../middleware/authMiddleware');

// POST /api/feedback/:eventId  — participant submits anonymous feedback
router.post('/:eventId', protect, allowRoles('participant'), async (req, res) => {
  try {
    const { eventId } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });

    // Only attended (or completed) participants can leave feedback
    const reg = await Registration.findOne({
      event:       eventId,
      participant: req.user._id,
      status:      { $in: ['attended', 'completed'] },
    });
    if (!reg)
      return res.status(403).json({ message: 'You can only give feedback for events you have attended' });

    const existing = await Feedback.findOne({ event: eventId, participant: req.user._id });
    if (existing)
      return res.status(400).json({ message: 'You have already submitted feedback for this event' });

    await Feedback.create({
      event:       eventId,
      participant: req.user._id,
      rating:      Number(rating),
      comment:     (comment || '').trim().slice(0, 1000),
    });

    res.status(201).json({ message: 'Feedback submitted. Thank you!' });
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({ message: 'You have already submitted feedback for this event' });
    res.status(500).json({ message: err.message });
  }
});

// GET /api/feedback/:eventId/mine  — participant: did I already submit?
router.get('/:eventId/mine', protect, allowRoles('participant'), async (req, res) => {
  try {
    const fb = await Feedback.findOne({ event: req.params.eventId, participant: req.user._id });
    res.json({ submitted: !!fb, rating: fb?.rating || null, comment: fb?.comment || '' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/feedback/:eventId  — organizer / admin: get all feedback (anonymised)
router.get('/:eventId', protect, allowRoles('organizer', 'admin'), async (req, res) => {
  try {
    const { eventId } = req.params;

    // Verify ownership (organizer only)
    if (req.user.role === 'organizer') {
      const ev = await Event.findById(eventId).select('organizer');
      if (!ev || ev.organizer.toString() !== req.user._id.toString())
        return res.status(403).json({ message: 'Not your event' });
    }

    // Return all feedback WITHOUT participant field
    const feedbacks = await Feedback.find({ event: eventId })
      .select('-participant')
      .sort({ createdAt: -1 });

    // Aggregated stats
    const total  = feedbacks.length;
    const avg    = total > 0 ? feedbacks.reduce((s, f) => s + f.rating, 0) / total : 0;
    const dist   = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    feedbacks.forEach((f) => { dist[f.rating] = (dist[f.rating] || 0) + 1; });

    res.json({ feedbacks, total, avg: Math.round(avg * 10) / 10, dist });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
