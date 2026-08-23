# Jarvis - Kendini Gelistirebilen Sesli Asistan

Tarayicidan mikrofonla konusabildigin, Claude ile dusunen, sesli cevap veren ve
konustukca kendini gelistiren bir asistan.

## Ozellikler

- **Sesli konusma**: Mikrofona konus, OpenAI Whisper ile metne cevrilir.
- **Konusma zekasi**: Claude (Anthropic) ile dogal, kisa sesli-tarza uygun cevaplar.
- **Seslendirme**: Cevaplar OpenAI TTS ile sese cevrilip otomatik calinir.
- **Hafiza / ogrenme (asama 1)**: Her turdan sonra kalici tercih/gercekler otomatik
  cikarilip `data/memory.json` icine kaydedilir ve sonraki konusmalarda kullanilir.
- **Kendini gelistirme (asama 2)**: "Kendini gelistir" butonuna basildiginda asistan
  son konusmayi analiz eder:
  - Guvenli davranis/ton ayarlarini otomatik olarak `data/persona.md` dosyasina ekler
    (sistem promptuna dahil edilir).
  - Kod/ozellik seviyesindeki fikirleri **otomatik uygulamadan**, insan onayi icin
    `data/self_improvement_proposals.md` dosyasina kaydeder.

Not: Asistan kendi kaynak kodunu otomatik degistirmez; kod seviyesindeki oneriler
her zaman bir insanin gozden gecirip uygulamasi icin biriktirilir. Bu, guvenlik
acisindan kasitli bir tercihtir.

## Kurulum

```bash
npm install
cp .env.example .env
# .env dosyasina ANTHROPIC_API_KEY ve OPENAI_API_KEY degerlerini gir
npm start
```

Sonra tarayicida `http://localhost:3000` adresini ac.

## Gerekli API anahtarlari

| Degisken | Ne icin | Nereden alinir |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sohbet (Claude) | console.anthropic.com |
| `OPENAI_API_KEY` | Ses tanima (Whisper) + seslendirme (TTS) | platform.openai.com |

`.env` icindeki `CLAUDE_MODEL` ve `TTS_VOICE` degerleri istege bagli olarak
degistirilebilir.

## Proje yapisi

```
src/
  server.js              Express uygulamasi, route'lari baglar
  lib/anthropic.js       Claude Messages API istemcisi
  lib/openai.js          Whisper (STT) + TTS API istemcisi
  routes/
    transcribe.js        POST /api/transcribe  - ses -> metin
    chat.js               POST /api/chat        - metin -> Claude cevabi
    speak.js              POST /api/speak        - metin -> ses
    selfImprove.js        POST /api/self-improve - kendini gelistirme analizi
    state.js               GET  /api/state        - hafiza + persona notlarini okur
  memory/
    store.js              data/memory.json okuma/yazma
    extract.js             her turdan kalici bilgi cikarma
  selfImprove/
    proposals.js           persona guncelleme + kod onerisi kuyruklama
public/
  index.html, app.js, styles.css   tarayici arayuzu (mikrofon, konusma balonlari, ogrenilenler paneli)
data/
  memory.json                       (calisirken olusur, git'e girmez)
  persona.md                        (calisirken olusur, git'e girmez)
  self_improvement_proposals.md     (calisirken olusur, git'e girmez, insan onayi bekleyen oneriler)
```

## Yol haritasi fikirleri

- Cok dilli otomatik dil algilama
- Kesintisiz (surekli dinleme) mod
- `data/self_improvement_proposals.md` icindeki onerileri gozden gecirip
  otomatik olarak bir Claude Code oturumuna gorev olarak acan bir arac
