/**
 * models/user.model.js — Mongoose User schema
 *
 * WHY the model lives here and not in the service:
 * The model is a data-layer concern. It defines the shape and constraints
 * of your data at the database level. The service layer uses it but
 * shouldn't define it.
 *
 * WHY we DON'T store plain passwords:
 * If your DB is breached, bcrypt hashes are computationally expensive to
 * crack. We NEVER store plaintext passwords. Ever.
 *
 * WHY we use select: false on password:
 * By default, Mongoose excludes the password field from query results.
 * This prevents accidental password leakage in API responses.
 * You must explicitly request it: User.findOne().select('+password')
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,         // Creates a DB index — fast lookups by email
      lowercase: true,      // Normalize to prevent duplicate accounts
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,        // Excluded from queries by default
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
    // Removes __v (version key) from JSON responses — it's internal Mongoose
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.password; // Extra safety: never serialize password
        return ret;
      },
    },
  }
);

/**
 * Pre-save hook: hash password before persisting
 * "this" refers to the document being saved.
 * We only re-hash if the password field was actually modified
 * (prevents re-hashing on unrelated updates like name changes).
 *
 * bcrypt cost factor 12: industry standard. Higher = slower to attack,
 * but also slower to hash. 12 takes ~300ms on modern hardware — acceptable
 * for login, annoying in bulk operations.
 */
userSchema.pre('save', async function (){
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

/**
 * Instance method: compare candidate password against stored hash
 * Using an instance method keeps this logic close to the model.
 * The service calls user.comparePassword(candidatePassword).
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;