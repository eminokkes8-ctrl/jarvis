import { exec } from "node:child_process";
import os from "node:os";

// ONEMLI: bu modul, sunucunun CALISTIGI bilgisayarda gercek programlar acar ve
// sistem ses seviyesini degistirir. Bu yuzden sadece Jarvis'i KENDI bilgisayarinda
// "npm start" ile calistiran kullanicilar icin anlamlidir - sunucu uzak/paylasimli
// bir yerde barindirilirsa bu komutlar konusan kisinin degil, SUNUCUNUN bulundugu
// makineyi etkiler.

function run(command) {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true, timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.toString().trim() || err.message));
        return;
      }
      resolve(stdout?.toString() || "");
    });
  });
}

/**
 * Kullanicinin bilgisayarinda gercek bir tarayici (Windows'ta Chrome, macOS'ta
 * Google Chrome, Linux'ta varsayilan tarayici) acip verilen URL'ye gider.
 * @param {string} url sadece https://www.youtube.com/ ile baslayan adreslere izin verilir
 */
export async function openUrlInChrome(url) {
  if (!/^https:\/\/www\.youtube\.com\//.test(url)) {
    throw new Error("Sadece youtube.com adresleri acilabilir");
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

const SET_VOLUME_POWERSHELL_TEMPLATE = `
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
}
'@ -Language CSharp
[JarvisAudio]::SetVolume(__LEVEL__)
`;

/**
 * Windows'ta sistemin ana ses seviyesini yuzde (0-100) olarak ayarlar. Windows'un
 * yerlesik Core Audio API'sini PowerShell uzerinden kullanir - nircmd gibi ekstra
 * bir program kurulmasina gerek yoktur. Sadece Windows'ta desteklenir.
 * @param {number} percent 0-100 arasi hedef ses seviyesi
 * @returns {Promise<number>} uygulanan (0-100 araliginda sinirlandirilmis) yuzde
 */
export async function setSystemVolumePercent(percent) {
  if (os.platform() !== "win32") {
    throw new Error("Sistem sesi kontrolu su an sadece Windows'ta destekleniyor");
  }
  if (typeof percent !== "number" || Number.isNaN(percent)) {
    throw new Error("Gecerli bir yuzde degeri verilmedi");
  }

  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const scalar = (clamped / 100).toFixed(2);
  const script = SET_VOLUME_POWERSHELL_TEMPLATE.replace("__LEVEL__", scalar);

  // Karmasik/coklu satirli scripti kabuk tirnaklama sorunlari olmadan gecirmek icin
  // PowerShell'in -EncodedCommand (UTF-16LE + base64) mekanizmasi kullanilir.
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  await run(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`);

  return clamped;
}
