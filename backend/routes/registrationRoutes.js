const express       = require('express');
const router        = express.Router();
const Registration  = require('../models/Registration');
const Event         = require('../models/Event');
const User          = require('../models/User');
const { protect, allowRoles } = require('../middleware/authMiddleware');
const { sendTicketEmail, sendOrderPlacedEmail, sendCancellationEmail } = require('../utils/email');
const upload = require('../middleware/upload');

//  helpers 
const occupiedSeats = (eventId) =>
  Registration.countDocuments({ event: eventId, status: { $in: ['registered', 'attended'] } });

//  POST /api/registrations/:eventId 
router.post('/:eventId', protect, allowRoles('participant'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId)
      .populate('organizer', 'name clubName');
    if (!event)                      return res.status(404).json({ message: 'Event not found' });
    if (event.status === 'closed')   return res.status(400).json({ message: 'Event is full' });
    if (!['approved', 'ongoing'].includes(event.status))
      return res.status(400).json({ message: 'This event is not open for registration' });

    // Eligibility: block external participants from IIIT-only events
    const isIIITOnly = /iiit/i.test(event.eligibility || '');
    if (isIIITOnly && !req.user.isIIITStudent) {
      return res.status(403).json({ message: 'This event is open to IIIT students only. External participants are not eligible to register.' });
    }

    if (event.registrationDeadline && new Date() > new Date(event.registrationDeadline)) {
      return res.status(400).json({ message: 'Registration deadline has passed' });
    }

    // Team events: registration must go through the team route
    if (event.isTeamEvent) {
      return res.status(400).json({
        message: 'This is a team event. Create or join a team to register.',
        isTeamEvent: true,
      });
    }

    const participant = await User.findById(req.user._id).select('email name firstName lastName');

    const existing = await Registration.findOne({ event: req.params.eventId, participant: req.user._id });
    if (existing && existing.status === 'registered') {
      return res.status(400).json({ message: 'You are already registered for this event' });
    }

    //  Merchandise validation 
    let merchandiseSelections = [];
    let totalAmount = 0;
    let paymentStatus = 'not_required';

    if (event.eventType === 'merchandise') {
      const selections = req.body.merchandiseSelections || [];
      if (selections.length === 0) {
        return res.status(400).json({ message: 'Select at least one merchandise item' });
      }
      const totalQty = selections.reduce((s, sel) => s + (Number(sel.quantity) || 1), 0);
      if (event.purchaseLimitPerParticipant > 0 && totalQty > event.purchaseLimitPerParticipant) {
        return res.status(400).json({ message: `Purchase limit is ${event.purchaseLimitPerParticipant} item(s) per order` });
      }
      for (const sel of selections) {
        const item = event.merchandiseItems[sel.itemIndex];
        if (!item) return res.status(400).json({ message: `Invalid item index: ${sel.itemIndex}` });
        const qty = Number(sel.quantity) || 1;
        if (item.variants && item.variants.length > 0) {
          const variant = item.variants.find(v => v.size === (sel.size || '') && v.color === (sel.color || ''));
          if (!variant) return res.status(400).json({ message: `Variant not found for ${item.name}` });
          if (variant.stock < qty) {
            return res.status(400).json({ message: `Not enough stock for ${item.name} (${sel.size}/${sel.color}). Available: ${variant.stock}` });
          }
          // Do NOT deduct stock here; deduct happens on organizer approval
        }
        merchandiseSelections.push({ itemIndex: sel.itemIndex, itemName: item.name, size: sel.size || '', color: sel.color || '', quantity: qty, priceEach: item.price });
        totalAmount += item.price * qty;
      }
      paymentStatus = totalAmount > 0 ? 'pending_proof' : 'not_required';
    }

    //  Normal event custom form 
    let formResponses = {};
    if (event.eventType === 'normal' && event.customFormFields?.length > 0) {
      const responses = req.body.formResponses || {};
      for (const field of event.customFormFields) {
        if (field.required && !responses[field.label]) {
          return res.status(400).json({ message: `"${field.label}" is required` });
        }
        formResponses[field.label] = responses[field.label] || '';
      }
    }

    //  Capacity check 
    if (event.maxParticipants > 0) {
      const seats = await occupiedSeats(req.params.eventId);
      if (seats >= event.maxParticipants) {
        event.status = 'closed'; await event.save();
        return res.status(400).json({ message: 'Event is full' });
      }
    }

    let registration;

    if (existing && existing.status === 'cancelled') {
      existing.status               = 'registered';
      existing.formResponses        = formResponses;
      existing.merchandiseSelections= merchandiseSelections;
      existing.totalAmount          = totalAmount;
      existing.paymentStatus        = paymentStatus;
      existing.paymentProof         = '';
      await existing.save();
      if (event.maxParticipants > 0) {
        const seats = await occupiedSeats(req.params.eventId);
        if (seats >= event.maxParticipants) { event.status = 'closed'; await event.save(); }
      }
      registration = existing;
    } else {
      registration = await Registration.create({
        event: req.params.eventId, participant: req.user._id, status: 'registered',
        formResponses, merchandiseSelections, totalAmount, paymentStatus,
      });
      if (event.maxParticipants > 0) {
        const seats = await occupiedSeats(req.params.eventId);
        if (seats >= event.maxParticipants) { event.status = 'closed'; await event.save(); }
      }
      if (!event.formLocked) {
        await Event.findByIdAndUpdate(req.params.eventId, { formLocked: true });
      }
    }

    // Send ticket email only if payment is not required
    const participantName = participant.firstName
      ? `${participant.firstName} ${participant.lastName || ''}`.trim()
      : participant.name;
    if (paymentStatus === 'not_required') {
      sendTicketEmail({
        to: participant.email,
        participantName,
        event,
        registration,
        ticketId: registration.ticketId || registration._id.toString(),
      });
    } else if (paymentStatus === 'pending_proof') {
      sendOrderPlacedEmail({ to: participant.email, participantName, event, registration });
    }

    res.status(201).json({ message: 'Registered successfully', registration });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error registering for event' });
  }
});

