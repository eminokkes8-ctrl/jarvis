const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

/** Anthropic'in sunucu tarafli web arama araci. Model gerekli gordugunde kendi tetikler. */
export function webSearchTool({ maxUses = 3 } = {}) {
  return { type: "web_search_20250305", name: "web_search", max_uses: maxUses };
}

/**
 * Claude Messages API'ye bir sohbet turu gonderir.
 * @param {{system?: string, messages: {role: "user"|"assistant", content: string}[], maxTokens?: number, tools?: object[]}} params
 * @returns {Promise<string>} asistanin metin cevabi
 */
export async function callClaude({ system, messages, maxTokens = 1024, tools }) {
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
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      system,
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
