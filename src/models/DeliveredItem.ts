import mongoose, { Schema, Document } from 'mongoose';
import { ILostItem } from './LostItem';

interface ImageInfo {
  url: string;
  publicId: string;
  thumbnailUrl?: string;
}

interface UserInfo {
  _id: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  employeeNumber: string;
}

export interface IDeliveredItem extends Document {
  itemName: string;
  description: string;
  location: string;
  category: string;
  images: ImageInfo[];
  foundBy: mongoose.Types.ObjectId | UserInfo;
  deliveredBy?: mongoose.Types.ObjectId | UserInfo;
  flightNumber: string;
  dateFound: Date;
  dateDelivered: Date;
  archived: boolean;
  customerInfo: {
    name: string;
    email: string;
    phone: string;
    identification: string;
    signature: string;
  };
  deliveryNotes?: string;
  deliveryPhotos?: ImageInfo[];
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
  deliveredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  flightNumber: { type: String, required: true },
  dateFound: { type: Date, required: true },
  dateDelivered: { type: Date, required: true },
  archived: { type: Boolean, default: false },
  customerInfo: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    identification: { type: String, required: true },
    signature: { type: String, required: true }
  },
  deliveryNotes: String,
  deliveryPhotos: [{
    url: String,
    publicId: String,
    thumbnailUrl: String
  }]
}, {
  timestamps: true
});

// Ensure references are always populated
DeliveredItemSchema.pre('find', function() {
  this.populate('foundBy');
  this.populate('deliveredBy');
});

DeliveredItemSchema.pre('findOne', function() {
  this.populate('foundBy');
  this.populate('deliveredBy');
});

export default mongoose.model<IDeliveredItem>('DeliveredItem', DeliveredItemSchema);
