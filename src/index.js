import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import chatRoutes from "./routes/chatRoutes.js";
import { connectDB } from "./config/db.js";
import setupChatSocket from "./sockets/chatSocket.js";
import rateLimit from "express-rate-limit";

dotenv.config();
console.log("🔍 ENV LOADED:", {
    PORT: process.env.PORT,
    MONGO_URI: process.env.MONGO_URI ? "OK" : "NOT FOUND",
    JWT_SECRET: process.env.JWT_SECRET ? "OK" : "NOT FOUND",
  });
  
const env = process.env;

const app = express();
app.use(cors({ origin: env.ALLOW_ORIGIN || "*" }));
app.use(express.json());

// rate limiter
const limiter = rateLimit({
  windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS || "60000"),
  max: parseInt(env.RATE_LIMIT_MAX || "300"),
});
app.use(limiter);

// rutas REST
app.use("/api/chat", chatRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: env.ALLOW_ORIGIN || "*", methods: ["GET", "POST"] }
});

io.on("connection", (socket) => {
  console.log("Socket conectado:", socket.id);
  setupChatSocket(io, socket, env);
});

// levantar DB y servidor
(async function start() {
  await connectDB(env.MONGO_URI || "mongodb://localhost:27017/viewcall_chat");
  const port = env.PORT || 4002;
  server.listen(port, () => console.log(`Chat backend escuchando en :${port}`));
})();
