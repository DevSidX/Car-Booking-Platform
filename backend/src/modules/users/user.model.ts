import { Schema, model } from 'mongoose';
import { AccountStatuses, Roles } from '../../common/enums';

const userSchema = new Schema(
  {
    role: { type: String, enum: Roles, required: true },
    // E.164, normalised. Unique across all roles (one account per phone).
    phone: { type: String, required: true, unique: true },
    name: { type: String, trim: true, maxlength: 100 },
    accountStatus: { type: String, enum: AccountStatuses, default: 'ACTIVE', required: true },
    phoneVerifiedAt: { type: Date },
  },
  { timestamps: true },
);

// Admin user search: filter by role / status, newest first.
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ accountStatus: 1, createdAt: -1 });

export const User = model('User', userSchema);
