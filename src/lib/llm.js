import { callClaude, webSearchTool, BACKGROUND_MODEL } from "./anthropic.js";
import { callGemini } from "./gemini.js";
import { callOllama } from "./ollama.js";
import { callOpenAIChat } from "./openai.js";

// Saglayici secimi: LLM_PROVIDER acikca "anthropic"/"ollama"/"openai"/"gemini" ise
// onu kullan. Aksi halde: GEMINI_API_KEY tanimliysa Gemini (ucretsiz, bulut); o da
// yoksa hicbir API anahtari GEREKTIRMEYEN yerel Ollama'ya dus (bilgisayarinda Ollama
// kurulu ve acik olmali). Yani hicbir .env ayari yapmadan da (API anahtarsiz) calisir.
function resolveProvider() {
  if (process.env.LLM_PROVIDER === "anthropic") return "anthropic";
  if (process.env.LLM_PROVIDER === "ollama") return "ollama";
  if (process.env.LLM_PROVIDER === "openai") return "openai";
  if (process.env.LLM_PROVIDER === "gemini") return "gemini";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "ollama";
}

export const LLM_PROVIDER = resolveProvider();

/** Web arama araci su an sadece Anthropic (Claude) saglayicisinda destekleniyor. */
export function llmSupportsWebSearch() {
  return LLM_PROVIDER === "anthropic";
}

/**
 * Saglayicidan bagimsiz sohbet cagrisi. `background: true`, Anthropic kullanilirken
 * gorunmez arka plan islerinin (hafiza, kendini gelistirme) ucuz modelle calismasini saglar;
 * Gemini/Ollama zaten ucretsiz oldugu icin bu ayrimi yapmaz.
 * @param {{system?: string, messages: {role: string, content: string}[], maxTokens?: number, background?: boolean, tools?: object[]}} params
 * @returns {Promise<string>}
 */
export async function callLLM({ system, messages, maxTokens, background = false, tools }) {
  if (LLM_PROVIDER === "gemini") {
    return callGemini({ system, messages, maxTokens });
  }
  if (LLM_PROVIDER === "ollama") {
    return callOllama({ system, messages, maxTokens });
  }
  if (LLM_PROVIDER === "openai") {
    return callOpenAIChat({ system, messages, maxTokens });
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
