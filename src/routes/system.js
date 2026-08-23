import { Router } from "express";
import { openUrlInChrome, getSystemVolumePercent, setSystemVolumePercent } from "../lib/systemControl.js";

export const systemRouter = Router();

// Sunucunun CALISTIGI bilgisayarda gercek Chrome'u acar. Sadece yerel kullanim
// (npm start ile kendi bilgisayarinda calistirma) icin anlamlidir.
systemRouter.post("/api/system/open-youtube", async (req, res) => {
  try {
    const { query } = req.body || {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query alani zorunlu" });
    }
    // "results?search_query=" sadece arama listesi acar, video baslatmaz. "embed" +
    // listType=search + autoplay=1 ise dogrudan arama sonucunun ilk videosunu calan
    // bir oynatici sayfasi acar - kullaniciya tiklamasi gerekmez.
    const url = `https://www.youtube.com/embed?autoplay=1&listType=search&list=${encodeURIComponent(query)}`;
    await openUrlInChrome(url);
    res.json({ ok: true, url });
  } catch (err) {
    console.error("[system:open-youtube]", err);
    res.status(500).json({ error: err.message });
  }
});

// Sunucunun CALISTIGI bilgisayarin sistem ses seviyesini degistirir (sadece Windows).
// Ya kesin bir hedef ("percent": 0-100) ya da mevcut seviyeye gore bir fark
// ("delta": ornegin -10 ya da +30) kabul eder.
systemRouter.post("/api/system/volume", async (req, res) => {
  try {
    const { percent, delta } = req.body || {};
    let target;
    if (typeof percent === "number" && !Number.isNaN(percent)) {
      target = percent;
    } else if (typeof delta === "number" && !Number.isNaN(delta)) {
      const current = await getSystemVolumePercent();
      target = current + delta;
    } else {
      return res.status(400).json({ error: "percent ya da delta alani (sayi) zorunlu" });
    }
    const applied = await setSystemVolumePercent(target);
    res.json({ ok: true, percent: applied });
  } catch (err) {
    console.error("[system:volume]", err);
    res.status(500).json({ error: err.message });
  }
});
