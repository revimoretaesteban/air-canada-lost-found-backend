import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPermission extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
}

const PermissionSchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, required: true }
});

export default mongoose.model<IPermission>('Permission', PermissionSchema);
