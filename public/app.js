const conversationEl = document.getElementById("conversation");
const micButton = document.getElementById("mic-button");
const micLabel = document.getElementById("mic-label");
const improveButton = document.getElementById("improve-button");
const statusDot = document.getElementById("status-dot");
const learnedContent = document.getElementById("learned-content");
const ttsAudio = document.getElementById("tts-audio");

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

improveButton.addEventListener("click", async () => {
  if (history.length === 0) {
    addBubble("system", "Once biraz konusalim ki gelistirecek bir sey olsun.");
    return;
  }
  setBusy(true);
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
    if (!data.appliedPersonaUpdates?.length && !data.queuedCodeProposals) {
      addBubble("system", "Su an icin yeni bir oneri bulamadim.");
    }
    refreshLearnedPanel();
  } catch (err) {
    addBubble("system", `Hata: ${err.message}`);
  } finally {
    setBusy(false);
  }
});

checkHealth();
refreshLearnedPanel();
