const express      = require('express');
const router       = express.Router();
const ForumPost    = require('../models/ForumPost');
const Event        = require('../models/Event');
const Registration = require('../models/Registration');
const { protect, allowRoles } = require('../middleware/authMiddleware');

// Helper: check if user is registered for the event (participant) or owns it (organizer/admin)
async function canAccessForum(userId, userRole, eventId) {
  if (userRole === 'admin') return true;
  if (userRole === 'organizer') {
    const ev = await Event.findById(eventId).select('organizer');
    return ev && ev.organizer.toString() === userId.toString();
  }
  // participant — must have an active registration
  const reg = await Registration.findOne({
    event: eventId,
    participant: userId,
    status: { $in: ['registered', 'attended', 'completed'] },
  });
  return !!reg;
}

// ─── GET /api/forum/:eventId ─────────────────────────────────────────────────
// Fetch all non-deleted posts for this event, populated with author
router.get('/:eventId', protect, async (req, res) => {
  try {
    const { eventId } = req.params;
    const allowed = await canAccessForum(req.user._id, req.user.role, eventId);
    if (!allowed) return res.status(403).json({ message: 'Not registered for this event' });

    const posts = await ForumPost.find({ event: eventId, deleted: false })
      .populate('author', 'name role clubName')
      .sort({ pinned: -1, createdAt: 1 });

    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── POST /api/forum/:eventId ─────────────────────────────────────────────────
// Post a new top-level message or announcement
router.post('/:eventId', protect, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { content, type, parentId } = req.body;

    if (!content?.trim()) return res.status(400).json({ message: 'Content is required' });

    const allowed = await canAccessForum(req.user._id, req.user.role, eventId);
    if (!allowed) return res.status(403).json({ message: 'Not registered for this event' });

    // Only organizer/admin can post announcements
    const postType = (type === 'announcement' && ['organizer', 'admin'].includes(req.user.role))
      ? 'announcement'
      : 'message';

    const post = await ForumPost.create({
      event:    eventId,
      author:   req.user._id,
      content:  content.trim(),
      type:     postType,
      parentId: parentId || null,
    });

    const populated = await post.populate('author', 'name role clubName');

    // emit via Socket.IO
    const io = req.app.get('io');
    if (io) io.to(`forum:${eventId}`).emit('forum:new', populated);

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── DELETE /api/forum/:postId ────────────────────────────────────────────────
// Soft-delete: organizer (owns event) / admin can delete any; author can delete their own
router.delete('/:postId', protect, async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.deleted) return res.status(400).json({ message: 'Already deleted' });

    const isAuthor     = post.author.toString() === req.user._id.toString();
    const isAdmin      = req.user.role === 'admin';
    const isOrganizer  = req.user.role === 'organizer';

    let canDelete = isAuthor || isAdmin;
    if (isOrganizer) {
      const ev = await Event.findById(post.event).select('organizer');
      canDelete = ev && ev.organizer.toString() === req.user._id.toString();
    }

    if (!canDelete) return res.status(403).json({ message: 'Not allowed' });

    post.deleted = true;
    await post.save();

    const io = req.app.get('io');
    if (io) io.to(`forum:${post.event}`).emit('forum:delete', { _id: post._id, event: post.event });

    res.json({ message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/forum/:postId/pin ────────────────────────────────────────────
// Toggle pin — organizer (owns event) or admin only
router.patch('/:postId/pin', protect, allowRoles('organizer', 'admin'), async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.postId);
    if (!post || post.deleted) return res.status(404).json({ message: 'Post not found' });

    if (req.user.role === 'organizer') {
      const ev = await Event.findById(post.event).select('organizer');
      if (!ev || ev.organizer.toString() !== req.user._id.toString())
        return res.status(403).json({ message: 'Not your event' });
    }

    post.pinned = !post.pinned;
    await post.save();
    const populated = await post.populate('author', 'name role clubName');

    const io = req.app.get('io');
    if (io) io.to(`forum:${post.event}`).emit('forum:pin', populated);

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── PATCH /api/forum/:postId/react ─────────────────────────────────────────
// Toggle a reaction emoji — any authenticated forum member
router.patch('/:postId/react', protect, async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ message: 'emoji required' });

    const post = await ForumPost.findById(req.params.postId);
    if (!post || post.deleted) return res.status(404).json({ message: 'Post not found' });

    const allowed = await canAccessForum(req.user._id, req.user.role, post.event);
    if (!allowed) return res.status(403).json({ message: 'Not registered for this event' });

    let bucket = post.reactions.find((r) => r.emoji === emoji);
    if (!bucket) {
      post.reactions.push({ emoji, users: [req.user._id] });
    } else {
      const idx = bucket.users.findIndex((u) => u.toString() === req.user._id.toString());
      if (idx === -1) bucket.users.push(req.user._id);
      else bucket.users.splice(idx, 1);
      // Remove empty bucket
      if (bucket.users.length === 0) {
        post.reactions = post.reactions.filter((r) => r.emoji !== emoji);
      }
    }
    await post.save();
    const populated = await post.populate('author', 'name role clubName');

    const io = req.app.get('io');
    if (io) io.to(`forum:${post.event}`).emit('forum:react', populated);

    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
