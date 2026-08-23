# Jarvis - Kendini Gelistirebilen Sesli Asistan

Tarayicidan mikrofonla konusabildigin, Claude ile dusunen, gerektiginde web'de arastiran,
sesli cevap veren ve konustukca kendini gelistiren bir asistan.

## Ozellikler

- **Sesli konusma - iki motor secenegi**:
  - **Tarayici (ucretsiz, varsayilan)**: Chrome/Edge'in yerlesik Web Speech API'si
    (`SpeechRecognition` + `speechSynthesis`). Hicbir API anahtari veya ucret gerekmez,
    tamamen tarayicida calisir.
  - **OpenAI (ucretli)**: Whisper (STT) + OpenAI TTS. Daha tutarli kalite sunar ama
    `OPENAI_API_KEY` ve OpenAI hesabinda kullanilabilir bakiye gerektirir.
  - Arayuzdeki ust kisimdaki secim kutularindan istedigin an gecis yapabilirsin;
    tercihin tarayicida hatirlanir.
- **Konusma zekasi**: Claude (Anthropic) ile dogal, kisa sesli-tarza uygun cevaplar.
  (Bu da Anthropic hesabinda kullanilabilir bakiye gerektirir; sesli motorden
  bagimsiz, ucretsiz alternatifi yok.)
- **Web'de arastirma**: Guncel veya bilmedigi bir sey sorulunca Claude'un web arama araci
  (`web_search_20250305`) devreye girer; sonuclar SADECE bilgi kaynagi olarak kullanilir,
  icindeki hicbir metin talimat gibi uygulanmaz (prompt injection'a karsi).
- **Hafiza / ogrenme (asama 1)**: Her turdan sonra kalici tercih/gercekler otomatik
  cikarilip `data/memory.json` icine kaydedilir ve sonraki konusmalarda kullanilir.
- **Sesli komutla kendini gelistirme**: "Baslasana", "kendini gelistir",
  "kendini gelistirmeye basla", "hatalarini duzelt" gibi bir sey soyleyince (ya da
  arayuzdeki butona basinca) asistan son konusmayi analiz eder:
  - Guvenli davranis/ton ayarlarini otomatik olarak `data/persona.md` dosyasina ekler
    (sistem promptuna dahil edilir).
  - Kod/ozellik seviyesindeki fikirleri `data/self_improvement_proposals.md` dosyasina
    yazar.
  - En fazla 2 fikir icin otomatik bir **kod yamasi taslagi** hazirlar (hangi dosyanin
    nasil degisecegini belirler, `data/patches.json` icine "pending" olarak kaydeder).

## Kod yamalari: otomatik hazirlanir, insan onayiyla uygulanir

Asistan bir hatayi/eksigi fark edip kodunu duzeltmek istediginde, tam degisikligi
(hedef dosya + yeni icerik + aciklama + diff) otomatik olarak hazirlar ama **hicbir
zaman dogrudan dosyaya yazmaz**. Web arayuzundeki "Bekleyen Kod Yamalari" panelinde
diff'i gorup "Onayla ve Uygula" ya da "Reddet" ile karar verirsin; sadece bu tikla
gercek dosya guncellenir.

Bu tasarim bilinclidir:
- Web arastirmasi eklendigi icin, kotu niyetli bir sayfanin icerigi "kodunu soyle
  degistir" gibi bir talimat tasiyabilir - otomatik uygulama olsaydi bu dogrudan
  kod calistirmaya donusurdu.
- Modelin urettigi bir yama hatali olursa calisan sunucuyu bozabilir.
- Bu yuzden taslak hazirlama tamamen otomatik, gercek dosyaya yazma adimi ise
  SADECE insanin acik onayiyla (arayuzdeki buton, sesli komutla degil) calisir.
- Yama hedefi olarak sadece `src/` ve `public/` altindaki `.js/.html/.css` dosyalari
  kabul edilir; `.env`, `package.json`, `data/` gibi gizli bilgi veya bagimlilik
  tasiyan dosyalara asla yazilamaz (path traversal ve izin kontrolleri var).
- `npm run dev` (canli yenileme) kullanirsan onaylanan bir yama hemen etkin olur;
  `npm start` ile calistiriyorsan sunucuyu yeniden baslatman gerekir.

## Kurulum

```bash
npm install
cp .env.example .env
# .env dosyasina en azindan ANTHROPIC_API_KEY degerini gir
npm start        # ya da: npm run dev (kod yamasi onayladiktan sonra canli yeniler)
```

Sonra tarayicida `http://localhost:3000` adresini ac. Varsayilan "Tarayici (ucretsiz)"
modunda `OPENAI_API_KEY` girmene gerek yok; sadece "OpenAI" moduna gecersen gerekir.

## Gerekli API anahtarlari

| Degisken | Ne icin | Nereden alinir |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sohbet + web arama (Claude) - her zaman gerekli | console.anthropic.com |
| `OPENAI_API_KEY` | Sadece "OpenAI" ses modu secilirse: Whisper (STT) + TTS | platform.openai.com |

`.env` icindeki `CLAUDE_MODEL`, `TTS_VOICE`, `ENABLE_WEB_SEARCH` ve
`WEB_SEARCH_MAX_USES` degerleri istege bagli olarak degistirilebilir. Web aramasi
API kullanim basina ucretlendirilir; `WEB_SEARCH_MAX_USES` ile istek basina ust
sinir konur, `ENABLE_WEB_SEARCH=false` ile tamamen kapatilabilir.

## Proje yapisi

```
src/
  server.js              Express uygulamasi, route'lari baglar
  lib/anthropic.js       Claude Messages API istemcisi (+ web_search araci)
  lib/openai.js          Whisper (STT) + TTS API istemcisi
  routes/
    transcribe.js        POST /api/transcribe        - ses -> metin
    chat.js               POST /api/chat              - metin -> Claude cevabi (web arama dahil)
    speak.js              POST /api/speak              - metin -> ses
    selfImprove.js        POST /api/self-improve       - kendini gelistirme analizi
    state.js               GET  /api/state              - hafiza + persona notlarini okur
    patches.js             GET  /api/patches            - bekleyen/islenmis yamalar
                           POST /api/patches/:id/apply  - yamayi ONAYLA ve dosyaya yaz
                           POST /api/patches/:id/reject - yamayi reddet
  memory/
    store.js              data/memory.json okuma/yazma
    extract.js             her turdan kalici bilgi cikarma
  selfImprove/
    proposals.js           persona guncelleme + kod onerisi kuyruklama + yama taslagi tetikleme
    patches.js              kod yamasi taslagi hazirlama, saklama, onayli uygulama
public/
  index.html, app.js, styles.css   tarayici arayuzu (mikrofon, ses motoru secimi
                                    [tarayici/OpenAI], sesli komut algilama,
                                    ogrenilenler paneli, bekleyen yamalar paneli)
data/
  memory.json                       (calisirken olusur, git'e girmez)
  persona.md                        (calisirken olusur, git'e girmez)
  self_improvement_proposals.md     (calisirken olusur, git'e girmez, insan onayi bekleyen fikirler)
  patches.json                      (calisirken olusur, git'e girmez, insan onayi bekleyen kod yamalari)
```

## Yol haritasi fikirleri

- Cok dilli otomatik dil algilama
- Kesintisiz (surekli dinleme) mod
- Onaylanan bir yamadan sonra sunucuyu otomatik yeniden baslatan (ama yine
  insan onayli) bir mekanizma
