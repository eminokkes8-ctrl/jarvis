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
    if (data.ok && data.anthropicConfigured && data.openaiConfigured) {
      statusDot.className = "status-dot ok";
      statusDot.title = "Baglanti hazir";
    } else {
      statusDot.className = "status-dot error";
      const missing = [];
      if (!data.anthropicConfigured) missing.push("ANTHROPIC_API_KEY");
      if (!data.openaiConfigured) missing.push("OPENAI_API_KEY");
      statusDot.title = `Eksik: ${missing.join(", ")}`;
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

    const userText = (transcribeData.text || "").trim();
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
  } catch (err) {
    console.error(err);
    addBubble("system", `Hata: ${err.message}`);
  } finally {
    micLabel.textContent = "Konusmak icin bas";
    setBusy(false);
  }
}

async function speak(text) {
  try {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const audioBlob = await res.blob();
    ttsAudio.src = URL.createObjectURL(audioBlob);
    await ttsAudio.play();
  } catch (err) {
    console.error("[speak]", err);
  }
}

micButton.addEventListener("click", async () => {
  if (isBusy && !isRecording) return;
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
