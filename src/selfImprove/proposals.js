import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callLLM } from "../lib/llm.js";
import { loadMemory } from "../memory/store.js";
import { draftPatchForProposal } from "./patches.js";

// Ucretsiz LLM katmanlarinin (ornegin Gemini) dakika basina istek siniri oldugu icin,
// bir "kendini gelistir" turunda en fazla bu kadar yama taslagi otomatik hazirlanir.
const MAX_AUTO_PATCH_DRAFTS = 1;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const PERSONA_PATH = path.join(DATA_DIR, "persona.md");
const PROPOSALS_PATH = path.join(DATA_DIR, "self_improvement_proposals.md");

const MAX_PERSONA_LINES = 25;

const REFLECT_SYSTEM_PROMPT = `Sen "Jarvis" adli sesli asistanin kendini gelistirme moduluysun.
Sana son konusma gecmisi ve asistanin su anki davranis notlari verilecek.
Iki tur oneri uret:

1. "personaUpdates": Asistanin SISTEM PROMPTUNA eklenebilecek, guvenli, kucuk davranis/ton ayarlari
   (ornek: "Kullanici teknik detay istemiyorsa daha sade konus"). Bunlar dogrudan uygulanacak,
   bu yuzden SADECE ton/uslup/tercih duzeyinde, zararsiz ve tersine cevrilebilir seyler oner.
2. "codeProposals": Asistanin KOD/OZELLIK duzeyinde nasil gelistirilebilecegine dair fikirler
   (ornek: "kesintisiz dinleme modu eklenebilir", "birden fazla dil icin otomatik algilama").
   Bunlar OTOMATIK UYGULANMAYACAK, sadece bir insanin gözden gecirmesi icin kaydedilecek.

SADECE gecerli JSON dondur:
{"personaUpdates": ["..."], "codeProposals": ["..."]}
Onerecek bir sey yoksa ilgili diziyi bos birak. Az ve ozlu oner (en fazla 3'er madde).`;

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readPersonaLines() {
  try {
    const text = await readFile(PERSONA_PATH, "utf8");
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function appendPersonaUpdates(updates) {
  if (!updates.length) return [];
  await ensureDataDir();
  const existing = await readPersonaLines();
  const existingSet = new Set(existing.map((l) => l.toLowerCase()));
  const added = [];
  for (const update of updates) {
    const line = `- ${update.trim()}`;
    if (update.trim() && !existingSet.has(line.toLowerCase())) {
      existing.push(line);
      existingSet.add(line.toLowerCase());
      added.push(update.trim());
    }
  }
  const trimmed = existing.slice(-MAX_PERSONA_LINES);
  const header = "# Ogrenilen davranis notlari (self-improvement tarafindan otomatik guncellenir)\n\n";
  await writeFile(PERSONA_PATH, header + trimmed.join("\n") + "\n", "utf8");
  return added;
}

async function appendCodeProposals(proposals) {
  if (!proposals.length) return;
  await ensureDataDir();
  const timestamp = new Date().toISOString();
  const entry = [
    `## ${timestamp}`,
    ...proposals.map((p) => `- [ ] ${p}`),
    "",
  ].join("\n");
  await appendFile(PROPOSALS_PATH, entry + "\n", "utf8");
}

/**
 * Son konusma gecmisini analiz eder; guvenli persona guncellemelerini otomatik uygular,
 * kod/ozellik onerilerini ise insan onayi icin dosyaya yazar (otomatik kod degisikligi yapmaz).
 * @param {{role: string, content: string}[]} history
 */
export async function reflectAndPropose(history) {
  const memory = await loadMemory();
  const transcript = (history || [])
    .slice(-20)
    .map((m) => `${m.role === "user" ? "Kullanici" : "Asistan"}: ${m.content}`)
    .join("\n");

  const raw = await callLLM({
    system: REFLECT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Konusma gecmisi:\n${transcript || "(bos)"}\n\nBilinen hafiza: ${JSON.stringify(memory)}`,
      },
    ],
    maxTokens: 500,
    background: true,
  });

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { appliedPersonaUpdates: [], queuedCodeProposals: 0 };
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const personaUpdates = Array.isArray(parsed.personaUpdates) ? parsed.personaUpdates : [];
  const codeProposals = Array.isArray(parsed.codeProposals) ? parsed.codeProposals : [];

  const applied = await appendPersonaUpdates(personaUpdates);
  await appendCodeProposals(codeProposals);

  // Kod onerileri icin otomatik yama TASLAGI hazirla (data/patches.json, status "pending").
  // Gercek dosyaya yazma islemi burada YAPILMAZ - insan onayi gerekir (bkz. patches.js).
  let draftedPatches = 0;
  for (const proposal of codeProposals.slice(0, MAX_AUTO_PATCH_DRAFTS)) {
    try {
      const patch = await draftPatchForProposal(proposal);
      if (patch) draftedPatches += 1;
    } catch (err) {
      console.error("[self-improve] yama taslagi olusturulamadi:", err.message);
    }
  }

  return { appliedPersonaUpdates: applied, queuedCodeProposals: codeProposals.length, draftedPatches };
}
