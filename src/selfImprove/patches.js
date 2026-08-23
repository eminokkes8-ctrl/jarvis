import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { createPatch } from "diff";
import { callLLM } from "../lib/llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const PATCHES_PATH = path.join(DATA_DIR, "patches.json");

// Asistanin kod yamasi onerebilecegi TEK yer burasi: sadece bu klasorlerdeki,
// bu uzantilardaki dosyalar hedef olabilir. package.json/.env/data/ gibi
// bagimlilik ve gizli bilgi tasiyan dosyalar kasitli olarak disarida.
const ALLOWED_DIRS = ["src", "public"];
const ALLOWED_EXTENSIONS = new Set([".js", ".html", ".css"]);

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function loadPatches() {
  try {
    const raw = await readFile(PATCHES_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function savePatches(patches) {
  await ensureDataDir();
  await writeFile(PATCHES_PATH, JSON.stringify(patches, null, 2), "utf8");
}

/**
 * Verilen goreli yolun proje icinde, izinli klasor/uzantida ve path traversal
 * icermedigini dogrular. Gecersizse null doner.
 */
function resolveAllowedPath(relPath) {
  if (typeof relPath !== "string" || !relPath.trim()) return null;
  const normalized = path.normalize(relPath).replace(/^([/\\])+/, "");
  const resolved = path.resolve(PROJECT_ROOT, normalized);

  if (!resolved.startsWith(PROJECT_ROOT + path.sep)) return null;

  const topDir = normalized.split(path.sep)[0];
  if (!ALLOWED_DIRS.includes(topDir)) return null;
  if (!ALLOWED_EXTENSIONS.has(path.extname(resolved))) return null;

  return { resolved, normalized };
}

async function walk(dir, base, out) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      await walk(full, rel, out);
    } else if (ALLOWED_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(rel);
    }
  }
}

async function listEditableFiles() {
  const out = [];
  for (const dir of ALLOWED_DIRS) {
    await walk(path.join(PROJECT_ROOT, dir), dir, out);
  }
  return out;
}

/**
 * Bir gelistirme/duzeltme onerisi icin otomatik kod yamasi TASLAGI hazirlar.
 * Yama dogrudan uygulanmaz; data/patches.json icine "pending" olarak kaydedilir.
 * Gercek dosyaya yazma islemi SADECE applyPatch() ile, insan onayiyla yapilir.
 * @param {string} proposalText
 * @returns {Promise<object|null>} olusturulan yama kaydi, ya da guvenli bir yama cikarilamadiysa null
 */
export async function draftPatchForProposal(proposalText) {
  const files = await listEditableFiles();
  if (files.length === 0) return null;

  const pickRaw = await callLLM({
    system: `Sen bir kod duzenleme asistanisin. Sana bir gelistirme/duzeltme onerisi ve
duzenlenebilir dosyalarin listesi verilecek. Bu oneriyi uygulamak icin en uygun TEK dosyayi sec.
SADECE gecerli JSON dondur: {"targetFile": "yol/dosya.js"} ya da hicbir dosya uygun degilse
{"targetFile": null}.`,
    messages: [{ role: "user", content: `Oneri: ${proposalText}\n\nDosyalar:\n${files.join("\n")}` }],
    maxTokens: 200,
    background: true,
  });

  const pickMatch = pickRaw.match(/\{[\s\S]*\}/);
  if (!pickMatch) return null;
  const picked = JSON.parse(pickMatch[0]);
  if (!picked.targetFile) return null;

  const allowed = resolveAllowedPath(picked.targetFile);
  if (!allowed || !files.includes(allowed.normalized)) return null;

  const currentContent = await readFile(allowed.resolved, "utf8");

  const patchRaw = await callLLM({
    system: `Sen bir kod duzenleme asistanisin. Sana bir dosyanin GUNCEL icerigi ve bir
gelistirme/duzeltme onerisi verilecek. SADECE bu oneriyi uygulamak icin gerekli minimal
degisikligi yap; dosyanin geri kalanini oldugu gibi koru. Calismayi bozacak (kirici) veya
riskli (ornegin disariya veri gonderen, guvenlik kontrolu kaldiran) bir degisiklik YAPMA.
Emin degilsen degisiklik yapma.
SADECE gecerli JSON dondur: {"newContent": "dosyanin TAM yeni icerigi", "explanation": "kisa aciklama"}
Guvenli bir degisiklik yapamiyorsan: {"newContent": null, "explanation": "neden yapamadigin"}`,
    messages: [
      {
        role: "user",
        content: `Oneri: ${proposalText}\n\nDosya (${allowed.normalized}):\n\`\`\`\n${currentContent}\n\`\`\``,
      },
    ],
    maxTokens: 4000,
    background: true,
  });

  const patchMatch = patchRaw.match(/\{[\s\S]*\}/);
  if (!patchMatch) return null;
  const parsed = JSON.parse(patchMatch[0]);
  if (!parsed.newContent || typeof parsed.newContent !== "string") return null;
  if (parsed.newContent === currentContent) return null;

  const diffText = createPatch(allowed.normalized, currentContent, parsed.newContent);

  const patch = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending",
    targetFile: allowed.normalized,
    proposal: proposalText,
    explanation: parsed.explanation || "",
    newContent: parsed.newContent,
    diff: diffText,
    appliedAt: null,
  };

  const patches = await loadPatches();
  patches.push(patch);
  await savePatches(patches);
  return patch;
}

export async function listPatches() {
  return loadPatches();
}

/**
 * Onaylanan bir yamayi GERCEKTEN dosyaya yazar. Bu, bilerek sadece bu fonksiyonla
 * ve bir insanin acik onayiyla (UI'daki "Onayla ve Uygula" butonu) cagrilmalidir -
 * sesli komutla veya otomatik olarak cagrilmamalidir.
 * @param {string} id
 */
export async function applyPatch(id) {
  const patches = await loadPatches();
  const patch = patches.find((p) => p.id === id);
  if (!patch) throw new Error("Yama bulunamadi");
  if (patch.status !== "pending") throw new Error("Bu yama zaten islenmis");

  const allowed = resolveAllowedPath(patch.targetFile);
  if (!allowed) throw new Error("Hedef dosya izinli degil");

  await writeFile(allowed.resolved, patch.newContent, "utf8");
  patch.status = "applied";
  patch.appliedAt = new Date().toISOString();
  await savePatches(patches);
  return patch;
}

export async function rejectPatch(id) {
  const patches = await loadPatches();
  const patch = patches.find((p) => p.id === id);
  if (!patch) throw new Error("Yama bulunamadi");
  patch.status = "rejected";
  await savePatches(patches);
  return patch;
}
