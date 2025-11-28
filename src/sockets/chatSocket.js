import Message from "../models/Message.js";
import formatMessage from "../utils/formatMessage.js";
import { verifyToken } from "../services/authService.js";

/**
 * setupChatSocket(io, socket, env)
 */
export default function setupChatSocket(io, socket, env = process.env) {
  let user = { id: socket.id, name: "Guest" }; // por defecto

  // AUTH: client should emit "auth" with { token }
  socket.on("auth", async (payload) => {
    try {
      const authHeader = payload?.token || payload?.authToken || payload?.authorization;
      const u = await verifyToken(authHeader, env);
      if (u) {
        user = { id: u.id || u.userId || u.sub || socket.id, name: u.name || u.username || "User" };
        socket.data.user = user;
        socket.emit("auth:ok", { user });
      } else {
        socket.emit("auth:fail");
      }
    } catch (err) {
      console.error("auth error", err);
      socket.emit("auth:fail");
    }
  });

  // JOIN ROOM
  socket.on("joinRoom", async ({ roomId }) => {
    if (!roomId) return;
    socket.join(roomId);
    socket.to(roomId).emit("presence", { user, action: "joined" });

    // enviar historial reciente al que entra
    const recent = await Message.find({ roomId }).sort({ createdAt: -1 }).limit(30).lean();
    socket.emit("roomHistory", { roomId, messages: recent.reverse() });
  });

  // LEAVE ROOM
  socket.on("leaveRoom", ({ roomId }) => {
    if (!roomId) return;
    socket.leave(roomId);
    socket.to(roomId).emit("presence", { user, action: "left" });
  });

  // BROADCAST MESSAGE (roomId) or GLOBAL if no roomId
  socket.on("sendMessage", async ({ roomId, text, meta, recipientId }) => {
    if (!text || typeof text !== "string") return;

    const msgObj = formatMessage(user, text, meta);
    // persistir
    const doc = await Message.create({
      roomId: roomId || "global",
      senderId: msgObj.senderId,
      senderName: msgObj.senderName,
      recipientId: recipientId || null,
      text: msgObj.text,
      meta: msgObj.meta
    });

    if (recipientId) {
      // mensaje privado: emitir a sockets específicos si están conectados
      // intentamos encontrar sockets que tengan socket.data.user.id === recipientId
      for (const [id, s] of io.of("/").sockets) {
        if (s && s.data && s.data.user && (s.data.user.id === recipientId || id === recipientId)) {
          s.emit("receiveMessage", doc);
        }
      }
      // también notificar al emisor
      socket.emit("receiveMessage", doc);
    } else if (roomId) {
      io.to(roomId).emit("receiveMessage", doc);
    } else {
      // broadcast global
      io.emit("receiveMessage", doc);
    }
  });

  // TYPING INDICATOR
  socket.on("typing", ({ roomId, isTyping = true }) => {
    if (roomId) {
      socket.to(roomId).emit("typing", { user, isTyping });
    } else {
      socket.broadcast.emit("typing", { user, isTyping });
    }
  });

  // REQUEST ONLINE USERS for a room (simple approach)
  socket.on("getRoomUsers", (roomId, cb) => {
    try {
      const sockets = Array.from(io.in(roomId).sockets.keys());
      const users = sockets.map((sid) => {
        const s = io.of("/").sockets.get(sid);
        return (s && s.data && s.data.user) ? s.data.user : { id: sid, name: "Guest" };
      });
      if (typeof cb === "function") cb({ users });
    } catch (e) {
      if (typeof cb === "function") cb({ users: [] });
    }
  });

  socket.on("disconnect", (reason) => {
    // notificar a rooms
    const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    rooms.forEach((r) => {
      socket.to(r).emit("presence", { user, action: "left" });
    });
  });
}