//  POST /api/registrations/:regId/payment-proof 
router.post('/:regId/payment-proof', protect, allowRoles('participant'), upload.single('paymentProof'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file uploaded' });

    const reg = await Registration.findById(req.params.regId).populate('event');
    if (!reg) return res.status(404).json({ message: 'Registration not found' });
    if (reg.participant.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your registration' });
    }
    if (reg.paymentStatus !== 'pending_proof') {
      return res.status(400).json({ message: `Cannot upload proof in '${reg.paymentStatus}' state` });
    }

    reg.paymentProof  = `/uploads/payments/${req.file.filename}`;
    reg.paymentStatus = 'pending_approval';
    await reg.save();

    res.json({ message: 'Payment proof uploaded. Awaiting organizer approval.', registration: reg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Error uploading payment proof' });
  }
});

//  DELETE /api/registrations/:eventId 
router.delete('/:eventId', protect, allowRoles('participant'), async (req, res) => {
  try {
    const registration = await Registration.findOne({ event: req.params.eventId, participant: req.user._id, status: 'registered' });
    if (!registration) return res.status(404).json({ message: 'Active registration not found' });

    registration.status = 'cancelled';
    await registration.save();

    const event = await Event.findById(req.params.eventId).populate('organizer', 'name clubName');
    // Only restore merchandise stock if it was already approved (stock deducted at approval)
    if (event?.eventType === 'merchandise' && registration.paymentStatus === 'approved') {
      for (const sel of registration.merchandiseSelections) {
        const item = event.merchandiseItems[sel.itemIndex];
        if (item?.variants?.length > 0) {
          const variant = item.variants.find(v => v.size === sel.size && v.color === sel.color);
          if (variant) variant.stock += sel.quantity;
        }
      }
    }
    if (event?.maxParticipants > 0 && event.status === 'closed') {
      const seats = await occupiedSeats(req.params.eventId);
      if (seats < event.maxParticipants) event.status = 'approved';
    }
    if (event) await event.save();

    // Send cancellation email
    const participant = await User.findById(req.user._id).select('email name firstName lastName');
    if (participant && event) {
      const participantName = participant.firstName
        ? `${participant.firstName} ${participant.lastName || ''}`.trim()
        : participant.name;
      sendCancellationEmail({ to: participant.email, participantName, event });
    }

    res.json({ message: 'Registration cancelled' });
  } catch (error) {
    res.status(500).json({ message: 'Error cancelling registration' });
  }
});

//  GET /api/registrations/my/list 
router.get('/my/list', protect, allowRoles('participant'), async (req, res) => {
  try {
    const registrations = await Registration.find({ participant: req.user._id })
      .populate('event', 'title startDate endDate venue status clubName category eventType registrationFee organizer isTeamEvent')
      .populate({ path: 'event', populate: { path: 'organizer', select: 'name clubName' } })
      .sort({ createdAt: -1 });
    res.json(registrations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching registrations' });
  }
});

//  GET /api/registrations/:id 
router.get('/:id', protect, allowRoles('participant'), async (req, res) => {
  try {
    const reg = await Registration.findById(req.params.id)
      .populate({ path: 'event', populate: { path: 'organizer', select: 'name clubName' } });
    if (!reg) return res.status(404).json({ message: 'Registration not found' });
    if (reg.participant.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your registration' });
    }
    res.json(reg);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching registration' });
  }
});

module.exports = router;
