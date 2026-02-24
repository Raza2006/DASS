/**
 * seedAdmin.js
 * Run this ONCE to create the first admin account in the system.
 *
 * Usage:
 *   cd backend
 *   node scripts/seedAdmin.js
 *
 * You can override defaults with env vars:
 *   ADMIN_NAME="My Admin" ADMIN_EMAIL="admin@iiit.ac.in" ADMIN_PASSWORD="secret123" node scripts/seedAdmin.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');

const ADMIN_NAME     = process.env.ADMIN_NAME     || 'Admin';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@iiit.ac.in';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin@12345';

async function seedAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB...');

    // Check if any admin already exists
    const existing = await User.findOne({ role: 'admin' });
    if (existing) {
      console.log(`Admin already exists: ${existing.email}`);
      console.log('No changes made. Exiting.');
      process.exit(0);
    }

    // Create the admin
    const admin = await User.create({
      name:     ADMIN_NAME,
      email:    ADMIN_EMAIL.toLowerCase(),
      password: ADMIN_PASSWORD,
      role:     'admin',
    });

    console.log('✅ Admin account created successfully!');
    console.log('─────────────────────────────────');
    console.log(`  Name    : ${admin.name}`);
    console.log(`  Email   : ${admin.email}`);
    console.log(`  Password: ${ADMIN_PASSWORD}  ← save this!`);
    console.log('─────────────────────────────────');
    console.log('You can now log in at http://localhost:3000/login');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error.message);
    process.exit(1);
  }
}

seedAdmin();
