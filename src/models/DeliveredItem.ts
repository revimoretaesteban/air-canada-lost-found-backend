import mongoose, { Schema, Document } from 'mongoose';
import { ILostItem } from './LostItem';

interface ImageInfo {
  url: string;
  publicId: string;
  thumbnailUrl?: string;
}

export interface IDeliveredItem extends Document {
  itemName: string;
  description: string;
  location: string;
  category: string;
  images: ImageInfo[];
  foundBy: mongoose.Types.ObjectId;
  flightNumber: string;
  dateFound: Date;
  dateDelivered: Date;
  archived: boolean;
  customerInfo: {
    name: string;
    email: string;
    phone: string;
    deliveryDate?: Date;
  };
}

const DeliveredItemSchema: Schema = new Schema({
  itemName: { type: String, required: true },
  description: { type: String, required: true },
  location: { type: String, required: true },
  category: { type: String, required: true },
  images: [{
    url: String,
    publicId: String,
    thumbnailUrl: String
  }],
  foundBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  flightNumber: { type: String, required: true },
  dateFound: { type: Date, required: true },
  dateDelivered: { type: Date, required: true },
  archived: { type: Boolean, default: false },
  customerInfo: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    deliveryDate: Date
  }
}, {
  timestamps: true
});

// Ensure references are always populated
DeliveredItemSchema.pre('find', function() {
  this.populate('foundBy');
});

DeliveredItemSchema.pre('findOne', function() {
  this.populate('foundBy');
});

export default mongoose.model<IDeliveredItem>('DeliveredItem', DeliveredItemSchema);
