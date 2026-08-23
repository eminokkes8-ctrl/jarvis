const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const MAX_RETRIES = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 429 govde metninden Google'in onerdigi bekleme suresini (ms) cikarir, bulamazsa varsayilan doner. */
function parseRetryDelayMs(errText, fallbackMs) {
  try {
    const parsed = JSON.parse(errText);
    const retryInfo = parsed.error?.details?.find((d) =>
      String(d["@type"] || "").includes("RetryInfo")
    );
    const seconds = parseFloat(retryInfo?.retryDelay);
    if (!Number.isNaN(seconds)) return Math.ceil(seconds * 1000) + 500;
  } catch {
    // govde JSON degil ya da beklenen sekilde degil, varsayilani kullan
  }
  return fallbackMs;
}

/**
 * Google Gemini API'ye bir sohbet turu gonderir (Google AI Studio'nun ucretsiz katmani).
 * Ucretsiz katmanin dakika basina istek siniri oldugu icin, kota asimi (429) durumunda
 * Google'in onerdigi sureyi bekleyip birkac kez otomatik yeniden dener.
 * @param {{system?: string, messages: {role: "user"|"assistant", content: string}[], maxTokens?: number}} params
 * @returns {Promise<string>} modelin metin cevabi
 */
export async function callGemini({ system, messages, maxTokens = 1024 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY tanimli degil (.env dosyasina ekleyin - aistudio.google.com/apikey adresinden ucretsiz alinir)"
    );
  }

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${GEMINI_API_BASE}/${DEFAULT_MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Anahtari URL yerine header'da tasimak, olasi proxy/erisim loglarinda gorunmesini onler.
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      return parts
        .map((p) => p.text || "")
        .join("\n")
        .trim();
    }

    const errText = await res.text();

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const delayMs = parseRetryDelayMs(errText, 5000);
      console.warn(
        `[gemini] ucretsiz kota siniri asildi, ${delayMs}ms sonra tekrar denenecek (deneme ${attempt + 1}/${MAX_RETRIES})`
      );
      await sleep(delayMs);
      continue;
    }

    if (res.status === 429) {
      throw new Error(
        "Gemini ucretsiz kota siniri asildi (dakika basina istek limiti). Birkac saniye bekleyip tekrar dene."
      );
    }

    throw new Error(`Gemini API hatasi (${res.status}): ${errText}`);
  }

  throw new Error("Gemini API'ye ulasilamadi (bilinmeyen hata).");
}
