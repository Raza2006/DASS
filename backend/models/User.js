const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['participant', 'organizer', 'admin'],
      required: true,
    },

    isIIITStudent: { type: Boolean, default: false },
    firstName:    { type: String, default: '' },
    lastName:     { type: String, default: '' },
    college:      { type: String, default: '' },
    contactNumber: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (v) => /^[0-9]{10}$/.test(v),
        message: 'Contact number must be exactly 10 digits',
      },
    },

    interests: { type: [String], default: [] },
    followedOrganizers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    onboardingDone: { type: Boolean, default: false },

    clubName:       { type: String, default: '' },
    category:       { type: String, default: '' },
    description:    { type: String, default: '' },
    contactEmail:   { type: String, default: '' },
    discordWebhook: { type: String, default: '' },

    isDisabled: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
