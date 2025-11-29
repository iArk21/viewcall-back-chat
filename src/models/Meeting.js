import mongoose from "mongoose";

const ParticipantSchema = new mongoose.Schema({
  userId: String,
  name: String,
}, { _id: false });

const MeetingSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    default: "",
  },
  date: {
    type: Date,
    default: Date.now,
  },
  duration: {
    type: Number, // duración en segundos
    default: 0,
  },
  participants: {
    type: [ParticipantSchema],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Meeting", MeetingSchema);
