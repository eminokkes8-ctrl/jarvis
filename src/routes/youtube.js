import { Router } from "express";
import multer from "multer";
import { extractVideoId, getVideoTranscript } from "../lib/youtube.js";
import { summarizeTranscript } from "../lib/summarize.js";
import { transcribeAudio } from "../lib/openai.js";
import { learnFromTurn } from "../memory/extract.js";

export const youtubeRouter = Router();

// Whisper API'nin kendi sinirina denk gelir (25MB) - yuklenen ses/video dosyasi icin.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

youtubeRouter.post("/api/youtube/summarize", async (req, res) => {
  try {
    const { url, manualTranscript } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url alani zorunlu" });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: "Gecerli bir YouTube linki/ID'si degil" });
    }

    let title;
    let author;
    let transcript;

    if (typeof manualTranscript === "string" && manualTranscript.trim().length > 20) {
      transcript = manualTranscript.trim();
      title = "Yapistirilan transkript";
      author = "";
    } else {
      const info = await getVideoTranscript(videoId);
      title = info.title;
      author = info.author;
      transcript = info.transcript;
    }

    if (!transcript) {
      return res.status(422).json({
        error:
          "Bu videonun altyazisini otomatik olarak alamadim (YouTube bazi sunuculardan altyazi " +
          "indirmeyi engelliyor). YouTube'da videonun altinda '...' > 'Transkripti goster' ile " +
          "metni kopyalayip manualTranscript alaniyla tekrar gonderebilirsin, ya da video dosyasini " +
          "dogrudan yukleyip gercek ses transkripti cikartabilirsin.",
        title,
        author,
        needsManualTranscript: true,
      });
    }

    const summary = await summarizeTranscript({ title, author, transcript });

    learnFromTurn(`"${title}" adli YouTube videosunu izledim/ozetlettim.`, summary).catch((err) =>
      console.error("[youtube] hafiza guncelleme hatasi", err)
    );

    res.json({ title, author, summary });
  } catch (err) {
    console.error("[youtube:summarize]", err);
    res.status(500).json({ error: err.message });
  }
});

// Kullanicinin dogrudan yukledigi bir ses/video dosyasini GERCEKTEN dinler: Whisper ile
// konusmayi metne cevirir, sonra ayni sekilde ozetler. Alttaki altyazi-cekme yonteminin
// aksine bu, YouTube'un altyazi korumasina takilmaz ama OPENAI_API_KEY (ucretli Whisper)
// gerektirir - bunun disinda ucretsiz bir "gercek ses anlama" yolu yok.
youtubeRouter.post("/api/youtube/summarize-upload", upload.single("media"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "media dosyasi eksik" });
    }

    const title = req.file.originalname || "Yuklenen dosya";
    const transcript = await transcribeAudio(
      req.file.buffer,
      req.file.originalname || "media.mp4",
      req.file.mimetype || "video/mp4"
    );

    if (!transcript || transcript.trim().length < 5) {
      return res.status(422).json({ error: "Dosyada anlasilir bir konusma bulamadim." });
    }

    const summary = await summarizeTranscript({ title, author: "", transcript });

    learnFromTurn(`"${title}" adli yukledigim video/ses dosyasini dinletip ozetlettim.`, summary).catch((err) =>
      console.error("[youtube] hafiza guncelleme hatasi", err)
    );

    res.json({ title, author: "", summary });
  } catch (err) {
    console.error("[youtube:summarize-upload]", err);
    res.status(502).json({ error: err.message });
  }
});
