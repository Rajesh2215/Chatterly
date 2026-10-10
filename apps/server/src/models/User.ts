import { Schema, model, Document } from 'mongoose';

export interface IUser {
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  statusText?: string;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    displayName: { type: String, required: true, trim: true },
    avatarUrl: { type: String },
    statusText: { type: String, default: 'Hey there! I am using Chatterly.' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const User = model<IUser>('User', userSchema);
