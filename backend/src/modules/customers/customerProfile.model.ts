import { Schema, model } from 'mongoose';

const customerProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    // Running totals of the stars drivers gave this rider.
    ratingCount: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const CustomerProfile = model('CustomerProfile', customerProfileSchema);
