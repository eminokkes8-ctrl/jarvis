import { Router } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMemory } from "../memory/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONA_PATH = path.resolve(__dirname, "../../data/persona.md");

export const stateRouter = Router();

// Frontend'deki "Ogrenilenler" panelini beslemek icin: hafiza + ogrenilen davranis notlari.
stateRouter.get("/api/state", async (_req, res) => {
  try {
    const memory = await loadMemory();
    let persona = "";
    try {
      persona = await readFile(PERSONA_PATH, "utf8");
    } catch {
      persona = "";
    }
    res.json({ memory, persona });
  } catch (err) {
    console.error("[state]", err);
    res.status(500).json({ error: err.message });
  }
});
