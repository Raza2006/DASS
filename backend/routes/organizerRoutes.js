const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const { protect, allowRoles } = require('../middleware/authMiddleware');

// All routes require organizer login
router.use(protect, allowRoles('organizer'));

// ── GET /api/organizer/profile ──────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch {
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// ── PUT /api/organizer/profile ──────────────────────────────────────────────
router.put('/profile', async (req, res) => {
  try {
    const { name, clubName, category, description, contactEmail, contactNumber, discordWebhook } = req.body;
    const user = await User.findById(req.user._id);
    if (name            !== undefined) user.name           = name;
    if (clubName        !== undefined) user.clubName       = clubName;
    if (category        !== undefined) user.category       = category;
    if (description     !== undefined) user.description    = description;
    if (contactEmail    !== undefined) user.contactEmail   = contactEmail;
    if (contactNumber   !== undefined) user.contactNumber  = contactNumber;
    if (discordWebhook  !== undefined) user.discordWebhook = discordWebhook;
    await user.save();
    res.json({ message: 'Profile updated', user: { name: user.name, clubName: user.clubName } });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Error updating profile' });
  }
});

// ── GET /api/organizer/analytics ────────────────────────────────────────────
// Aggregate stats across ALL this organizer's events
router.get('/analytics', async (req, res) => {
  try {
    const myEvents = await Event.find({ organizer: req.user._id }).select('_id title status eventType');
    const eventIds = myEvents.map((e) => e._id);

    const regs = await Registration.find({
      event: { $in: eventIds },
      status: { $in: ['registered', 'attended', 'completed'] },
    }).populate('event', 'title status eventType registrationFee');

    const totalRegistrations = regs.length;
    // Only count revenue for confirmed payments: free/normal events (not_required) or approved merch payments
    const confirmedRegs  = regs.filter((r) => !r.paymentStatus || r.paymentStatus === 'not_required' || r.paymentStatus === 'approved');
    const totalRevenue   = confirmedRegs.reduce((s, r) => s + (r.totalAmount || r.event?.registrationFee || 0), 0);
    const totalAttended  = regs.filter((r) => r.status === 'attended' || r.status === 'completed').length;
    // Only count merch registrations where payment has been approved by organizer
    const totalSales     = regs.filter((r) => r.event?.eventType === 'merchandise' && r.paymentStatus === 'approved').length;

    // Per-event breakdown (completed / ongoing events only for analytics)
    const completedEventIds = myEvents
      .filter((e) => ['completed', 'closed', 'ongoing'].includes(e.status))
      .map((e) => e._id.toString());

    const perEvent = myEvents.map((ev) => {
      const evRegs = regs.filter((r) => r.event?._id?.toString() === ev._id.toString());
      return {
        _id:           ev._id,
        title:         ev.title,
        status:        ev.status,
        registrations: evRegs.length,
        attended:      evRegs.filter((r) => r.status === 'attended' || r.status === 'completed').length,
        revenue:       evRegs
          .filter((r) => !r.paymentStatus || r.paymentStatus === 'not_required' || r.paymentStatus === 'approved')
          .reduce((s, r) => s + (r.totalAmount || 0), 0),
      };
    });

    res.json({ totalRegistrations, totalRevenue, totalAttended, totalSales, perEvent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching analytics' });
  }
});

// ── PATCH /api/organizer/events/:id/status ─────────────────────────────────
// Allowed transitions:
//   draft       → pending  (publish — sends for admin approval)
//   approved    → ongoing  (mark as ongoing)
//   approved    → closed   (close registrations)
//   ongoing     → completed
//   ongoing     → closed
//   any         → closed   (organizer can always close)
router.patch('/events/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.organizer.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Not your event' });

    const validTransitions = {
      draft:     ['pending'],
      pending:   ['draft'],              // pull back to draft
      approved:  ['ongoing', 'closed'],
      ongoing:   ['completed', 'closed'],
    };
    const allowed = validTransitions[event.status];
    if (!allowed || !allowed.includes(status))
      return res.status(400).json({ message: `Cannot change from '${event.status}' to '${status}'` });

    event.status = status;
    await event.save();

    // Discord webhook: notify when organizer submits draft for admin review
    if (status === 'pending') {
      const organizer = await User.findById(req.user._id).select('discordWebhook clubName name');
      if (organizer?.discordWebhook) {
        try {
          const feeText = event.registrationFee > 0 ? `\u20b9${event.registrationFee}` : 'Free';
          await axios.post(organizer.discordWebhook, {
            embeds: [{
              title: `Event Submitted for Review: ${event.title}`,
              description: event.description ? event.description.slice(0, 200) + (event.description.length > 200 ? '...' : '') : '',
              color: 0x2563eb,
              fields: [
                { name: 'Organizer', value: organizer.clubName || organizer.name, inline: true },
                { name: 'Category', value: event.category, inline: true },
                { name: 'Date', value: event.startDate ? event.startDate.toDateString() : 'TBD', inline: true },
                { name: 'Venue', value: event.venue, inline: true },
                { name: 'Registration Fee', value: feeText, inline: true },
              ],
              footer: { text: 'Felicity Events Platform — Pending admin approval' },
              timestamp: new Date().toISOString(),
            }],
          });
        } catch (webhookErr) {
          console.warn('Discord webhook failed (non-critical):', webhookErr.message);
        }
      }
    }

    res.json({ message: `Status updated to '${status}'`, status: event.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating status' });
  }
});

