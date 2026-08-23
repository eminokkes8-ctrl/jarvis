import { Router } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callClaude } from "../lib/anthropic.js";
import { loadMemory, memoryToPromptBlock } from "../memory/store.js";
import { learnFromTurn } from "../memory/extract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONA_PATH = path.resolve(__dirname, "../../data/persona.md");

const BASE_SYSTEM_PROMPT = `Sen "Jarvis" adinda, sesli konusan bir yapay zeka asistanisin.
Cevaplarin sesli olarak okunacak: kisa, dogal, konusma diline uygun cumleler kur.
Madde isaretleri, basliklar veya markdown kullanma; duz konusma metni yaz.
Turkce konusuluyorsa Turkce, baska dilde konusuluyorsa o dilde cevap ver.`;

async function loadPersonaAddendum() {
  try {
    const text = await readFile(PERSONA_PATH, "utf8");
    return text.trim();
  } catch {
    return "";
  }
}

async function buildSystemPrompt() {
  const [memory, persona] = await Promise.all([loadMemory(), loadPersonaAddendum()]);
  const memoryBlock = memoryToPromptBlock(memory);
  return [BASE_SYSTEM_PROMPT, persona, memoryBlock].filter(Boolean).join("\n\n");
}

export const chatRouter = Router();

chatRouter.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "message alani zorunlu" });
    }

    const priorMessages = Array.isArray(history)
      ? history
          .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
          .slice(-20)
      : [];

    const system = await buildSystemPrompt();
    const messages = [...priorMessages, { role: "user", content: message }];

    const reply = await callClaude({ system, messages });

    // Hafiza guncellemesini arka planda yap, kullaniciyi bekletme.
    learnFromTurn(message, reply).catch((err) => console.error("[memory] beklenmeyen hata", err));

    res.json({ reply });
  } catch (err) {
    console.error("[chat]", err);
    res.status(502).json({ error: err.message });
  }
});
