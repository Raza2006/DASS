const express       = require('express');
const router        = express.Router();
const Team          = require('../models/Team');
const Event         = require('../models/Event');
const Registration  = require('../models/Registration');
const User          = require('../models/User');
const { protect, allowRoles } = require('../middleware/authMiddleware');
const { sendTicketEmail } = require('../utils/email');

// ── Helper: finalize a team → create registrations for all accepted members ──
async function finalizeTeam(team) {
  const event       = await Event.findById(team.event).populate('organizer', 'name clubName');
  if (!event) return;

  const accepted    = team.members.filter((m) => m.status === 'accepted');
  const userIds     = accepted.map((m) => m.user);
  const users       = await User.find({ _id: { $in: userIds } });

  for (const member of accepted) {
    const user = users.find((u) => u._id.toString() === member.user.toString());
    if (!user) continue;

    // Upsert: create a new registration or re-activate a cancelled one
    let reg = await Registration.findOne({ event: event._id, participant: user._id });
    if (reg) {
      reg.status   = 'registered';
      reg.teamId   = team._id;
      await reg.save();
    } else {
      reg = await Registration.create({
        event:       event._id,
        participant: user._id,
        status:      'registered',
        teamId:      team._id,
        formResponses: {},
        merchandiseSelections: [],
        totalAmount: event.registrationFee || 0,
      });
    }

    const participantName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.name;
    sendTicketEmail({
      to:   user.email,
      participantName,
      event,
      registration: reg,
      ticketId: reg.ticketId || reg._id.toString(),
    });
  }

  // Lock form after first completion
  if (!event.formLocked) {
    await Event.findByIdAndUpdate(event._id, { formLocked: true });
  }
}

