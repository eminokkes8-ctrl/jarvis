import { callClaude, BACKGROUND_MODEL } from "../lib/anthropic.js";
import { mergeMemory } from "./store.js";

const EXTRACT_SYSTEM_PROMPT = `Sen bir sesli asistanin hafiza modulusun. Sana bir kullanici mesaji ve asistan cevabi verilecek.
Gorevin: bu turdan, ILERIDE hatirlanmaya deger, KALICI bilgi varsa cikarmak.
Sadece kalici tercihleri (ornegin: kisa cevap istemek, belirli bir dilde konusmak, ilgi alanlari) ve
kalici gercekleri (ornegin: isim, meslek, sehir, tekrar eden ihtiyaclar) cikar.
Gecici, o ana ozgu seyleri (hava durumu sorusu, tek seferlik bir hesaplama) cikarma.
SADECE gecerli JSON dondur, baska hicbir metin ekleme. Format:
{"facts": ["..."], "preferences": ["..."]}
Yeni bir sey yoksa ikisini de bos dizi olarak dondur.`;

/**
 * Bir konusma turundan kalici bilgi cikarip hafizaya ekler. Basarisiz olursa sessizce yutar
 * (sohbet akisini bozmamak icin) ama hatayi konsola loglar.
 * @param {string} userText
 * @param {string} assistantText
 */
export async function learnFromTurn(userText, assistantText) {
  try {
    const raw = await callClaude({
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Kullanici: ${userText}\nAsistan: ${assistantText}`,
        },
      ],
      maxTokens: 300,
      model: BACKGROUND_MODEL,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const facts = Array.isArray(parsed.facts) ? parsed.facts : [];
    const preferences = Array.isArray(parsed.preferences) ? parsed.preferences : [];

    if (facts.length === 0 && preferences.length === 0) return null;

    return mergeMemory({ facts, preferences });
  } catch (err) {
    console.error("[memory] ogrenme adimi basarisiz oldu:", err.message);
    return null;
  }
}
