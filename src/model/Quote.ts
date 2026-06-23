import mongoose, { Schema, Document } from 'mongoose';

export interface IQuote extends Document {
  quoteNumber: string;
  userId: string;
  brand: string;
  model: string;
  storage: string;
  condition: 'excellent' | 'good' | 'average';
  screenCracked: boolean;
  batteryHealth: number;
  cameraIssue: boolean;
  fingerprintIssue: boolean;
  faceIdIssue: boolean;
  bodyDamage: boolean;
  speakerIssue: boolean;
  chargingPortIssue: boolean;
  estimatedPrice: number;
  finalPrice?: number;
  status: 'pending' | 'completed' | 'cancelled';
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

const QuoteSchema = new Schema<IQuote>(
  {
    quoteNumber: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    brand: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    storage: { type: String, required: true, trim: true },
    condition: {
      type: String,
      enum: ['excellent', 'good', 'average'],
      required: true,
      lowercase: true,
    },
    screenCracked: { type: Boolean, default: false },
    batteryHealth: { type: Number, default: 100 },
    cameraIssue: { type: Boolean, default: false },
    fingerprintIssue: { type: Boolean, default: false },
    faceIdIssue: { type: Boolean, default: false },
    bodyDamage: { type: Boolean, default: false },
    speakerIssue: { type: Boolean, default: false },
    chargingPortIssue: { type: Boolean, default: false },
    estimatedPrice: { type: Number, required: true },
    finalPrice: { type: Number },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    images: { type: [String], default: [] },
  },
  { timestamps: true }
);

// Performance indexes
QuoteSchema.index({ createdAt: -1 });
QuoteSchema.index({ userId: 1, status: 1 });

export const Quote =
  mongoose.models.Quote || mongoose.model<IQuote>('Quote', QuoteSchema);
