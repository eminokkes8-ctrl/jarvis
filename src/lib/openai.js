const OPENAI_API_BASE = "https://api.openai.com/v1";

function requireApiKey() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY tanimli degil (.env dosyasina ekleyin)");
  }
  return apiKey;
}

/**
 * Ses dosyasini (Buffer) OpenAI Whisper ile metne cevirir.
 * @param {Buffer} audioBuffer
 * @param {string} filename
 * @param {string} mimeType
 * @returns {Promise<string>}
 */
export async function transcribeAudio(audioBuffer, filename, mimeType) {
  const apiKey = requireApiKey();

  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: mimeType }), filename);
  form.append("model", "whisper-1");

  const res = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whisper API hatasi (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.text;
}

/**
 * Metni sese cevirir, mp3 Buffer doner.
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
export async function synthesizeSpeech(text) {
  const apiKey = requireApiKey();
  const voice = process.env.TTS_VOICE || "alloy";

  const res = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice,
      input: text,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`TTS API hatasi (${res.status}): ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
