import { Innertube } from "youtubei.js";

let innertubePromise = null;

/** Innertube istemcisini tek seferlik olusturup yeniden kullanir (her cagride yeniden kurmak yavas). */
function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = Innertube.create({ retrieve_player: true });
  }
  return innertubePromise;
}

/**
 * "https://www.youtube.com/watch?v=ID", "https://youtu.be/ID", "https://www.youtube.com/shorts/ID"
 * gibi URL'lerden ya da dogrudan 11 karakterlik video ID'sinden video ID'sini cikarir.
 * @param {string} input
 * @returns {string|null}
 */
export function extractVideoId(input) {
  const trimmed = (input || "").trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1).split("/")[0] || null;
    }
    if (url.hostname.includes("youtube.com")) {
      if (url.searchParams.has("v")) return url.searchParams.get("v");
      const shortsMatch = url.pathname.match(/\/shorts\/([\w-]{11})/);
      if (shortsMatch) return shortsMatch[1];
      const embedMatch = url.pathname.match(/\/embed\/([\w-]{11})/);
      if (embedMatch) return embedMatch[1];
    }
  } catch {
    // gecerli bir URL degil
  }
  return null;
}

/**
 * Bir YouTube videosunun basligini, kanalini ve (varsa) altyazi transkriptini ceker.
 * YouTube'un otomatik-scraping korumalari nedeniyle altyazi indirme HER ZAMAN basarili
 * OLMAYABILIR (ozellikle bulut/sunucu IP'lerinden) - bu durumda transcript alani null
 * doner ve cagiran taraf kullaniciya elle transkript yapistirma secenegini sunmalidir.
 * @param {string} videoId
 * @returns {Promise<{title: string, author: string, transcript: string|null}>}
 */
export async function getVideoTranscript(videoId) {
  const yt = await getInnertube();
  const info = await yt.getInfo(videoId);
  const title = info.basic_info?.title || "Bilinmeyen video";
  const author = info.basic_info?.author || "Bilinmeyen kanal";

  const tracks = info.captions?.caption_tracks;
  if (!tracks || tracks.length === 0) {
    return { title, author, transcript: null };
  }

  const track =
    tracks.find((t) => t.language_code?.startsWith("tr")) ||
    tracks.find((t) => t.language_code?.startsWith("en")) ||
    tracks[0];

  try {
    const res = await fetch(track.base_url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    const xml = await res.text();
    if (!xml || !xml.includes("<text")) {
      return { title, author, transcript: null };
    }

    const transcript = Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g))
      .map((m) =>
        m[1]
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return { title, author, transcript: transcript || null };
  } catch {
    return { title, author, transcript: null };
  }
}
