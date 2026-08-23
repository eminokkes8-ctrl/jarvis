import { Router } from "express";
import multer from "multer";
import { transcribeAudio } from "../lib/openai.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const transcribeRouter = Router();

transcribeRouter.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "audio dosyasi eksik" });
    }
    const text = await transcribeAudio(
      req.file.buffer,
      req.file.originalname || "audio.webm",
      req.file.mimetype || "audio/webm"
    );
    res.json({ text });
  } catch (err) {
    console.error("[transcribe]", err);
    res.status(502).json({ error: err.message });
  }
});
