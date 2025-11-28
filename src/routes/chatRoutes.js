import express from "express";
import { getMessages, createRoom } from "../controllers/chatController.js";

const router = express.Router();

router.get("/rooms/:roomId/messages", getMessages);
router.post("/rooms", createRoom);

export default router;
