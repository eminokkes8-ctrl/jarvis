const conversationEl = document.getElementById("conversation");
const micButton = document.getElementById("mic-button");
const micLabel = document.getElementById("mic-label");
const improveButton = document.getElementById("improve-button");
const statusDot = document.getElementById("status-dot");
const learnedContent = document.getElementById("learned-content");
const patchesContent = document.getElementById("patches-content");
const ttsAudio = document.getElementById("tts-audio");

// Bu ifadeler soylenince asistan otomatik olarak kendini gelistirme analizini baslatir.
// Kasitli olarak dar tutuldu: normal sohbeti yanlislikla tetiklememeli.
const SELF_IMPROVE_EXACT_TRIGGERS = new Set(["basla", "hadi basla", "haydi basla"]);
const SELF_IMPROVE_CONTAINS_TRIGGERS = [
  "kendini gelistir",
  "kendini gelistirmeye basla",
  "kendini gelistirmeye baslar misin",
  "ogrenmeye basla",
  "hatalarini duzelt",
  "kendi kendini duzelt",
];

function normalizeCommand(text) {
  return text
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function isSelfImproveCommand(text) {
  const norm = normalizeCommand(text);
  if (SELF_IMPROVE_EXACT_TRIGGERS.has(norm)) return true;
  return SELF_IMPROVE_CONTAINS_TRIGGERS.some((t) => norm.includes(t));
}

// Ses motoru: "browser" (Web Speech API, ucretsiz, API anahtari gerekmez, Chrome/Edge onerilir)
// ya da "openai" (Whisper + TTS, ucretli, .env icinde OPENAI_API_KEY gerekir).
const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
const browserSpeechSupported = Boolean(SpeechRecognitionImpl && window.speechSynthesis);
let voiceEngine = localStorage.getItem("voiceEngine") || (browserSpeechSupported ? "browser" : "openai");

let recognition = null;
if (SpeechRecognitionImpl) {
  recognition = new SpeechRecognitionImpl();
  recognition.lang = "tr-TR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
}

let cachedVoices = [];
function refreshVoiceCache() {
  if (window.speechSynthesis) cachedVoices = window.speechSynthesis.getVoices();
}
if (window.speechSynthesis) {
  refreshVoiceCache();
  window.speechSynthesis.onvoiceschanged = refreshVoiceCache;
}

/** @type {{role: "user"|"assistant", content: string}[]} */
let history = [];
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let isBusy = false;

function addBubble(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  conversationEl.appendChild(bubble);
  conversationEl.scrollTop = conversationEl.scrollHeight;
  return bubble;
}

function setBusy(busy) {
  isBusy = busy;
  micButton.disabled = busy && !isRecording;
  improveButton.disabled = busy;
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    const needsOpenAI = voiceEngine === "openai";
    if (data.ok && data.anthropicConfigured && (!needsOpenAI || data.openaiConfigured)) {
      statusDot.className = "status-dot ok";
      statusDot.title = "Baglanti hazir";
    } else {
      statusDot.className = "status-dot error";
      const missing = [];
      if (!data.anthropicConfigured) missing.push("ANTHROPIC_API_KEY");
      if (needsOpenAI && !data.openaiConfigured) missing.push("OPENAI_API_KEY");
      statusDot.title = missing.length ? `Eksik: ${missing.join(", ")}` : "Sunucu hatasi";
    }
  } catch {
    statusDot.className = "status-dot error";
    statusDot.title = "Sunucuya ulasilamiyor";
  }
}

async function refreshLearnedPanel() {
  try {
    const res = await fetch("/api/state");
    const data = await res.json();
    const lines = [];
    if (data.memory?.preferences?.length) {
      lines.push("Tercihler:");
      lines.push(...data.memory.preferences.map((p) => `  - ${p}`));
    }
    if (data.memory?.facts?.length) {
      lines.push("Gercekler:");
      lines.push(...data.memory.facts.map((f) => `  - ${f}`));
    }
    learnedContent.textContent = lines.length ? lines.join("\n") : "Henuz bir sey ogrenilmedi.";
  } catch {
    // sessizce gec
  }
}

