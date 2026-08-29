const DEFAULT_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
// Hermes 3 (Nous Research), guclu fonksiyon-cagirma/agent yetenekleriyle bilinen acik
// kaynak bir model - varsayilan olarak secildi (genel llama3.1'e gore talimat takibi
// daha iyi, ileride LLM'in dogrudan komut/tool secmesine gecilirse de hazir olur).
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "hermes3";

/**
 * Yerel Ollama sunucusuna (bilgisayarinda calisan, API anahtari GEREKTIRMEYEN)
 * bir sohbet turu gonderir. Ollama kurulu ve `ollama serve` calisir durumda
 * olmalidir (Ollama uygulamasi acikken bu zaten otomatik calisir).
 * @param {{system?: string, messages: {role: "user"|"assistant", content: string}[], maxTokens?: number}} params
 * @returns {Promise<string>} modelin metin cevabi
 */
export async function callOllama({ system, messages, maxTokens = 1024 }) {
  const chatMessages = [];
  if (system) chatMessages.push({ role: "system", content: system });
  for (const m of messages) {
    chatMessages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  }

  let res;
  try {
    res = await fetch(`${DEFAULT_HOST}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: chatMessages,
        stream: false,
        options: { num_predict: maxTokens },
      }),
    });
  } catch (err) {
    throw new Error(
      `Ollama'ya baglanilamadi (${DEFAULT_HOST}). Ollama uygulamasinin acik oldugundan ve ` +
        `"${DEFAULT_MODEL}" modelinin indirildiginden emin ol (terminalde: ollama run ${DEFAULT_MODEL}). Detay: ${err.message}`
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama API hatasi (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return (data.message?.content || "").trim();
}
