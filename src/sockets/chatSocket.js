// sockets/chatSocket.js
import Message from "../models/Message.js";
import formatMessage from "../utils/formatMessage.js";
import Meeting from "../models/Meeting.js";
import { verifyToken } from "../services/authService.js";

/**
 * setupChatSocket(io, socket, env)
 *
 * Responsabilidades:
 * - manejar join/leave rooms con username
 * - mantener socket.data.user = { id, name }
 * - emitir lista de participantes 'participants' a la sala
 * - manejar sendMessage/receiveMessage evitando duplicados
 * - manejar getRoomUsers (callback)
 * - manejar endMeeting (actualizar meeting con participantes)
 */
export default function setupChatSocket(io, socket, env = process.env) {
  // default user
  let user = { id: socket.id, name: "Guest" };

  // Helper: obtener lista de participantes actuales de una sala
  const getParticipantsForRoom = async (roomId) => {
    try {
      const sockets = await io.in(roomId).fetchSockets();
      return sockets
        .map((s) => (s?.data?.user ? { id: s.data.user.id, name: s.data.user.name } : { id: s.id, name: "Guest" }))
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  };

  // AUTH (opcional): cliente puede enviar token para setear user
  socket.on("auth", async (payload) => {
    try {
      const authHeader = payload?.token || payload?.authToken || payload?.authorization;
      const u = authHeader ? await verifyToken(authHeader, env) : null;
      if (u) {
        user = { id: u.id || u.userId || u.sub || socket.id, name: u.name || u.username || "User" };
        socket.data.user = user;
        socket.emit("auth:ok", { user });
      } else {
        // puede que el cliente envíe username en auth payload
        if (payload?.username) {
          user = { id: payload.id || socket.id, name: payload.username };
          socket.data.user = user;
          socket.emit("auth:ok", { user });
        } else {
          socket.emit("auth:fail");
        }
      }
    } catch (err) {
      console.error("auth error", err);
      socket.emit("auth:fail");
    }
  });

  // JOIN ROOM - espera { roomId, username? }
  socket.on("joinRoom", async ({ roomId, username, token } = {}) => {
    if (!roomId) return;
    // if token provided, try to verify and set user
    if (token && !socket.data.user) {
      try {
        const u = await verifyToken(token, env);
        if (u) {
          socket.data.user = { id: u.id || u.userId || u.sub || socket.id, name: u.name || u.username || "User" };
          user = socket.data.user;
        }
      } catch (e) {/* ignore */}
    }

    // if username provided explicitly, prefer it
    if (username) {
      socket.data.user = { id: socket.data.user?.id || socket.id, name: username };
      user = socket.data.user;
    } else if (!socket.data.user) {
      // keep default guest
      socket.data.user = user;
    }

    socket.join(roomId);
    console.log(`Socket ${socket.id} (${user.name}) joined room ${roomId}`);

    // persistir participante en Meeting (upsert)
    try {
      await Meeting.updateOne(
        { meetingId: roomId },
        {
          $setOnInsert: { meetingId: roomId, date: new Date(), createdAt: new Date() },
          $addToSet: { participants: { userId: socket.data.user.id, name: socket.data.user.name } }
        },
        { upsert: true }
      );
    } catch (err) {
      console.error("Error updating meeting participants on join:", err);
    }

    // enviar historial reciente solo a quien entra
    try {
      const recent = await Message.find({ roomId }).sort({ createdAt: -1 }).limit(50).lean();

      const normalized = recent.map(m => ({
        text: m.text,
        senderName: m.senderName || m.name || "Invitado",
        roomId: m.roomId,
        createdAt: m.createdAt
      }));

      socket.emit("roomHistory", { roomId, messages: normalized });

    } catch (e) {
      console.error("Error fetching room history", e);
    }

    // Notificar presencia a la sala
    const participants = await getParticipantsForRoom(roomId);
    io.to(roomId).emit("participants", participants);
    io.to(roomId).emit("presence", { user: socket.data.user, action: "joined" });
  });

  // LEAVE ROOM
  socket.on("leaveRoom", async ({ roomId } = {}) => {
    if (!roomId) return;
    socket.leave(roomId);
    const p = socket.data.user || { id: socket.id, name: "Guest" };
    io.to(roomId).emit("presence", { user: p, action: "left" });
    const participants = await getParticipantsForRoom(roomId);
    io.to(roomId).emit("participants", participants);
  });

  // GET ROOM USERS (callback style)
  socket.on("getRoomUsers", async (roomId, cb) => {
    try {
      const participants = await getParticipantsForRoom(roomId);
      if (typeof cb === "function") cb({ users: participants });
    } catch (err) {
      if (typeof cb === "function") cb({ users: [] });
    }
  });

  // SEND MESSAGE - incluir senderName y senderId en payload opcionalmente
  socket.on("sendMessage", async (payload = {}) => {
    const { roomId = "global", text = "", meta = {}, recipientId } = payload;
    if (!text || typeof text !== "string") return;

    // build message object with sender info
    const sender = socket.data.user || { id: socket.id, name: "Guest" };
    const msgObj = {
      roomId,
      senderId: sender.id,
      senderName: sender.name,
      text,
      meta,
      createdAt: new Date()
    };

    try {
      const doc = await Message.create(msgObj);
      // Emitir a la sala (o privado si recipientId)
      if (recipientId) {
        // emitir solo a sockets cuyo socket.data.user.id === recipientId
        for (const s of await io.in(roomId).fetchSockets()) {
          if (s && s.data && (s.data.user?.id === recipientId || s.id === recipientId)) {
            s.emit("receiveMessage", doc);
          }
        }
        // también notificar al emisor
        socket.emit("receiveMessage", doc);
      } else {
        io.to(roomId).emit("receiveMessage", doc);
      }
    } catch (err) {
      console.error("Error persisting message:", err);
    }
  });

  // TYPING
  socket.on("typing", ({ roomId, isTyping = true } = {}) => {
    if (!roomId) return;
    socket.to(roomId).emit("typing", { user: socket.data.user || { id: socket.id, name: "Guest" }, isTyping });
  });

  // END MEETING - actualiza duración y participantes actuales
  socket.on("endMeeting", async ({ meetingId, duration } = {}) => {
    if (!meetingId) return;
    try {
      const joinedSockets = await io.in(meetingId).fetchSockets();
      const participants = joinedSockets.map((s) => (s.data && s.data.user) ? { userId: s.data.user.id, name: s.data.user.name } : null).filter(Boolean);

      const meeting = await Meeting.findOneAndUpdate(
        { meetingId },
        { $set: { duration: duration || 0, date: new Date() }, $addToSet: { participants: { $each: participants } } },
        { upsert: true, new: true }
      );

      io.to(meetingId).emit("meetingEnded", { meeting });
    } catch (err) {
      console.error("Error ending meeting:", err);
    }
  });

  // DISCONNECT: notificar a rooms a los que pertenecía
  socket.on("disconnect", async (reason) => {
    try {
      const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
      const p = socket.data.user || { id: socket.id, name: "Guest" };
      for (const r of rooms) {
        io.to(r).emit("presence", { user: p, action: "left" });
        const participants = await getParticipantsForRoom(r);
        io.to(r).emit("participants", participants);
      }
    } catch (err) {
      console.error("Error handling disconnect:", err);
    }
  });
}
