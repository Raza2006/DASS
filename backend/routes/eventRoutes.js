const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Event = require('../models/Event');
const User = require('../models/User');
const Registration = require('../models/Registration');
const { protect, allowRoles } = require('../middleware/authMiddleware');

// ─── helpers ──────────────────────────────────────────────────────────────────

// Sort events so that ones matching participant's interests / followed
// organizers appear first.  Others follow sorted by date.
function personaliseEvents(events, interests = [], followedIds = []) {
  const isRecommended = (e) =>
    interests.includes(e.category) ||
    followedIds.includes(e.organizer?._id?.toString());

  const recommended = events.filter(isRecommended);
  const rest        = events.filter((e) => !isRecommended(e));
  return { sorted: [...recommended, ...rest], recommendedCount: recommended.length };
}

// GET /api/events/trending  – top 5 events by registrations in last 24 h
router.get('/trending', async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pipeline = [
      { $match: { createdAt: { $gte: since }, status: 'registered' } },
      { $group: { _id: '$event', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ];
    const agg = await Registration.aggregate(pipeline);
    const eventIds = agg.map((a) => a._id);
    const events = await Event.find({ _id: { $in: eventIds }, status: 'approved' })
      .populate('organizer', 'name clubName');
    // preserve trending order
    const ordered = eventIds
      .map((id) => events.find((e) => e._id.toString() === id.toString()))
      .filter(Boolean);
    res.json(ordered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching trending events' });
  }
});

// GET /api/events/search  – search + filter
// Query params: q, eventType, eligibility, from, to, followed (true/false)
router.get('/search', async (req, res) => {
  try {
    const { q, eventType, eligibility, from, to, followed } = req.query;
    const filter = { status: 'approved' };

    if (eventType) filter.eventType = eventType;
    if (eligibility) filter.eligibility = new RegExp(eligibility, 'i');
    if (from || to) {
      filter.startDate = {};
      if (from) filter.startDate.$gte = new Date(from);
      if (to)   filter.startDate.$lte = new Date(to);
    }

    // Text search on title / clubName
    if (q) {
      filter.$or = [
        { title:    new RegExp(q.split('').join('.*'), 'i') },   // fuzzy character-level
        { clubName: new RegExp(q.split('').join('.*'), 'i') },
      ];
    }

    let events = await Event.find(filter)
      .populate('organizer', 'name clubName category')
      .sort({ startDate: 1 });

    // Filter by followed organizers if requested
    if (followed === 'true') {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const jwt = require('jsonwebtoken');
        try {
          const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
          const user = await User.findById(decoded.id).select('followedOrganizers');
          if (user) {
            const followedIds = user.followedOrganizers.map((id) => id.toString());
            events = events.filter((e) => followedIds.includes(e.organizer?._id?.toString()));
          }
        } catch (_) {}
      }
    }

    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error searching events' });
  }
});

// GET /api/events  - all approved events (public); personalised if authenticated
router.get('/', async (req, res) => {
  try {
    const events = await Event.find({ status: 'approved' })
      .populate('organizer', 'name clubName category')
      .sort({ date: 1 });

    // Optional: personalise order if a valid Bearer token is present
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('interests followedOrganizers role');
        if (user && user.role === 'participant') {
          const followedIds = user.followedOrganizers.map((id) => id.toString());
          const { sorted, recommendedCount } = personaliseEvents(events, user.interests, followedIds);
          return res.json({ events: sorted, recommendedCount });
        }
      } catch (_) { /* invalid token – fall through to public response */ }
    }

    res.json({ events, recommendedCount: 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching events' });
  }
});

// GET /api/events/:id - get single event details
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('organizer', 'name clubName category description contactEmail');
    if (!event) return res.status(404).json({ message: 'Event not found' });
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching event' });
  }
});

// POST /api/events  - organizer creates an event
router.post('/', protect, allowRoles('organizer'), async (req, res) => {
  try {
    const {
      title, description, venue, category,
      eventType,
      startDate, endDate,
      eligibility, registrationDeadline,
      maxParticipants, registrationFee,
      tags,
      // Normal-event
      customFormFields,
      // Merchandise-event
      merchandiseItems, purchaseLimitPerParticipant,
    } = req.body;

    if (!title || !description || !startDate || !venue) {
      return res.status(400).json({ message: 'Title, description, start date and venue are required' });
    }

    const saveAsDraft = req.body.saveAsDraft === true || req.body.saveAsDraft === 'true';

    const event = await Event.create({
      title, description, venue,
      category:             category              || 'General',
      eventType:            eventType             || 'normal',
      startDate:            new Date(startDate),
      endDate:              endDate ? new Date(endDate) : null,
      eligibility:          eligibility           || 'Open to all',
      registrationDeadline: registrationDeadline  || null,
      maxParticipants:      maxParticipants        || 0,
      registrationFee:      registrationFee        || 0,
      tags:                 Array.isArray(tags) ? tags : [],
      customFormFields:     eventType !== 'merchandise' ? (customFormFields || []) : [],
      merchandiseItems:     eventType === 'merchandise' ? (merchandiseItems || []) : [],
      purchaseLimitPerParticipant: eventType === 'merchandise' ? (purchaseLimitPerParticipant || 1) : 1,
      organizer: req.user._id,
      clubName:  req.user.clubName,
      status:    saveAsDraft ? 'draft' : 'pending',
    });

    // Discord webhook: notify when event is directly submitted for approval
    if (!saveAsDraft) {
      try {
        const organizer = await require('../models/User').findById(req.user._id).select('discordWebhook clubName name');
        if (organizer?.discordWebhook) {
          const feeText = event.registrationFee > 0 ? `\u20b9${event.registrationFee}` : 'Free';
          await require('axios').post(organizer.discordWebhook, {
            embeds: [{
              title: `New Event Submitted for Review: ${event.title}`,
              description: event.description ? event.description.slice(0, 200) + (event.description.length > 200 ? '...' : '') : '',
              color: 0x2563eb,
              fields: [
                { name: 'Organizer', value: organizer.clubName || organizer.name, inline: true },
                { name: 'Category', value: event.category, inline: true },
                { name: 'Date', value: new Date(event.startDate).toDateString(), inline: true },
                { name: 'Venue', value: event.venue, inline: true },
                { name: 'Registration Fee', value: feeText, inline: true },
              ],
              footer: { text: 'Felicity Events Platform — Pending admin approval' },
              timestamp: new Date().toISOString(),
            }],
          });
        }
      } catch (webhookErr) {
        console.warn('Discord webhook failed (non-critical):', webhookErr.message);
      }
    }

    res.status(201).json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error creating event' });
  }
});

