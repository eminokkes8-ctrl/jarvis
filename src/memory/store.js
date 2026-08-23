import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const MEMORY_PATH = path.join(DATA_DIR, "memory.json");

const EMPTY_MEMORY = { facts: [], preferences: [], updatedAt: null };

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

/** @returns {Promise<{facts: string[], preferences: string[], updatedAt: string|null}>} */
export async function loadMemory() {
  try {
    const raw = await readFile(MEMORY_PATH, "utf8");
    return { ...EMPTY_MEMORY, ...JSON.parse(raw) };
  } catch (err) {
    if (err.code === "ENOENT") return { ...EMPTY_MEMORY };
    throw err;
  }
}

export async function saveMemory(memory) {
  await ensureDataDir();
  const toSave = { ...memory, updatedAt: new Date().toISOString() };
  await writeFile(MEMORY_PATH, JSON.stringify(toSave, null, 2), "utf8");
  return toSave;
}

/**
 * Yeni ogrenilen gercek/tercihleri mevcut hafizaya ekler (tekrarlari eler).
 * @param {{facts?: string[], preferences?: string[]}} additions
 */
export async function mergeMemory(additions) {
  const memory = await loadMemory();
  const mergeUnique = (existing, incoming = []) => {
    const set = new Set(existing.map((s) => s.trim().toLowerCase()));
    const merged = [...existing];
    for (const item of incoming) {
      const trimmed = item.trim();
      if (trimmed && !set.has(trimmed.toLowerCase())) {
        merged.push(trimmed);
        set.add(trimmed.toLowerCase());
      }
    }
    return merged;
  };

  const updated = {
    facts: mergeUnique(memory.facts, additions.facts),
    preferences: mergeUnique(memory.preferences, additions.preferences),
  };

  return saveMemory(updated);
}

/** Hafizayi Claude'a verilecek sistem promptu icin metne cevirir. */
export function memoryToPromptBlock(memory) {
  if (!memory || (memory.facts.length === 0 && memory.preferences.length === 0)) {
    return "";
  }
  const lines = [];
  if (memory.preferences.length) {
    lines.push("Kullanicinin bilinen tercihleri:");
    for (const p of memory.preferences) lines.push(`- ${p}`);
  }
  if (memory.facts.length) {
    lines.push("Kullanici hakkinda bilinen gercekler:");
    for (const f of memory.facts) lines.push(`- ${f}`);
  }
  return lines.join("\n");
}
