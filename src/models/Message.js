import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true },

    senderId: { type: String, required: true },
    senderName: { type: String, required: true },

    recipientId: { type: String, default: null },

    text: { type: String, required: true },
    meta: { type: Object, default: {} },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Message", messageSchema);
