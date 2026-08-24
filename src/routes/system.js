import { Router } from "express";
import {
  openUrl,
  openApp,
  findFirstYouTubeVideoUrl,
  getSystemVolumePercent,
  setSystemVolumePercent,
  pressMediaKey,
  getScreenBrightnessPercent,
  setScreenBrightnessPercent,
  takeScreenshot,
  powerAction,
} from "../lib/systemControl.js";

export const systemRouter = Router();

// Sunucunun CALISTIGI bilgisayarda gercek Chrome'u acar. Sadece yerel kullanim
// (npm start ile kendi bilgisayarinda calistirma) icin anlamlidir.
systemRouter.post("/api/system/open-youtube", async (req, res) => {
  try {
    const { query } = req.body || {};
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query alani zorunlu" });
    }
    // Once arama sonuclarindan GERCEK bir video bulup dogrudan /watch?v= acmayi
    // dene (en guvenilir yol - normal bir izleme sayfasi, YouTube'un kendi
    // otomatik oynatma davranisi calisir). Bulunamazsa embed?listType=search
    // hilesine geri dus.
    const directUrl = await findFirstYouTubeVideoUrl(query);
    const url = directUrl || `https://www.youtube.com/embed?autoplay=1&listType=search&list=${encodeURIComponent(query)}`;
    await openUrl(url);
    res.json({ ok: true, url });
  } catch (err) {
    console.error("[system:open-youtube]", err);
    res.status(500).json({ error: err.message });
  }
});

// Genel amacli web acma: google arama, vikipedi, whatsapp web. "site" secimine
// gore URL'i sunucu tarafinda insa eder (rastgele bir URL kabul edilmez).
systemRouter.post("/api/system/open-web", async (req, res) => {
  try {
    const { site, query } = req.body || {};
    let url;
    switch (site) {
      case "google":
        if (!query) return res.status(400).json({ error: "query alani zorunlu" });
        url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        break;
      case "wikipedia":
        url = query
          ? `https://tr.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}`
          : "https://tr.wikipedia.org";
        break;
      case "whatsapp":
        url = "https://web.whatsapp.com";
        break;
      case "youtube-music":
        url = "https://music.youtube.com";
        break;
      default:
        return res.status(400).json({ error: "site alani gecersiz (google/wikipedia/whatsapp/youtube-music)" });
    }
    await openUrl(url);
    res.json({ ok: true, url });
  } catch (err) {
    console.error("[system:open-web]", err);
    res.status(500).json({ error: err.message });
  }
});

// Bilinen bir masaustu uygulamasini adina gore acar (sadece Windows).
systemRouter.post("/api/system/open-app", async (req, res) => {
  try {
    const { app } = req.body || {};
    if (!app || typeof app !== "string") {
      return res.status(400).json({ error: "app alani zorunlu" });
    }
    await openApp(app);
    res.json({ ok: true, app });
  } catch (err) {
    console.error("[system:open-app]", err);
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

// Ekran parlakligi - ses seviyesiyle ayni kesin/bagil mantik (sadece Windows,
// cogunlukla dizustu dahili ekranlarda calisir).
systemRouter.post("/api/system/brightness", async (req, res) => {
  try {
    const { percent, delta } = req.body || {};
    let target;
    if (typeof percent === "number" && !Number.isNaN(percent)) {
      target = percent;
    } else if (typeof delta === "number" && !Number.isNaN(delta)) {
      const current = await getScreenBrightnessPercent();
      target = current + delta;
    } else {
      return res.status(400).json({ error: "percent ya da delta alani (sayi) zorunlu" });
    }
    const applied = await setScreenBrightnessPercent(target);
    res.json({ ok: true, percent: applied });
  } catch (err) {
    console.error("[system:brightness]", err);
    res.status(500).json({ error: err.message });
  }
});

// Medya tusu: oynat/duraklat, sonraki, onceki, durdur (sadece Windows).
systemRouter.post("/api/system/media", async (req, res) => {
  try {
    const { action } = req.body || {};
    if (!action) {
      return res.status(400).json({ error: "action alani zorunlu (playpause/next/previous/stop)" });
    }
    await pressMediaKey(action);
    res.json({ ok: true, action });
  } catch (err) {
    console.error("[system:media]", err);
    res.status(500).json({ error: err.message });
  }
});

// Ekran goruntusu alir, istege bagli olarak acar (sadece Windows).
systemRouter.post("/api/system/screenshot", async (req, res) => {
  try {
    const { open } = req.body || {};
    const path = await takeScreenshot({ open: Boolean(open) });
    res.json({ ok: true, path });
  } catch (err) {
    console.error("[system:screenshot]", err);
    res.status(500).json({ error: err.message });
  }
});

// Guc/oturum eylemleri: kilitle, kapat, yeniden baslat, uyku, iptal (sadece
// Windows). shutdown/restart 60 saniye gecikmeli ve "cancel" ile iptal edilebilir.
systemRouter.post("/api/system/power", async (req, res) => {
  try {
    const { action } = req.body || {};
    if (!action) {
      return res.status(400).json({ error: "action alani zorunlu (lock/shutdown/restart/hibernate/cancel)" });
    }
    await powerAction(action);
    res.json({ ok: true, action });
  } catch (err) {
    console.error("[system:power]", err);
    res.status(500).json({ error: err.message });
  }
});
