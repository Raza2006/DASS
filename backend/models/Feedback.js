const mongoose = require('mongoose');
const { Schema } = mongoose;

const feedbackSchema = new Schema({
  event:       { type: Schema.Types.ObjectId, ref: 'Event',       required: true, index: true },
  // Stored only to enforce one-per-participant; NEVER returned in API responses
  participant: { type: Schema.Types.ObjectId, ref: 'User',        required: true },
  rating:      { type: Number, min: 1, max: 5, required: true },
  comment:     { type: String, default: '', maxlength: 1000 },
}, { timestamps: true });

// One feedback per participant per event
feedbackSchema.index({ event: 1, participant: 1 }, { unique: true });

module.exports = mongoose.model('Feedback', feedbackSchema);
