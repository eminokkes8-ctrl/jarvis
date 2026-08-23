const conversationEl = document.getElementById("conversation");
const micButton = document.getElementById("mic-button");
const micLabel = document.getElementById("mic-label");
const improveButton = document.getElementById("improve-button");
const statusDot = document.getElementById("status-dot");
const learnedContent = document.getElementById("learned-content");
const patchesContent = document.getElementById("patches-content");
const ttsAudio = document.getElementById("tts-audio");
const orb = document.getElementById("orb");
const youtubePanel = document.getElementById("youtube-panel");
const youtubeFrame = document.getElementById("youtube-frame");
const youtubeOpenLink = document.getElementById("youtube-open-link");
const youtubeClose = document.getElementById("youtube-close");
const enrollVoiceButton = document.getElementById("enroll-voice-button");
const resetVoiceButton = document.getElementById("reset-voice-button");
const voiceProfileStatus = document.getElementById("voice-profile-status");

function setOrbState(state) {
  if (!orb) return;
  orb.classList.remove("state-idle", "state-listening", "state-thinking", "state-speaking");
  orb.classList.add(`state-${state}`);
}

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

// "Youtube'den X cal" / "muzik ac" gibi komutlari algilar. Once cumlenin muzikle ilgili
// bir baglami olmasi (muzik/sarki/youtube gecmesi) ve "cal"/"ac" gibi bir eylem fiiliyle
// bitmesi aranir; boylece "Istanbul'da hava nasil" gibi alakasiz cumleler tetiklenmez.
const MUSIC_CONTEXT_RE = /(müzik|muzik|şarkı|sarki|youtube)/i;
const MUSIC_END_TRIGGERS = [
  "çalar mısınız", "calar misiniz", "açar mısınız", "acar misiniz",
  "çalabilir misin", "calabilir misin", "açabilir misin", "acabilir misin",
  "çalar mısın", "calar misin", "açar mısın", "acar misin",
  "oynatır mısın", "oynatir misin", "başlatır mısın", "baslatir misin",
  "çal", "cal", "aç", "ac", "oynat", "başlat", "baslat",
].sort((a, b) => b.length - a.length);

