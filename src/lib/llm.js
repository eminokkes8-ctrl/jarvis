import { callClaude, webSearchTool, BACKGROUND_MODEL } from "./anthropic.js";
import { callGemini } from "./gemini.js";

// Varsayilan olarak Google Gemini kullanilir (Google AI Studio ucretsiz katmani,
// kredi karti gerekmez). Claude'a (Anthropic, ucretli) gecmek icin .env icinde
// LLM_PROVIDER=anthropic yapilabilir.
export const LLM_PROVIDER = process.env.LLM_PROVIDER === "anthropic" ? "anthropic" : "gemini";

/** Web arama araci su an sadece Anthropic (Claude) saglayicisinda destekleniyor. */
export function llmSupportsWebSearch() {
  return LLM_PROVIDER === "anthropic";
}

/**
 * Saglayicidan bagimsiz sohbet cagrisi. `background: true`, Anthropic kullanilirken
 * gorunmez arka plan islerinin (hafiza, kendini gelistirme) ucuz modelle calismasini saglar;
 * Gemini zaten ucretsiz oldugu icin bu ayrimi yapmaz.
 * @param {{system?: string, messages: {role: string, content: string}[], maxTokens?: number, background?: boolean, tools?: object[]}} params
 * @returns {Promise<string>}
 */
export async function callLLM({ system, messages, maxTokens, background = false, tools }) {
  if (LLM_PROVIDER === "gemini") {
    return callGemini({ system, messages, maxTokens });
  }
  return callClaude({
    system,
    messages,
    maxTokens,
    model: background ? BACKGROUND_MODEL : undefined,
    tools,
  });
}

export { webSearchTool };
