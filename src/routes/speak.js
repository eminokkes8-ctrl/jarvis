import { Router } from "express";
import { synthesizeSpeech } from "../lib/openai.js";

export const speakRouter = Router();

speakRouter.post("/api/speak", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text alani zorunlu" });
    }
    const audioBuffer = await synthesizeSpeech(text);
    res.set("content-type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (err) {
    console.error("[speak]", err);
    res.status(502).json({ error: err.message });
  }
});
