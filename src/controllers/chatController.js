import Message from "../models/Message.js";
import Room from "../models/Room.js";
import { StatusCodes } from "http-status-codes";

/**
 * GET /api/chat/rooms/:roomId/messages
 * Query: limit (default 50), before (ISO date string)
 */
export async function getMessages(req, res) {
  try {
    const { roomId } = req.params;
    const { limit = 50, before } = req.query;

    const q = { roomId };
    if (before) q.createdAt = { $lt: new Date(before) };

    const msgs = await Message.find(q)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 200))
      .lean();

    return res.status(StatusCodes.OK).json({ messages: msgs.reverse() });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Error al obtener mensajes" });
  }
}

export async function createRoom(req, res) {
  try {
    const { roomId, name, isPrivate } = req.body;
    if (!roomId) return res.status(StatusCodes.BAD_REQUEST).json({ error: "roomId requerido" });

    const room = await Room.findByIdAndUpdate(roomId, { name, isPrivate }, { upsert: true, new: true, setDefaultsOnInsert: true });
    return res.status(StatusCodes.CREATED).json({ room });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Error creando room" });
  }
}
