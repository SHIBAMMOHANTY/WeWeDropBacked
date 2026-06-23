import mongoose, { Schema, Document } from 'mongoose';

export interface IPriceRule extends Document {
  screenDamageDeduction: number;
  batteryDeduction: number;
  cameraDeduction: number;
  fingerprintDeduction: number;
  faceIdDeduction: number;
  bodyDamageDeduction: number;
  speakerDeduction: number;
  chargingPortDeduction: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PriceRuleSchema = new Schema<IPriceRule>(
  {
    screenDamageDeduction: { type: Number, required: true, default: 0 },
    batteryDeduction: { type: Number, required: true, default: 0 },
    cameraDeduction: { type: Number, required: true, default: 0 },
    fingerprintDeduction: { type: Number, required: true, default: 0 },
    faceIdDeduction: { type: Number, required: true, default: 0 },
    bodyDamageDeduction: { type: Number, required: true, default: 0 },
    speakerDeduction: { type: Number, required: true, default: 0 },
    chargingPortDeduction: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

PriceRuleSchema.index({ isActive: 1 });

export const PriceRule =
  mongoose.models.PriceRule ||
  mongoose.model<IPriceRule>('PriceRule', PriceRuleSchema);
