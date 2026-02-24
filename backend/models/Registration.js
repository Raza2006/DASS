const mongoose = require('mongoose');

const merchandiseSelectionSchema = new mongoose.Schema({
  itemIndex: { type: Number, required: true },
  itemName:  { type: String, default: '' },
  size:      { type: String, default: '' },
  color:     { type: String, default: '' },
  quantity:  { type: Number, default: 1, min: 1 },
  priceEach: { type: Number, default: 0 },
}, { _id: false });

const registrationSchema = new mongoose.Schema(
  {
    event:       { type: mongoose.Schema.Types.ObjectId, ref: 'Event',   required: true },
    participant: { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

    status: {
      type: String,
      enum: ['registered', 'attended', 'cancelled'],
      default: 'registered',
    },

    formResponses: { type: Map, of: String, default: {} },

    merchandiseSelections: { type: [merchandiseSelectionSchema], default: [] },
    totalAmount: { type: Number, default: 0 },

    ticketId: { type: String, unique: true, sparse: true },

    paymentStatus: {
      type: String,
      enum: ['not_required', 'pending_proof', 'pending_approval', 'approved', 'rejected'],
      default: 'not_required',
    },
    paymentProof: { type: String, default: '' },

    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  },
  { timestamps: true }
);

// Auto-generate ticketId before saving if not set
registrationSchema.pre('save', function () {
  if (!this.ticketId && this._id) {
    this.ticketId = 'FEL-' + this._id.toString().slice(-8).toUpperCase();
  }
});

// A participant can only have one registration record per event
registrationSchema.index({ event: 1, participant: 1 }, { unique: true });

module.exports = mongoose.model('Registration', registrationSchema);
