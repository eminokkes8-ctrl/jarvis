const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
// Varsayilan olarak ucuz bir model kullanilir. Sesli sohbet icin Haiku genelde yeterlidir;
// daha iyi kalite icin .env icinde CLAUDE_MODEL=claude-sonnet-5 yapilabilir (daha pahali).
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
// Hafiza cikarma / kendini gelistirme gibi GORUNMEZ arka plan cagrilari her zaman
// ucuz bir modelle yapilir - kullanicinin gormedigi bu cagrilar maliyeti gizlice
// katlamamali. Istege bagli olarak ayri bir modelle degistirilebilir.
export const BACKGROUND_MODEL = process.env.CLAUDE_BACKGROUND_MODEL || "claude-haiku-4-5-20251001";

/** Anthropic'in sunucu tarafli web arama araci. Model gerekli gordugunde kendi tetikler. */
export function webSearchTool({ maxUses = 3 } = {}) {
  return { type: "web_search_20250305", name: "web_search", max_uses: maxUses };
}

/**
 * Claude Messages API'ye bir sohbet turu gonderir.
 * @param {{system?: string, messages: {role: "user"|"assistant", content: string}[], maxTokens?: number, tools?: object[], model?: string}} params
 * @returns {Promise<string>} asistanin metin cevabi
 */
export async function callClaude({ system, messages, maxTokens = 1024, tools, model }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY tanimli degil (.env dosyasina ekleyin)");
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: maxTokens,
      // Sistem promptu ayni oturumda/sureclerde sik sik tekrarlandigi icin "ephemeral"
      // cache_control ile isaretlenir: Anthropic bunu tekrar tekrar tam fiyattan islemez,
      // token maliyetini belirgin sekilde dusurur.
      system: system ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] : undefined,
      messages,
      ...(tools ? { tools } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API hatasi (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
