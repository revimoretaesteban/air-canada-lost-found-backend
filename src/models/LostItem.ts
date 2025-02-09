import mongoose, { Schema, Document } from 'mongoose';

interface ImageInfo {
  url: string;
  publicId: string;
  thumbnailUrl?: string;
}

export interface ILostItem extends Document {
  itemName: string;
  description: string;
  location: string;
  category: string;
  status: 'pending' | 'delivered' | 'archived';
  images: ImageInfo[];
  foundBy: mongoose.Types.ObjectId;
  supervisor: mongoose.Types.ObjectId;
  customerInfo?: {
    name: string;
    email: string;
    phone: string;
    deliveryDate?: Date;
  };
  deliveredBy?: mongoose.Types.ObjectId;
  deliveredAt?: Date;
  flightNumber: string;
  dateFound: Date;
}

const LostItemSchema: Schema = new Schema({
  itemName: { type: String, required: true },
  description: { type: String, required: true },
  location: { type: String, required: true },
  category: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'delivered', 'archived'],
    default: 'pending'
  },
  images: [{
    url: String,
    publicId: String,
    thumbnailUrl: String
  }],
  foundBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  supervisor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  customerInfo: {
    name: String,
    email: String,
    phone: String,
    deliveryDate: Date
  },
  deliveredBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deliveredAt: Date,
  flightNumber: { type: String, required: true },
  dateFound: { type: Date, required: true }
}, {
  timestamps: true
});

// Ensure reportedBy is always populated
LostItemSchema.pre('find', function() {
  this.populate('reportedBy');
});

LostItemSchema.pre('findOne', function() {
  this.populate('reportedBy');
});

export default mongoose.model<ILostItem>('LostItem', LostItemSchema);
