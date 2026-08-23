import "dotenv/config";
import express from "express";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { transcribeRouter } from "./routes/transcribe.js";
import { chatRouter } from "./routes/chat.js";
import { speakRouter } from "./routes/speak.js";
import { selfImproveRouter } from "./routes/selfImprove.js";
import { stateRouter } from "./routes/state.js";
import { patchesRouter } from "./routes/patches.js";
import { systemRouter } from "./routes/system.js";
import { LLM_PROVIDER } from "./lib/llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));

app.use(transcribeRouter);
app.use(chatRouter);
app.use(speakRouter);
app.use(selfImproveRouter);
app.use(stateRouter);
app.use(patchesRouter);
app.use(systemRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    llmProvider: LLM_PROVIDER,
    platform: os.platform(),
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
  });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Jarvis sesli asistan http://localhost:${PORT} adresinde calisiyor`);
});
