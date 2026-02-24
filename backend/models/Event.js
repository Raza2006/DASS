const mongoose = require('mongoose');

// Custom form field schema (organizer-defined extra questions per event)
const formFieldSchema = new mongoose.Schema({
  label:      { type: String, required: true },          // e.g. "Team name"
  fieldType:  {
    type: String,
    enum: ['text', 'textarea', 'number', 'select', 'checkbox', 'file'],
    default: 'text',
  },
  options:    { type: [String], default: [] },
  required:   { type: Boolean, default: false },
}, { _id: false });

// Merchandise variant schema (size/colour with individual stock)
const variantSchema = new mongoose.Schema({
  size:  { type: String, default: '' },
  color: { type: String, default: '' },
  stock: { type: Number, default: 0, min: 0 },
}, { _id: false });

// Merchandise item schema
const merchandiseItemSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  price:       { type: Number, required: true, min: 0 },
  variants:    { type: [variantSchema], default: [] },
}, { _id: false });

const eventSchema = new mongoose.Schema(
  {
    title:        { type: String, required: true, trim: true },
    description:  { type: String, required: true },
    eventType:    { type: String, enum: ['normal', 'merchandise'], default: 'normal' },
    eligibility:  { type: String, default: 'Open to all' },
    registrationDeadline: { type: Date },
    startDate:    { type: Date, required: true },
    endDate:      { type: Date },
    maxParticipants: { type: Number, default: 0 },
    registrationFee: { type: Number, default: 0 },
    organizer:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tags:         { type: [String], default: [] },

    clubName:  { type: String, default: '' },
    venue:     { type: String, required: true },
    category:  { type: String, default: 'General' },
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected', 'closed', 'ongoing', 'completed'],
      default: 'pending',
    },
    formLocked: { type: Boolean, default: false },

    customFormFields: { type: [formFieldSchema], default: [] },

    purchaseLimitPerParticipant: { type: Number, default: 1 },
    merchandiseItems: { type: [merchandiseItemSchema], default: [] },

    isTeamEvent: { type: Boolean, default: false },
    minTeamSize: { type: Number, default: 2 },
    maxTeamSize: { type: Number, default: 5 },
  },
  { timestamps: true }
);

eventSchema.virtual('date').get(function () { return this.startDate; });

module.exports = mongoose.model('Event', eventSchema);
