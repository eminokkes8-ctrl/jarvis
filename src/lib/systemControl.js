import { exec } from "node:child_process";
import os from "node:os";

// ONEMLI: bu modul, sunucunun CALISTIGI bilgisayarda gercek programlar acar,
// tuslara basar ve sistem ayarlarini degistirir. Bu yuzden sadece Jarvis'i
// KENDI bilgisayarinda "npm start" ile calistiran kullanicilar icin
// anlamlidir - sunucu uzak/paylasimli bir yerde barindirilirsa bu komutlar
// konusan kisinin degil, SUNUCUNUN bulundugu makineyi etkiler.

function run(command, timeout = 10_000) {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true, timeout }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.toString().trim() || err.message));
        return;
      }
      resolve(stdout?.toString() || "");
    });
  });
}

function assertWindows(feature = "Bu ozellik") {
  if (os.platform() !== "win32") {
    throw new Error(`${feature} su an sadece Windows'ta destekleniyor`);
  }
}

async function runEncodedPowerShell(script, timeout) {
  // Karmasik/coklu satirli scriptleri kabuk tirnaklama sorunlari olmadan gecirmek
  // icin PowerShell'in -EncodedCommand (UTF-16LE + base64) mekanizmasi kullanilir.
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return run(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, timeout);
}

/* ------------------------------------------------------------------ */
/* Web / YouTube                                                       */
/* ------------------------------------------------------------------ */

/**
 * YouTube arama sonuclari HTML'inden ILK videonun gercek videoId'sini cikarip
 * dogrudan /watch?v= adresini dondurur. API anahtari gerekmez. "embed?listType=
 * search" hilesinden daha guvenilirdir: gercek bir izleme sayfasi oldugu icin
 * YouTube'un normal otomatik oynatma davranisi devreye girer.
 * @param {string} query
 * @returns {Promise<string|null>} bulunursa watch URL'i, bulunamazsa/hata olursa null
 */
export async function findFirstYouTubeVideoUrl(query) {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=tr&gl=TR`;
    const res = await fetch(searchUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "accept-language": "tr,tr;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/"videoRenderer":\{"videoId":"([\w-]{11})"/);
    return match ? `https://www.youtube.com/watch?v=${match[1]}` : null;
  } catch {
    return null;
  }
}

// Guvenlik icin sadece bu sabit host listesine acilabilir - rastgele bir
// adres acilamaz.
const ALLOWED_URL_HOSTS = new Set([
  "www.youtube.com",
  "www.google.com",
  "tr.wikipedia.org",
  "wikipedia.org",
  "web.whatsapp.com",
  "music.youtube.com",
]);

/**
 * Kullanicinin bilgisayarinda gercek bir tarayici (Windows'ta Chrome, macOS'ta
 * Google Chrome, Linux'ta varsayilan tarayici) acip verilen URL'ye gider.
 * @param {string} url sadece ALLOWED_URL_HOSTS icindeki adreslere izin verilir
 */
export async function openUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Gecersiz URL");
  }
  if (parsed.protocol !== "https:" || !ALLOWED_URL_HOSTS.has(parsed.hostname)) {
    throw new Error("Bu adres acilamaz (izinli listede degil)");
  }

  const platform = os.platform();
  if (platform === "win32") {
    // "start" komutunda ilk tirnakli parametre pencere basligi olarak yorumlanir,
    // bu yuzden bos bir baslik ("") ile basliyoruz.
    await run(`start "" "chrome" "${url}"`);
  } else if (platform === "darwin") {
    await run(`open -a "Google Chrome" "${url}"`);
  } else {
    await run(`xdg-open "${url}"`);
  }
}

/* ------------------------------------------------------------------ */
/* Uygulama acma                                                       */
/* ------------------------------------------------------------------ */

// Turkce komut adlarindan bilinen uygulama baslatma komutlarina esleme.
// "start" komutu Windows'un kayitli "App Paths" mekanizmasiyla bircok
// uygulamayi tam yol vermeden, sadece adiyla bulabilir. Sadece bu sabit
// liste kabul edilir - rastgele bir program calistirilamaz.
const APP_COMMANDS = {
  chrome: "chrome",
  "not defteri": "notepad",
  notepad: "notepad",
  "hesap makinesi": "calc",
  hesapmakinesi: "calc",
  spotify: "spotify",
  whatsapp: "whatsapp",
  "dosya gezgini": "explorer",
  gezgin: "explorer",
  "gorev yoneticisi": "taskmgr",
  paint: "mspaint",
  word: "winword",
  excel: "excel",
};

export function listKnownApps() {
  return Object.keys(APP_COMMANDS);
}

/**
 * Bilinen bir masaustu uygulamasini adina gore acar (Windows).
 * @param {string} appKey APP_COMMANDS icindeki anahtarlardan biri
 */
export async function openApp(appKey) {
  assertWindows("Uygulama acma");
  const command = APP_COMMANDS[appKey];
  if (!command) {
    throw new Error(`Bilinmeyen uygulama: ${appKey}`);
  }
  await run(`start "" "${command}"`);
}

/* ------------------------------------------------------------------ */
/* Ses seviyesi (Core Audio API)                                       */
/* ------------------------------------------------------------------ */

const AUDIO_TYPE_DEFINITION = `
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, System.Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref System.Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class JarvisAudio {
  static IAudioEndpointVolume Vol() {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null;
    var epvid = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref epvid, 23, 0, out epv));
    return epv;
  }
  public static void SetVolume(float level) {
    Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(level, System.Guid.Empty));
  }
  public static float GetVolume() {
    float v = 0;
    Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v));
    return v;
  }
}
'@ -Language CSharp
`;

