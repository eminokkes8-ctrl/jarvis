import { callLLM } from "./llm.js";

// LLM'e gonderilecek transkript uzunlugu sinirlanir (uzun videolarda token/maliyet
// patlamasin ve ucretsiz katmanlarin (Gemini/Ollama) siniri asilmasin diye).
const MAX_TRANSCRIPT_CHARS = 12000;

const SUMMARY_SYSTEM_PROMPT = `Sana bir videonun basligi, kanali/kaynagi ve konusma
transkripti verilecek. Gorevin videoyu Turkce olarak analiz edip ozetlemek:
- Ana konuyu ve videoda anlatilanlarin ozetini 4-8 cumlede ver.
- Varsa onemli adimlari/noktalari madde madde degil, akici cumlelerle anlat.
- Transkript otomatik altyazi/konusma tanima ile geldigi icin hatali/eksik kelimeler
  olabilir, bunu belirtmene gerek yok, sadece anlami cikarmaya calis.
- Sesli okunacagi icin markdown/basliklar kullanma, duz metin yaz.`;

/**
 * Bir video/ses transkriptini LLM ile Turkce ozetler.
 * @param {{title: string, author?: string, transcript: string}} params
 * @returns {Promise<string>}
 */
export async function summarizeTranscript({ title, author, transcript }) {
  const trimmedTranscript =
    transcript.length > MAX_TRANSCRIPT_CHARS ? `${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}...` : transcript;

  return callLLM({
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Baslik: ${title}\nKanal/kaynak: ${author || "bilinmiyor"}\n\nTranskript:\n${trimmedTranscript}`,
      },
    ],
    maxTokens: 700,
  });
}