function parseMusicCommand(text) {
  const norm = normalizeCommand(text);
  if (!MUSIC_CONTEXT_RE.test(norm)) return null;

  const trigger = MUSIC_END_TRIGGERS.find((t) => norm.endsWith(t));
  if (!trigger) return null;

  const query = norm
    .slice(0, norm.length - trigger.length)
    .replace(/youtube\s*'?(dan|den)?/gi, "")
    .replace(/(müzik|muzik|şarkısını|sarkisini|şarkısı|sarkisi|şarkı|sarki)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return { query: query || null };
}

function playYouTube(query) {
  if (!youtubePanel || !youtubeFrame) return;
  const encoded = encodeURIComponent(query);
  youtubeFrame.src = `https://www.youtube.com/embed?listType=search&list=${encoded}&autoplay=1`;
  if (youtubeOpenLink) {
    youtubeOpenLink.href = `https://www.youtube.com/results?search_query=${encoded}`;
  }
  youtubePanel.hidden = false;
}

youtubeClose?.addEventListener("click", () => {
  if (youtubeFrame) youtubeFrame.src = "";
  if (youtubePanel) youtubePanel.hidden = true;
});

/**
 * Once sunucunun CALISTIGI bilgisayarda GERCEK Chrome'u acmayi dener (sadece
 * Jarvis kendi bilgisayarinda calistiriliyorsa anlamlidir). Basarisiz olursa
 * (ornegin Chrome bulunamadi, farkli isletim sistemi, vs.) sayfa icindeki
 * gomulu oynaticiya geri duser.
 * @returns {Promise<boolean>} gercekten Chrome'da acildiysa true
 */
async function openMusicOnSystem(query) {
  try {
    const res = await fetch("/api/system/open-youtube", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Chrome acilamadi");
    return true;
  } catch (err) {
    console.warn("[system] gercek Chrome acilamadi, gomulu oynaticiya donuluyor:", err.message);
    playYouTube(query);
    return false;
  }
}

// "Sesi %70 yap", "sesi yuzde 50 ayarla" gibi komutlari algilar. Sadece Windows'ta
// (sunucunun calistigi bilgisayarda) calisir.
function parseVolumeCommand(text) {
  const norm = normalizeCommand(text);
  if (!/(ses|volume)/i.test(norm)) return null;
  if (!/(yap|ayarla|getir|olsun)\b/i.test(norm)) return null;

  const match = norm.match(/(\d{1,3})/);
  if (!match) return null;

  const percent = Math.max(0, Math.min(100, parseInt(match[1], 10)));
  return { percent };
}

// --- Ucretsiz/kaba ses profili dogrulamasi (konusmaci filtreleme) ---
// Bu, GERCEK bir konusmaci dogrulama sistemi DEGILDIR. Sadece ortalama pitch (temel
// frekans) ve spektral merkez (sesin "parlakligi") olcup kiyaslayan basit bir
// yaklastirmadir. Yanlis kabul/red olabilir - amac mukemmel guvenlik degil, kaba
// bir filtreleme; profil kayitli degilse hicbir sey filtrelenmez.
const VOICE_PROFILE_KEY = "jarvisVoiceProfile";
const VOICE_PITCH_TOLERANCE = 0.18;
const VOICE_CENTROID_TOLERANCE = 0.35;

function loadVoiceProfile() {
  try {
    const raw = localStorage.getItem(VOICE_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveVoiceProfile(profile) {
  try {
    localStorage.setItem(VOICE_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // localStorage kullanilamiyor, sessizce gec
  }
}

function clearVoiceProfileStorage() {
  try {
    localStorage.removeItem(VOICE_PROFILE_KEY);
  } catch {
    // yoksay
  }
}

/** Basit zaman-alani otokorelasyon tabanli temel frekans (pitch) tahmini. */
function detectPitch(timeData, sampleRate) {
  const size = timeData.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += timeData[i] * timeData[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return null;

  const maxSamples = Math.floor(size / 2);
  const minOffset = Math.floor(sampleRate / 500);
  const maxOffset = Math.min(Math.floor(sampleRate / 60), maxSamples - 1);
  let bestOffset = -1;
  let bestCorrelation = 0;

  for (let offset = minOffset; offset < maxOffset; offset++) {
    let correlation = 0;
    for (let i = 0; i < maxSamples; i++) {
      correlation += Math.abs(timeData[i] - timeData[i + offset]);
    }
    correlation = 1 - correlation / maxSamples;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  return bestCorrelation > 0.5 && bestOffset > 0 ? sampleRate / bestOffset : null;
}

/** Ses spektrumunun "agirlik merkezi" - kabaca sesin ne kadar tiz/parlak oldugunu yansitir. */
function spectralCentroid(freqData, sampleRate, fftSize) {
  let weightedSum = 0;
  let total = 0;
  const binWidth = sampleRate / fftSize;
  for (let i = 0; i < freqData.length; i++) {
    weightedSum += i * binWidth * freqData[i];
    total += freqData[i];
  }
  return total > 0 ? weightedSum / total : 0;
}

/** Mikrofon akisini surekli orneklerken pitch/spektral merkez biriktiren bir analizor olusturur. */
function createVoiceAnalyzer(stream) {
  const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextImpl) return null;

  const audioCtx = new AudioContextImpl();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const timeData = new Float32Array(analyser.fftSize);
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const pitches = [];
  const centroids = [];

  const intervalId = setInterval(() => {
    analyser.getFloatTimeDomainData(timeData);
    analyser.getByteFrequencyData(freqData);
    const pitch = detectPitch(timeData, audioCtx.sampleRate);
    if (pitch) pitches.push(pitch);
    centroids.push(spectralCentroid(freqData, audioCtx.sampleRate, analyser.fftSize));
  }, 100);

  return {
    stop() {
      clearInterval(intervalId);
      audioCtx.close().catch(() => {});
      const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
      return { avgPitch: avg(pitches), avgCentroid: avg(centroids), sampleCount: pitches.length };
    },
  };
}

function voiceMatchesProfile(sample, profile) {
  if (!sample?.avgPitch || !profile?.avgPitch) return true; // yeterli veri yok, guvenli tarafta gecir
  const pitchDiff = Math.abs(sample.avgPitch - profile.avgPitch) / profile.avgPitch;
  const centroidDiff = profile.avgCentroid
    ? Math.abs((sample.avgCentroid || 0) - profile.avgCentroid) / profile.avgCentroid
    : 0;
  return pitchDiff < VOICE_PITCH_TOLERANCE && centroidDiff < VOICE_CENTROID_TOLERANCE;
}

function isVoiceAuthorized(sample) {
  const profile = loadVoiceProfile();
  if (!profile) return true; // henuz kayitli profil yok, filtrelemeden gecir
  return voiceMatchesProfile(sample, profile);
}

function updateVoiceProfileStatus() {
  if (!voiceProfileStatus) return;
  const profile = loadVoiceProfile();
  if (profile) {
    voiceProfileStatus.textContent = "Ses profili: kayitli - komutlar bu sese kiyaslanacak";
    voiceProfileStatus.classList.add("enrolled");
    if (resetVoiceButton) resetVoiceButton.hidden = false;
  } else {
    voiceProfileStatus.textContent = "Ses profili: kayitli degil - herkesin sesi kabul ediliyor";
    voiceProfileStatus.classList.remove("enrolled");
    if (resetVoiceButton) resetVoiceButton.hidden = true;
  }
}

async function enrollVoice() {
  if (!navigator.mediaDevices?.getUserMedia) {
    addBubble("system", "Tarayicin mikrofon erisimini desteklemiyor.");
    return;
  }
  enrollVoiceButton.disabled = true;
  addBubble("system", "Ses profilini kaydediyorum, lutfen 4 saniye boyunca dogal sekilde konus...");
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const analyzer = createVoiceAnalyzer(stream);
    if (!analyzer) throw new Error("Bu tarayici ses analizini desteklemiyor");

    await new Promise((resolve) => setTimeout(resolve, 4000));
    const sample = analyzer.stop();

    if (!sample.avgPitch || sample.sampleCount < 5) {
      addBubble("system", "Yeterince ses algilayamadim, tekrar dener misin?");
      return;
    }

    saveVoiceProfile({
      avgPitch: sample.avgPitch,
      avgCentroid: sample.avgCentroid,
      enrolledAt: new Date().toISOString(),
    });
    addBubble(
      "system",
      "Ses profili kaydedildi. Bundan sonra farkli bir ses komut vermeye calisirsa (kaba bir tahminle) yoksayacagim - bu %100 guvenilir bir yontem degil."
    );
    updateVoiceProfileStatus();
  } catch (err) {
    addBubble("system", `Ses profili kaydedilemedi: ${err.message}`);
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
    enrollVoiceButton.disabled = false;
  }
}

enrollVoiceButton?.addEventListener("click", enrollVoice);
resetVoiceButton?.addEventListener("click", () => {
  clearVoiceProfileStorage();
  updateVoiceProfileStatus();
  addBubble("system", "Ses profili silindi, artik herkesin sesi kabul edilecek.");
});

// Bir dinleme oturumu sirasinda calisan ses analizini durdurup ornegi dondurur;
// mikrofon akisini da kapatir. Analiz/akis zaten yoksa zararsizca hicbir sey yapmaz.
let currentVoiceAnalyzer = null;
let currentMicStream = null;
let lastVoiceSample = null;

function finishVoiceCapture() {
  const sample = currentVoiceAnalyzer ? currentVoiceAnalyzer.stop() : null;
  currentVoiceAnalyzer = null;
  if (currentMicStream) {
    currentMicStream.getTracks().forEach((t) => t.stop());
    currentMicStream = null;
  }
  return sample;
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
    const llmKeyName = data.llmProvider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
    const llmConfigured = data.llmProvider === "gemini" ? data.geminiConfigured : data.anthropicConfigured;
    if (data.ok && llmConfigured && (!needsOpenAI || data.openaiConfigured)) {
      statusDot.className = "status-dot ok";
      statusDot.title = "Baglanti hazir";
    } else {
      statusDot.className = "status-dot error";
      const missing = [];
      if (!llmConfigured) missing.push(llmKeyName);
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
  currentMicStream = stream;
  currentVoiceAnalyzer = createVoiceAnalyzer(stream);
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    lastVoiceSample = finishVoiceCapture();
    handleRecordedAudio();
  };
  mediaRecorder.start();
  isRecording = true;
  micButton.classList.add("recording");
  micLabel.textContent = "Dinliyorum... (durdurmak icin bas)";
  setOrbState("listening");
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
    setOrbState("idle");
    return;
  }
  setOrbState("thinking");
  addBubble("user", userText);

  if (isSelfImproveCommand(userText)) {
    await speak("Tamam, kendimi gelistirmeye basliyorum.");
    await runSelfImprove();
    return;
  }

  const musicCommand = parseMusicCommand(userText);
  if (musicCommand) {
    if (!musicCommand.query) {
      addBubble("system", "Hangi sarkiyi calmami istedigini anlayamadim, tekrar dener misin?");
      setOrbState("idle");
      return;
    }
    const openedInChrome = await openMusicOnSystem(musicCommand.query);
    await speak(
      openedInChrome
        ? `Tamam, Chrome'da "${musicCommand.query}" icin YouTube'u aciyorum.`
        : `Chrome'u su bilgisayarda acamadim, "${musicCommand.query}" icin burada caliyorum.`
    );
    return;
  }

  const volumeCommand = parseVolumeCommand(userText);
  if (volumeCommand) {
    try {
      const res = await fetch("/api/system/volume", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ percent: volumeCommand.percent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ses ayarlanamadi");
      await speak(`Tamam, sesi yuzde ${data.percent} yaptim.`);
    } catch (err) {
      addBubble("system", `Hata: ${err.message}`);
      setOrbState("idle");
    }
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
      setOrbState("idle");
      return;
    }

    setOrbState("thinking");
    const form = new FormData();
    form.append("audio", blob, "input.webm");
    const transcribeRes = await fetch("/api/transcribe", { method: "POST", body: form });
    const transcribeData = await transcribeRes.json();
    if (!transcribeRes.ok) throw new Error(transcribeData.error || "Ses tanima hatasi");

    if (!isVoiceAuthorized(lastVoiceSample)) {
      addBubble("system", "Bu komutu senin sesin gibi taniyamadim, yoksayiyorum.");
      setOrbState("idle");
      return;
    }

    await processUserText((transcribeData.text || "").trim());
  } catch (err) {
    console.error(err);
    addBubble("system", `Hata: ${err.message}`);
    setOrbState("idle");
  } finally {
    micLabel.textContent = "Konusmak icin bas";
    setBusy(false);
  }
}

async function startBrowserListening() {
  isRecording = true;
  micButton.classList.add("recording");
  micLabel.textContent = "Dinliyorum...";
  setOrbState("listening");

  // SpeechRecognition ham sese erisim vermedigi icin, ses profili analizi icin
  // ayrica bir mikrofon akisi aliyoruz.
  try {
    currentMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    currentVoiceAnalyzer = createVoiceAnalyzer(currentMicStream);
  } catch (err) {
    console.warn("[voice] ses profili analizi baslatilamadi:", err.message);
  }

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
    const sample = finishVoiceCapture();
    setBusy(true);
    try {
      if (!isVoiceAuthorized(sample)) {
        addBubble("system", "Bu komutu senin sesin gibi taniyamadim, yoksayiyorum.");
        setOrbState("idle");
        return;
      }
      await processUserText(transcript);
    } catch (err) {
      console.error(err);
      addBubble("system", `Hata: ${err.message}`);
      setOrbState("idle");
    } finally {
      setBusy(false);
    }
  };
  recognition.onerror = (event) => {
    finishVoiceCapture();
    if (event.error !== "no-speech" && event.error !== "aborted") {
      addBubble("system", `Ses tanima hatasi: ${event.error}`);
    }
  };
  recognition.onend = () => {
    finishVoiceCapture();
    resetBrowserListeningUI();
  };
}

async function speak(text) {
  if (voiceEngine === "browser") {
    if (!window.speechSynthesis) {
      addBubble("system", "Tarayicin sesli okumayi (speechSynthesis) desteklemiyor.");
      setOrbState("idle");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "tr-TR";
    const trVoice = cachedVoices.find((v) => v.lang?.toLowerCase().startsWith("tr"));
    if (trVoice) utterance.voice = trVoice;
    utterance.onstart = () => setOrbState("speaking");
    utterance.onend = () => setOrbState("idle");
    utterance.onerror = (event) => {
      console.error("[speak:browser]", event.error);
      addBubble("system", `Sesli okuma hatasi: ${event.error}`);
      setOrbState("idle");
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
      setOrbState("idle");
      return;
    }
    const audioBlob = await res.blob();
    ttsAudio.src = URL.createObjectURL(audioBlob);
    ttsAudio.onended = () => setOrbState("idle");
    setOrbState("speaking");
    await ttsAudio.play();
  } catch (err) {
    console.error("[speak]", err);
    addBubble("system", `Sesli yanit uretilemedi: ${err.message}`);
    setOrbState("idle");
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
updateVoiceProfileStatus();
