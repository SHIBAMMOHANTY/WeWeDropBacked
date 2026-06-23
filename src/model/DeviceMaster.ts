import mongoose, { Schema, Document } from 'mongoose';

export interface IDeviceMaster extends Document {
  brand: string;
  model: string;
  storage: string;
  launchPrice: number;
  launchDate?: string;
  basePriceExcellent: number;
  basePriceGood: number;
  basePriceAverage: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceMasterSchema = new Schema<IDeviceMaster>(
  {
    brand: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    storage: { type: String, required: true, trim: true },
    launchPrice: { type: Number, required: true },
    launchDate: { type: String, trim: true },
    basePriceExcellent: { type: Number, required: true },
    basePriceGood: { type: Number, required: true },
    basePriceAverage: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Optimize query performance with indexes
DeviceMasterSchema.index({ brand: 1, model: 1, storage: 1 }, { unique: true });
DeviceMasterSchema.index({ isActive: 1 });

export const DeviceMaster =
  mongoose.models.DeviceMaster ||
  mongoose.model<IDeviceMaster>('DeviceMaster', DeviceMasterSchema);
