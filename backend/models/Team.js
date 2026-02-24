const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema(
  {
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status:     { type: String, enum: ['pending', 'accepted', 'declined'], default: 'accepted' },
    joinedAt:   { type: Date, default: Date.now },
  },
  { _id: false }
);

const teamSchema = new mongoose.Schema(
  {
    event:      { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    name:       { type: String, required: true, trim: true },
    leader:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    maxSize:    { type: Number, required: true, min: 2, max: 20 },
    inviteCode: { type: String, unique: true },
    members:    [memberSchema],
    status:     { type: String, enum: ['forming', 'complete', 'cancelled'], default: 'forming' },
  },
  { timestamps: true }
);

// Auto-generate a 6-character alphanumeric invite code on create
teamSchema.pre('save', function (next) {
  if (!this.inviteCode) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    this.inviteCode = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }
  next();
});

// Virtual: accepted member count
teamSchema.virtual('acceptedCount').get(function () {
  return this.members.filter((m) => m.status === 'accepted').length;
});

module.exports = mongoose.model('Team', teamSchema);
