import { Router } from "express";
import { reflectAndPropose } from "../selfImprove/proposals.js";

export const selfImproveRouter = Router();

// Kendi kendini gelistirme: konusma gecmisini analiz eder.
// Guvenli davranis/ton ayarlarini otomatik uygular; kod/ozellik onerilerini
// insan onayi icin data/self_improvement_proposals.md dosyasina yazar (otomatik kod degisikligi YOK).
selfImproveRouter.post("/api/self-improve", async (req, res) => {
  try {
    const { history } = req.body || {};
    const result = await reflectAndPropose(Array.isArray(history) ? history : []);
    res.json(result);
  } catch (err) {
    console.error("[self-improve]", err);
    res.status(502).json({ error: err.message });
  }
});