// ── GET /api/organizer/events/:id/analytics ────────────────────────────────
router.get('/events/:id/analytics', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.organizer.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Not your event' });

    const regs = await Registration.find({
      event: req.params.id,
      status: { $in: ['registered', 'attended', 'completed', 'cancelled'] },
    });

    const active    = regs.filter((r) => ['registered', 'attended', 'completed'].includes(r.status));
    const attended  = regs.filter((r) => ['attended', 'completed'].includes(r.status));
    const cancelled = regs.filter((r) => r.status === 'cancelled');
    const revenue   = active.reduce((s, r) => s + (r.totalAmount || 0), 0);

    // Merchandise-specific: sales count
    const sales = event.eventType === 'merchandise'
      ? active.reduce((s, r) => s + (r.merchandiseSelections?.reduce((ss, sel) => ss + sel.quantity, 0) || 0), 0)
      : null;

    res.json({
      totalRegistrations: active.length,
      attended:           attended.length,
      cancelled:          cancelled.length,
      revenue,
      sales,
      attendanceRate: active.length > 0 ? Math.round((attended.length / active.length) * 100) : 0,
      capacity: event.maxParticipants || null,
      isFull: event.maxParticipants > 0 && active.length >= event.maxParticipants,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching analytics' });
  }
});

// ── GET /api/organizer/orders ─────────────────────────────────────────────────
// All merchandise orders (with payment proofs) for this organizer's events
router.get('/orders', async (req, res) => {
  try {
    const myEvents = await Event.find({ organizer: req.user._id, eventType: 'merchandise' }).select('_id title');
    const eventIds = myEvents.map((e) => e._id);

    const orders = await Registration.find({ event: { $in: eventIds }, status: { $in: ['registered', 'attended'] } })
      .populate('participant', 'name email')
      .populate('event', 'title startDate merchandiseItems')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching orders' });
  }
});

// ── GET /api/organizer/orders/:eventId ────────────────────────────────────────
// Orders for a specific event (used by OrganizerEventDetail Orders tab)
router.get('/orders/:eventId', async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your event' });
    }

    const orders = await Registration.find({ event: req.params.eventId, status: { $in: ['registered', 'attended', 'cancelled'] } })
      .populate('participant', 'name email')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching orders' });
  }
});

// ── PATCH /api/organizer/orders/:regId/approve ────────────────────────────────
// Organizer approves a payment: decrement stock, mark approved, generate ticket, send email
const { sendPaymentApprovalEmail, sendPaymentRejectionEmail } = require('../utils/email');

