import { Router } from "express";
import { listPatches, applyPatch, rejectPatch } from "../selfImprove/patches.js";

export const patchesRouter = Router();

// Asistanin kendi kendine hazirladigi kod yamalarinin listesi (pending/applied/rejected).
patchesRouter.get("/api/patches", async (_req, res) => {
  try {
    const patches = await listPatches();
    res.json({ patches });
  } catch (err) {
    console.error("[patches:list]", err);
    res.status(500).json({ error: err.message });
  }
});

// Bir yamayi GERCEKTEN dosyaya yazar. Bu ucu SADECE arayuzdeki acik "Onayla ve Uygula"
// tiklamasi cagirmali - sesli komuttan veya otomatik akistan asla tetiklenmemeli.
patchesRouter.post("/api/patches/:id/apply", async (req, res) => {
  try {
    const patch = await applyPatch(req.params.id);
    res.json({ patch });
  } catch (err) {
    console.error("[patches:apply]", err);
    res.status(400).json({ error: err.message });
  }
});

patchesRouter.post("/api/patches/:id/reject", async (req, res) => {
  try {
    const patch = await rejectPatch(req.params.id);
    res.json({ patch });
  } catch (err) {
    console.error("[patches:reject]", err);
    res.status(400).json({ error: err.message });
  }
});
