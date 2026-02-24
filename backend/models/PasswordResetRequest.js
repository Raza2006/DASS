const mongoose = require('mongoose');
const { Schema } = mongoose;

const passwordResetRequestSchema = new Schema({
  organizer:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  clubName:          { type: String, default: '' },
  reason:            { type: String, required: true, maxlength: 500 },
  status:            { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminComment:      { type: String, default: '' },
  generatedPassword: { type: String, default: '' },
  resolvedAt:        { type: Date, default: null },
  resolvedBy:        { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('PasswordResetRequest', passwordResetRequestSchema);