/**
 * Windows'ta sistemin su anki ana ses seviyesini yuzde (0-100) olarak okur.
 * @returns {Promise<number>}
 */
export async function getSystemVolumePercent() {
  assertWindows("Sistem sesi kontrolu");
  const stdout = await runEncodedPowerShell(`${AUDIO_TYPE_DEFINITION}\n[JarvisAudio]::GetVolume()`);
  const scalar = parseFloat(stdout.trim());
  if (Number.isNaN(scalar)) {
    throw new Error("Ses seviyesi okunamadi");
  }
  return Math.round(scalar * 100);
}

/**
 * Windows'ta sistemin ana ses seviyesini yuzde (0-100) olarak ayarlar.
 * @param {number} percent 0-100 arasi hedef ses seviyesi
 * @returns {Promise<number>} uygulanan (0-100 araliginda sinirlandirilmis) yuzde
 */
export async function setSystemVolumePercent(percent) {
  assertWindows("Sistem sesi kontrolu");
  if (typeof percent !== "number" || Number.isNaN(percent)) {
    throw new Error("Gecerli bir yuzde degeri verilmedi");
  }
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const scalar = (clamped / 100).toFixed(2);
  await runEncodedPowerShell(`${AUDIO_TYPE_DEFINITION}\n[JarvisAudio]::SetVolume(${scalar})`);
  return clamped;
}

/* ------------------------------------------------------------------ */
/* Medya tuslari (oynat/duraklat, sonraki, onceki)                     */
/* ------------------------------------------------------------------ */

const KEY_TYPE_DEFINITION = `
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public class JarvisKeys {
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, System.UIntPtr dwExtraInfo);
  public static void Press(byte code) {
    keybd_event(code, 0, 0, System.UIntPtr.Zero);
    keybd_event(code, 0, 2, System.UIntPtr.Zero);
  }
}
'@ -Language CSharp
`;

const MEDIA_KEY_CODES = {
  playpause: 0xb3,
  next: 0xb0,
  previous: 0xb1,
  stop: 0xb2,
};

/**
 * Windows'ta medya tusu basimini simule eder (aktif medya oynaticisini -
 * YouTube, Spotify vb. - kontrol eder).
 * @param {"playpause"|"next"|"previous"|"stop"} action
 */
export async function pressMediaKey(action) {
  assertWindows("Medya tusu kontrolu");
  const code = MEDIA_KEY_CODES[action];
  if (code === undefined) {
    throw new Error(`Bilinmeyen medya eylemi: ${action}`);
  }
  await runEncodedPowerShell(`${KEY_TYPE_DEFINITION}\n[JarvisKeys]::Press(${code})`);
}

/* ------------------------------------------------------------------ */
/* Ekran parlakligi (WMI - cogunlukla dizustu dahili ekranlar)          */
/* ------------------------------------------------------------------ */

export async function getScreenBrightnessPercent() {
  assertWindows("Ekran parlakligi kontrolu");
  const stdout = await runEncodedPowerShell(
    "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness"
  );
  const value = parseInt(stdout.trim(), 10);
  if (Number.isNaN(value)) {
    throw new Error("Ekran parlakligi okunamadi (bu ekran WMI parlaklik kontrolunu desteklemiyor olabilir)");
  }
  return value;
}

export async function setScreenBrightnessPercent(percent) {
  assertWindows("Ekran parlakligi kontrolu");
  if (typeof percent !== "number" || Number.isNaN(percent)) {
    throw new Error("Gecerli bir yuzde degeri verilmedi");
  }
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  await runEncodedPowerShell(
    `$m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods\n` +
      `Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{Timeout=0; Brightness=${clamped}} | Out-Null`
  );
  return clamped;
}

/* ------------------------------------------------------------------ */
/* Ekran goruntusu                                                     */
/* ------------------------------------------------------------------ */

/**
 * Tum ekranin goruntusunu alip masaustune PNG olarak kaydeder.
 * @param {{open?: boolean}} opts open=true ise dosyayi varsayilan goruntuleyiciyle acar
 * @returns {Promise<string>} kaydedilen dosyanin tam yolu
 */
export async function takeScreenshot({ open = false } = {}) {
  assertWindows("Ekran goruntusu alma");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$desktop = [System.Environment]::GetFolderPath("Desktop")
$path = "$desktop\\jarvis_ekran_${timestamp}.png"
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bmp.Dispose()
Write-Output $path
`;
  const stdout = await runEncodedPowerShell(script, 15_000);
  const path = stdout.trim();
  if (!path) {
    throw new Error("Ekran goruntusu alinamadi");
  }
  if (open) {
    await run(`start "" "${path}"`);
  }
  return path;
}

/* ------------------------------------------------------------------ */
/* Guc / oturum eylemleri                                              */
/* ------------------------------------------------------------------ */

/**
 * Windows guc/oturum eylemleri. shutdown/restart 60 saniye gecikmeli calisir
 * ve "cancel" ile iptal edilebilir - bu, yanlis anlasilan bir sesli komutun
 * bilgisayari aninda kapatmasini onlemek icin kasitli bir guvenlik onlemidir.
 * @param {"lock"|"shutdown"|"restart"|"hibernate"|"cancel"} action
 */
export async function powerAction(action) {
  assertWindows("Guc/oturum kontrolu");
  switch (action) {
    case "lock":
      await run("rundll32.exe user32.dll,LockWorkStation");
      return;
    case "shutdown":
      await run("shutdown /s /t 60");
      return;
    case "restart":
      await run("shutdown /r /t 60");
      return;
    case "hibernate":
      await run("shutdown /h");
      return;
    case "cancel":
      await run("shutdown /a");
      return;
    default:
      throw new Error(`Bilinmeyen guc eylemi: ${action}`);
  }
}