function renderPatch(patch) {
  const wrapper = document.createElement("div");
  wrapper.className = "patch-card";

  const title = document.createElement("div");
  title.className = "patch-title";
  title.textContent = `${patch.targetFile} - ${patch.explanation || patch.proposal}`;
  wrapper.appendChild(title);

  const diffPre = document.createElement("pre");
  diffPre.className = "patch-diff";
  diffPre.textContent = patch.diff;
  wrapper.appendChild(diffPre);

  if (patch.status === "pending") {
    const actions = document.createElement("div");
    actions.className = "patch-actions";

    const applyBtn = document.createElement("button");
    applyBtn.className = "ghost-button";
    applyBtn.textContent = "Onayla ve Uygula";
    applyBtn.addEventListener("click", () => decidePatch(patch.id, "apply"));

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "ghost-button";
    rejectBtn.textContent = "Reddet";
    rejectBtn.addEventListener("click", () => decidePatch(patch.id, "reject"));

    actions.appendChild(applyBtn);
    actions.appendChild(rejectBtn);
    wrapper.appendChild(actions);
  } else {
    const statusEl = document.createElement("div");
    statusEl.className = "patch-status";
    statusEl.textContent = patch.status === "applied" ? "Uygulandi" : "Reddedildi";
    wrapper.appendChild(statusEl);
  }

  return wrapper;
}

async function refreshPatchesPanel() {
  if (!patchesContent) return;
  try {
    const res = await fetch("/api/patches");
    const data = await res.json();
    const pending = (data.patches || []).filter((p) => p.status === "pending");
    patchesContent.innerHTML = "";
    if (pending.length === 0) {
      patchesContent.textContent = "Bekleyen kod yamasi yok.";
      return;
    }
    for (const patch of pending) {
      patchesContent.appendChild(renderPatch(patch));
    }
  } catch {
    // sessizce gec
  }
}

async function decidePatch(id, action) {
  try {
    const res = await fetch(`/api/patches/${id}/${action}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Islem basarisiz");
    addBubble(
      "system",
      action === "apply"
        ? `Yama uygulandi: ${data.patch.targetFile}. Degisikligin etkin olmasi icin sunucuyu yeniden baslatman gerekebilir (npm run dev canli yeniler).`
        : `Yama reddedildi: ${data.patch.targetFile}.`
    );
    refreshPatchesPanel();
  } catch (err) {
    addBubble("system", `Hata: ${err.message}`);
  }
}

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());
    handleRecordedAudio();
  };
  mediaRecorder.start();
  isRecording = true;
  micButton.classList.add("recording");
  micLabel.textContent = "Dinliyorum... (durdurmak icin bas)";
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
  }
  isRecording = false;
  micButton.classList.remove("recording");
  micLabel.textContent = "Isleniyor...";
}

/** OpenAI Whisper ve tarayici Web Speech modlarinin ortak devami: metni sohbete gonder. */
async function processUserText(userText) {
  if (!userText) {
    addBubble("system", "Bir sey duyamadim, tekrar dener misin?");
    return;
  }
  addBubble("user", userText);

  if (isSelfImproveCommand(userText)) {
    await speak("Tamam, kendimi gelistirmeye basliyorum.");
    await runSelfImprove();
    return;
  }

  const chatRes = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: userText, history }),
  });
  const chatData = await chatRes.json();
  if (!chatRes.ok) throw new Error(chatData.error || "Sohbet hatasi");

  const replyText = chatData.reply;
  addBubble("assistant", replyText);
  history.push({ role: "user", content: userText });
  history.push({ role: "assistant", content: replyText });

  await speak(replyText);
  refreshLearnedPanel();
}

async function handleRecordedAudio() {
  setBusy(true);
  try {
    const blob = new Blob(recordedChunks, { type: "audio/webm" });
    if (blob.size < 200) {
      addBubble("system", "Ses algilanmadi, tekrar dener misin?");
      return;
    }

    const form = new FormData();
    form.append("audio", blob, "input.webm");
    const transcribeRes = await fetch("/api/transcribe", { method: "POST", body: form });
    const transcribeData = await transcribeRes.json();
    if (!transcribeRes.ok) throw new Error(transcribeData.error || "Ses tanima hatasi");

    await processUserText((transcribeData.text || "").trim());
  } catch (err) {
    console.error(err);
    addBubble("system", `Hata: ${err.message}`);
  } finally {
    micLabel.textContent = "Konusmak icin bas";
    setBusy(false);
  }
}

function startBrowserListening() {
  isRecording = true;
  micButton.classList.add("recording");
  micLabel.textContent = "Dinliyorum...";
  try {
    recognition.start();
  } catch (err) {
    console.error("[recognition:start]", err);
  }
}

function resetBrowserListeningUI() {
  isRecording = false;
  micButton.classList.remove("recording");
  micLabel.textContent = "Konusmak icin bas";
}

if (recognition) {
  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript.trim();
    setBusy(true);
    try {
      await processUserText(transcript);
    } catch (err) {
      console.error(err);
      addBubble("system", `Hata: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };
  recognition.onerror = (event) => {
    if (event.error !== "no-speech" && event.error !== "aborted") {
      addBubble("system", `Ses tanima hatasi: ${event.error}`);
    }
  };
  recognition.onend = resetBrowserListeningUI;
}

async function speak(text) {
  if (voiceEngine === "browser") {
    if (!window.speechSynthesis) {
      addBubble("system", "Tarayicin sesli okumayi (speechSynthesis) desteklemiyor.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "tr-TR";
    const trVoice = cachedVoices.find((v) => v.lang?.toLowerCase().startsWith("tr"));
    if (trVoice) utterance.voice = trVoice;
    utterance.onerror = (event) => {
      console.error("[speak:browser]", event.error);
      addBubble("system", `Sesli okuma hatasi: ${event.error}`);
    };
    window.speechSynthesis.speak(utterance);
    return;
  }
  try {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        message = data.error || message;
      } catch {
        // yaniti json olarak okunamadi, varsayilan mesaji kullan
      }
      addBubble("system", `Sesli yanit uretilemedi: ${message}`);
      return;
    }
    const audioBlob = await res.blob();
    ttsAudio.src = URL.createObjectURL(audioBlob);
    await ttsAudio.play();
  } catch (err) {
    console.error("[speak]", err);
    addBubble("system", `Sesli yanit uretilemedi: ${err.message}`);
  }
}

micButton.addEventListener("click", async () => {
  if (isBusy && !isRecording) return;

  if (voiceEngine === "browser") {
    if (!recognition) {
      addBubble("system", "Tarayicin sesli tanimayi desteklemiyor. Yukaridan OpenAI moduna gecebilirsin.");
      return;
    }
    if (!isRecording) {
      startBrowserListening();
    } else {
      recognition.stop();
    }
    return;
  }

  if (!isRecording) {
    try {
      await startRecording();
    } catch (err) {
      addBubble("system", `Mikrofon erisimi alinamadi: ${err.message}`);
    }
  } else {
    stopRecording();
  }
});

document.querySelectorAll('input[name="voice-engine"]').forEach((radio) => {
  radio.checked = radio.value === voiceEngine;
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    if (radio.value === "browser" && !browserSpeechSupported) {
      addBubble("system", "Tarayicin bu ozelligi desteklemiyor (Chrome/Edge onerilir).");
      radio.checked = false;
      return;
    }
    voiceEngine = radio.value;
    localStorage.setItem("voiceEngine", voiceEngine);
    checkHealth();
  });
});

