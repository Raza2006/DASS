const mongoose = require('mongoose');
const { Schema } = mongoose;

const reactionSchema = new Schema({
  emoji:  { type: String, required: true },
  users:  [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { _id: false });

const forumPostSchema = new Schema({
  event:    { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  author:   { type: Schema.Types.ObjectId, ref: 'User',  required: true },
  parentId: { type: Schema.Types.ObjectId, ref: 'ForumPost', default: null },
  content:  { type: String, required: true, maxlength: 2000 },
  type:     { type: String, enum: ['message', 'announcement'], default: 'message' },
  pinned:   { type: Boolean, default: false },
  deleted:  { type: Boolean, default: false },          // soft-delete
  reactions: [reactionSchema],
}, { timestamps: true });

// Index for fetching all posts for an event in order
forumPostSchema.index({ event: 1, createdAt: 1 });

module.exports = mongoose.model('ForumPost', forumPostSchema);
