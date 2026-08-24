import { Router } from "express";
import { callLLM } from "../lib/llm.js";
import { extractVideoId, getVideoTranscript } from "../lib/youtube.js";
import { learnFromTurn } from "../memory/extract.js";

export const youtubeRouter = Router();

// LLM'e gonderilecek transkript uzunlugu sinirlanir (uzun videolarda token/maliyet
// patlamasin ve ucretsiz katmanlarin (Gemini/Ollama) siniri asilmasin diye).
const MAX_TRANSCRIPT_CHARS = 12000;

const SUMMARY_SYSTEM_PROMPT = `Sana bir YouTube videosunun basligi, kanali ve altyazi
transkripti verilecek. Gorevin videoyu Turkce olarak analiz edip ozetlemek:
- Ana konuyu ve videoda anlatilanlarin ozetini 4-8 cumlede ver.
- Varsa onemli adimlari/noktalari madde madde degil, akici cumlelerle anlat.
- Transkript otomatik altyazidan geldigi icin hatali/eksik kelimeler olabilir, bunu
  belirtmene gerek yok, sadece anlami cikarmaya calis.
- Sesli okunacagi icin markdown/basliklar kullanma, duz metin yaz.`;

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
          "metni kopyalayip manualTranscript alaniyla tekrar gonderebilirsin.",
        title,
        author,
        needsManualTranscript: true,
      });
    }

    const trimmedTranscript =
      transcript.length > MAX_TRANSCRIPT_CHARS
        ? `${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}...`
        : transcript;

    const summary = await callLLM({
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Video basligi: ${title}\nKanal: ${author}\n\nTranskript:\n${trimmedTranscript}`,
        },
      ],
      maxTokens: 700,
    });

    learnFromTurn(`"${title}" adli YouTube videosunu izledim/ozetlettim.`, summary).catch((err) =>
      console.error("[youtube] hafiza guncelleme hatasi", err)
    );

    res.json({ title, author, summary });
  } catch (err) {
    console.error("[youtube:summarize]", err);
    res.status(500).json({ error: err.message });
  }
});
