const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/**
 * Google Gemini API'ye bir sohbet turu gonderir (Google AI Studio'nun ucretsiz katmani).
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

  const res = await fetch(`${GEMINI_API_BASE}/${DEFAULT_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // Anahtari URL yerine header'da tasimak, olasi proxy/erisim loglarinda gorunmesini onler.
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API hatasi (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => p.text || "")
    .join("\n")
    .trim();
}