// PUT /api/events/:id  - organizer updates their event (status-aware editing rules)
router.put('/:id', protect, allowRoles('organizer'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your event' });
    }

    // Ongoing / completed — no edits allowed at all
    if (['ongoing', 'completed'].includes(event.status)) {
      return res.status(400).json({ message: 'Cannot edit an ongoing or completed event' });
    }

    const {
      title, description, venue, category,
      eventType, startDate, endDate,
      eligibility, registrationDeadline,
      maxParticipants, registrationFee,
      tags, customFormFields,
      merchandiseItems, purchaseLimitPerParticipant,
    } = req.body;

    const isApproved = event.status === 'approved';

    // Approved events: only description update, extend deadline, increase limit, description
    if (isApproved) {
      if (description !== undefined)         event.description          = description;
      if (registrationDeadline !== undefined) event.registrationDeadline = registrationDeadline || null;
      // Can only increase maxParticipants, not decrease
      if (maxParticipants !== undefined && Number(maxParticipants) >= (event.maxParticipants || 0))
        event.maxParticipants = maxParticipants;
      // No status change here (use PATCH /organizer/events/:id/status)
    } else {
      // Draft / pending — full free edits
      if (title)       event.title       = title;
      if (description) event.description = description;
      if (venue)       event.venue       = venue;
      if (category)    event.category    = category;
      if (eventType)   event.eventType   = eventType;
      if (startDate)   event.startDate   = new Date(startDate);
      if (endDate !== undefined) event.endDate = endDate ? new Date(endDate) : null;
      if (eligibility  !== undefined) event.eligibility          = eligibility;
      if (registrationDeadline !== undefined) event.registrationDeadline = registrationDeadline || null;
      if (maxParticipants !== undefined) event.maxParticipants   = maxParticipants;
      if (registrationFee !== undefined) event.registrationFee  = registrationFee;
      if (Array.isArray(tags)) event.tags = tags;

      const type = event.eventType;
      // Lock form fields after first registration
      if (!event.formLocked) {
        if (type !== 'merchandise') {
          if (Array.isArray(customFormFields)) event.customFormFields = customFormFields;
          event.merchandiseItems = [];
        } else {
          event.customFormFields = [];
          if (Array.isArray(merchandiseItems)) event.merchandiseItems = merchandiseItems;
          if (purchaseLimitPerParticipant !== undefined) event.purchaseLimitPerParticipant = purchaseLimitPerParticipant;
        }
      }

      // After editing a draft, keep as draft; after editing pending, needs re-approval
      if (event.status === 'pending') event.status = 'pending'; // stays pending for admin
    }

    const updatedEvent = await event.save();
    res.json(updatedEvent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating event' });
  }
});

// DELETE /api/events/:id  - organizer deletes their event
router.delete('/:id', protect, allowRoles('organizer', 'admin'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    // Organizer can only delete their own event; admin can delete any
    if (req.user.role === 'organizer' && event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your event' });
    }

    await event.deleteOne();
    // Also clean up registrations
    await Registration.deleteMany({ event: req.params.id });

    res.json({ message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting event' });
  }
});

// GET /api/events/organizer/my-events  - organizer sees their own events
router.get('/organizer/my-events', protect, allowRoles('organizer'), async (req, res) => {
  try {
    const events = await Event.find({ organizer: req.user._id }).sort({ createdAt: -1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching your events' });
  }
});

// GET /api/events/:id/participants  - organizer sees who registered for their event
router.get('/:id/participants', protect, allowRoles('organizer', 'admin'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    if (req.user.role === 'organizer' && event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your event' });
    }

    const registrations = await Registration.find({
      event: req.params.id,
      status: { $in: ['registered', 'attended', 'completed'] }
    })
    .populate('participant', 'name email isIIITStudent firstName lastName contactNumber')
    .sort({ createdAt: 1 });

    const validRegistrations = registrations.filter(r => r.participant);

    res.json(validRegistrations);

  } catch (error) {
    res.status(500).json({ message: 'Error fetching participants' });
  }
});

// PUT /api/events/:id/attendance/:regId  - organizer marks attendance
router.put('/:id/attendance/:regId', protect, allowRoles('organizer'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });

    if (event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your event' });
    }

    const registration = await Registration.findById(req.params.regId);
    if (!registration) return res.status(404).json({ message: 'Registration not found' });

    registration.status = 'attended';
    await registration.save();

    res.json({ message: 'Attendance marked', registration });
  } catch (error) {
    res.status(500).json({ message: 'Error marking attendance' });
  }
});

module.exports = router;