// ── POST /api/teams  ─────────────────────────────────────────────────────────
// Leader creates a team for a team-based event
router.post('/', protect, allowRoles('participant'), async (req, res) => {
  try {
    const { eventId, teamName, maxSize } = req.body;
    if (!eventId || !teamName?.trim()) {
      return res.status(400).json({ message: 'eventId and teamName are required' });
    }

    const event = await Event.findById(eventId);
    if (!event)                     return res.status(404).json({ message: 'Event not found' });
    if (!event.isTeamEvent)         return res.status(400).json({ message: 'This event does not support team registration' });
    if (event.status !== 'approved' && event.status !== 'ongoing') {
      return res.status(400).json({ message: 'Event is not open for registration' });
    }

    // Eligibility: block external participants from IIIT-only events
    const isIIITOnly = /iiit/i.test(event.eligibility || '');
    if (isIIITOnly && !req.user.isIIITStudent) {
      return res.status(403).json({ message: 'This event is open to IIIT students only. External participants are not eligible.' });
    }

    const size = Number(maxSize);
    if (!size || size < event.minTeamSize || size > event.maxTeamSize) {
      return res.status(400).json({ message: `Team size must be between ${event.minTeamSize} and ${event.maxTeamSize}` });
    }

    // Prevent leader from creating two teams for the same event
    const existingTeam = await Team.findOne({ event: eventId, 'members.user': req.user._id });
    if (existingTeam) {
      return res.status(400).json({ message: 'You already belong to a team for this event' });
    }

    const team = await Team.create({
      event:   eventId,
      name:    teamName.trim(),
      leader:  req.user._id,
      maxSize: size,
      members: [{ user: req.user._id, status: 'accepted' }],
    });

    // If maxSize is 1 (edge case) finalize immediately
    if (team.members.length >= team.maxSize) {
      team.status = 'complete';
      await team.save();
      await finalizeTeam(team);
    }

    const populated = await Team.findById(team._id)
      .populate('leader', 'name email')
      .populate('members.user', 'name email');
    res.status(201).json(populated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Error creating team' });
  }
});

// ── GET /api/teams/invite/:code  ─────────────────────────────────────────────
// Public info about a team (anyone can see before joining)
router.get('/invite/:code', protect, async (req, res) => {
  try {
    const team = await Team.findOne({ inviteCode: req.params.code.toUpperCase() })
      .populate('event', 'title startDate venue status isTeamEvent minTeamSize maxTeamSize')
      .populate('leader', 'name email')
      .populate('members.user', 'name email');
    if (!team) return res.status(404).json({ message: 'Invalid invite code' });

    const accepted = team.members.filter((m) => m.status === 'accepted').length;
    res.json({
      _id:         team._id,
      name:        team.name,
      event:       team.event,
      leader:      team.leader,
      status:      team.status,
      maxSize:     team.maxSize,
      inviteCode:  team.inviteCode,
      memberCount: accepted,
      slotsLeft:   team.maxSize - accepted,
      members:     team.members,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching team' });
  }
});

// ── POST /api/teams/join/:code  ──────────────────────────────────────────────
// Participant joins a team via invite code
router.post('/join/:code', protect, allowRoles('participant'), async (req, res) => {
  try {
    const team = await Team.findOne({ inviteCode: req.params.code.toUpperCase() })
      .populate('event');
    if (!team) return res.status(404).json({ message: 'Invalid invite code' });
    if (team.status !== 'forming') {
      return res.status(400).json({ message: team.status === 'complete' ? 'Team is already full' : 'Team is no longer active' });
    }

    const event = team.event;
    if (event.status !== 'approved' && event.status !== 'ongoing') {
      return res.status(400).json({ message: 'Event is not open for registration' });
    }

    // Eligibility: block external participants from IIIT-only events
    const isIIITOnly = /iiit/i.test(event.eligibility || '');
    if (isIIITOnly && !req.user.isIIITStudent) {
      return res.status(403).json({ message: 'This event is open to IIIT students only. External participants are not eligible.' });
    }
    if (event.registrationDeadline && new Date() > new Date(event.registrationDeadline)) {
      return res.status(400).json({ message: 'Registration deadline has passed' });
    }

    // Check if already in a team for this event
    const alreadyInTeam = await Team.findOne({
      event:         event._id,
      'members.user': req.user._id,
      status:         { $ne: 'cancelled' },
    });
    if (alreadyInTeam) {
      return res.status(400).json({ message: 'You already belong to a team for this event' });
    }

    const accepted = team.members.filter((m) => m.status === 'accepted').length;
    if (accepted >= team.maxSize) {
      return res.status(400).json({ message: 'Team is already full' });
    }

    // Add member
    team.members.push({ user: req.user._id, status: 'accepted' });
    const newAccepted = team.members.filter((m) => m.status === 'accepted').length;

    if (newAccepted >= team.maxSize) {
      team.status = 'complete';
    }

    await team.save();

    if (team.status === 'complete') {
      await finalizeTeam(team);
    }

    const populated = await Team.findById(team._id)
      .populate('event', 'title startDate venue')
      .populate('leader', 'name email')
      .populate('members.user', 'name email');
    res.json({ message: 'Joined team successfully', team: populated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Error joining team' });
  }
});

// ── GET /api/teams/my/:eventId  ──────────────────────────────────────────────
// Get the current user's team for a specific event
router.get('/my/:eventId', protect, allowRoles('participant'), async (req, res) => {
  try {
    const team = await Team.findOne({
      event:          req.params.eventId,
      'members.user': req.user._id,
      status:         { $ne: 'cancelled' },
    })
      .populate('event', 'title startDate venue isTeamEvent minTeamSize maxTeamSize')
      .populate('leader', 'name email')
      .populate('members.user', 'name email');

    if (!team) return res.json(null);
    res.json(team);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching team' });
  }
});

// ── GET /api/teams/mine  ─────────────────────────────────────────────────────
// Get ALL teams the current user belongs to (across all events)
router.get('/mine', protect, allowRoles('participant'), async (req, res) => {
  try {
    const teams = await Team.find({
      'members.user': req.user._id,
      status:         { $ne: 'cancelled' },
    })
      .populate('event', 'title startDate venue status')
      .populate('leader', 'name email')
      .populate('members.user', 'name email')
      .sort({ createdAt: -1 });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching teams' });
  }
});

// ── DELETE /api/teams/:id  ───────────────────────────────────────────────────
// Leader disbands / cancels a forming team
router.delete('/:id', protect, allowRoles('participant'), async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found' });
    if (team.leader.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the team leader can disband the team' });
    }
    if (team.status === 'complete') {
      return res.status(400).json({ message: 'Cannot disband a completed team' });
    }

    team.status = 'cancelled';
    await team.save();
    res.json({ message: 'Team disbanded' });
  } catch (err) {
    res.status(500).json({ message: 'Error disbanding team' });
  }
});

// ── GET /api/teams/event/:eventId  ──────────────────────────────────────────
// Organizer sees all teams for their event (check ownership inline)
router.get('/event/:eventId', protect, allowRoles('organizer'), async (req, res) => {
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

module.exports = router;