async function runSelfImprove() {
  if (history.length === 0) {
    addBubble("system", "Once biraz konusalim ki gelistirecek bir sey olsun.");
    return;
  }
  addBubble("system", "Son konusma uzerinden kendimi gelistiriyorum...");
  try {
    const res = await fetch("/api/self-improve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ history }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Kendini gelistirme hatasi");

    if (data.appliedPersonaUpdates?.length) {
      addBubble("system", `Yeni davranis notlari eklendi:\n${data.appliedPersonaUpdates.map((u) => `- ${u}`).join("\n")}`);
    }
    if (data.queuedCodeProposals > 0) {
      addBubble("system", `${data.queuedCodeProposals} kod/ozellik onerisi, insan onayi icin data/self_improvement_proposals.md dosyasina kaydedildi.`);
    }
    if (data.draftedPatches > 0) {
      addBubble("system", `${data.draftedPatches} kod yamasi taslagi hazirlandi. Asagidaki "Bekleyen Kod Yamalari" panelinden inceleyip onaylayabilir ya da reddedebilirsin.`);
    }
    if (!data.appliedPersonaUpdates?.length && !data.queuedCodeProposals) {
      addBubble("system", "Su an icin yeni bir oneri bulamadim.");
    }
    refreshLearnedPanel();
    refreshPatchesPanel();
  } catch (err) {
    addBubble("system", `Hata: ${err.message}`);
  }
}

improveButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    await runSelfImprove();
  } finally {
    setBusy(false);
  }
});

checkHealth();
refreshLearnedPanel();
refreshPatchesPanel();
