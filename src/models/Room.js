import mongoose from "mongoose";

const RoomSchema = new mongoose.Schema({
  _id: { type: String }, // usar roomId como _id
  name: { type: String },
  isPrivate: { type: Boolean, default: false },
  meta: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Room", RoomSchema);
