import Meeting from "../models/Meeting.js";

export const createMeeting = async (req, res) => {
  try {
    const { meetingId, duration } = req.body;

    const meeting = new Meeting({
      meetingId,
      duration,
    });

    await meeting.save();

    res.status(201).json({ message: "Meeting creada", meeting });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al crear la reunión" });
  }
};