router.patch('/orders/:regId/approve', async (req, res) => {
  try {
    const reg = await Registration.findById(req.params.regId)
      .populate('participant', 'name email firstName lastName')
      .populate({ path: 'event', populate: { path: 'organizer', select: 'name clubName' } });

    if (!reg) return res.status(404).json({ message: 'Order not found' });
    if (reg.event.organizer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your event' });
    }
    if (reg.paymentStatus !== 'pending_approval') {
      return res.status(400).json({ message: `Order is in '${reg.paymentStatus}' state — cannot approve` });
    }

    // Decrement stock now
    const event = await Event.findById(reg.event._id);
    for (const sel of reg.merchandiseSelections) {
      const item = event.merchandiseItems[sel.itemIndex];
      if (item?.variants?.length > 0) {
        const variant = item.variants.find(v => v.size === sel.size && v.color === sel.color);
        if (variant) {
          if (variant.stock < sel.quantity) {
            return res.status(400).json({ message: `Not enough stock for ${item.name} (${sel.size}/${sel.color})` });
          }
          variant.stock -= sel.quantity;
        }
      }
    }
    await event.save();

    reg.paymentStatus = 'approved';
    // Ensure ticketId is generated (pre-save hook should have done it, but just in case)
    if (!reg.ticketId) {
      reg.ticketId = 'FEL-' + reg._id.toString().slice(-8).toUpperCase();
    }
    await reg.save();

    // Send approval + ticket email
    const participant = reg.participant;
    const participantName = participant.firstName
      ? `${participant.firstName} ${participant.lastName || ''}`.trim()
      : participant.name;

    sendPaymentApprovalEmail({
      to:   participant.email,
      participantName,
      event: reg.event,
      registration: reg,
      ticketId: reg.ticketId,
    });

    res.json({ message: 'Payment approved. Ticket generated and email sent.', registration: reg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Error approving payment' });
  }
});

// ── PATCH /api/organizer/orders/:regId/reject ─────────────────────────────────
router.patch('/orders/:regId/reject', async (req, res) => {
  try {
    const reg = await Registration.findById(req.params.regId)
      .populate('participant', 'name email firstName lastName')
      .populate({ path: 'event', select: 'organizer title venue startDate' });

    if (!reg) return res.status(404).json({ message: 'Order not found' });
    if (reg.event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your event' });
    }
    if (!['pending_approval', 'pending_proof'].includes(reg.paymentStatus)) {
      return res.status(400).json({ message: `Order is in '${reg.paymentStatus}' state — cannot reject` });
    }

    reg.paymentStatus = 'rejected';
    await reg.save();

    // Send rejection email
    const participant = reg.participant;
    const participantName = participant.firstName
      ? `${participant.firstName} ${participant.lastName || ''}`.trim()
      : participant.name;
    sendPaymentRejectionEmail({ to: participant.email, participantName, event: reg.event });

    res.json({ message: 'Payment rejected.', registration: reg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Error rejecting payment' });
  }
});

// ── GET /api/organizer/teams/:eventId ────────────────────────────────────────
// Teams for this organizer's team event
const Team = require('../models/Team');
router.get('/teams/:eventId', async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (event.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your event' });
    }

    const teams = await Team.find({ event: req.params.eventId })
      .populate('leader', 'name email')
      .populate('members.user', 'name email')
      .sort({ createdAt: -1 });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching teams' });
  }
});

// ─── Password Reset Request ───────────────────────────────────────────────────
const PasswordResetRequest = require('../models/PasswordResetRequest');

// POST /api/organizer/password-reset-request
router.post('/password-reset-request', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim()) return res.status(400).json({ message: 'Reason is required' });

    // One pending request at a time
    const existing = await PasswordResetRequest.findOne({ organizer: req.user._id, status: 'pending' });
    if (existing) return res.status(400).json({ message: 'You already have a pending request. Please wait for Admin to resolve it.' });

    const org = await User.findById(req.user._id).select('clubName');
    const request = await PasswordResetRequest.create({
      organizer: req.user._id,
      clubName:  org?.clubName || '',
      reason:    reason.trim(),
    });
    res.status(201).json({ message: 'Password reset request submitted. Admin will review it.', request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/organizer/password-reset-requests — history for this organizer
router.get('/password-reset-requests', async (req, res) => {
  try {
    const requests = await PasswordResetRequest.find({ organizer: req.user._id })
      .populate('resolvedBy', 'name')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
