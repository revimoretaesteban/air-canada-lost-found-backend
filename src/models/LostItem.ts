import mongoose, { Schema, Document } from 'mongoose';

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

export interface ILostItem extends Document {
  itemName: string;
  description: string;
  location: string;
  category: string;
  status: 'pending' | 'onHand' | 'delivered' | 'archived';
  images: ImageInfo[];
  foundBy: mongoose.Types.ObjectId | UserInfo;
  supervisor: mongoose.Types.ObjectId | UserInfo;
  customerInfo?: {
    name: string;
    email: string;
    phone: string;
    deliveryDate?: Date;
  };
  deliveredBy?: mongoose.Types.ObjectId | UserInfo;
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
    enum: ['pending', 'onHand', 'delivered', 'archived'],
    default: 'onHand'
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

// Ensure user references are always populated
LostItemSchema.pre('find', function() {
  this.populate('foundBy', 'firstName lastName employeeNumber')
      .populate('supervisor', 'firstName lastName employeeNumber')
      .populate('deliveredBy', 'firstName lastName employeeNumber');
});

LostItemSchema.pre('findOne', function() {
  this.populate('foundBy', 'firstName lastName employeeNumber')
      .populate('supervisor', 'firstName lastName employeeNumber')
      .populate('deliveredBy', 'firstName lastName employeeNumber');
});

export default mongoose.model<ILostItem>('LostItem', LostItemSchema);
