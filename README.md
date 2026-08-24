# Jarvis - Kendini Gelistirebilen Sesli Asistan

Tarayicidan mikrofonla konusabildigin, bir LLM ile dusunen, sesli cevap veren ve
konustukca kendini gelistiren bir asistan. Varsayilan kurulum **tamamen ucretsiz**
calisacak sekilde ayarlanmistir (Google Gemini + tarayici sesi).

## Ozellikler

- **Sesli konusma - iki motor secenegi**:
  - **Tarayici (ucretsiz, varsayilan)**: Chrome/Edge'in yerlesik Web Speech API'si
    (`SpeechRecognition` + `speechSynthesis`). Hicbir API anahtari veya ucret gerekmez,
    tamamen tarayicida calisir.
  - **OpenAI (ucretli)**: Whisper (STT) + OpenAI TTS. Daha tutarli kalite sunar ama
    `OPENAI_API_KEY` ve OpenAI hesabinda kullanilabilir bakiye gerektirir.
  - Arayuzdeki ust kisimdaki secim kutularindan istedigin an gecis yapabilirsin;
    tercihin tarayicida hatirlanir.
- **Konusma zekasi - dort saglayici secenegi**:
  - **Ollama (ucretsiz, API ANAHTARI GEREKTIRMEZ)**: `.env` icinde `GEMINI_API_KEY`
    bos birakilirsa otomatik olarak devreye girer. Bilgisayarinda
    [Ollama](https://ollama.com) kurulu ve acik olmali (`ollama run llama3.1` ile
    model bir kere indirilir). Hicbir hesap, kredi karti ya da API anahtari gerekmez.
  - **Google Gemini (ucretsiz, API anahtari ister)**: Google AI Studio'nun ucretsiz
    katmani, kredi karti gerekmez ama `GEMINI_API_KEY` ister (`LLM_PROVIDER=gemini`).
    Dakika basina istek siniri var (ucretsiz katmanin dogal siniri).
  - **OpenAI GPT (ucretli)**: `.env`'de `LLM_PROVIDER=openai` ve `OPENAI_API_KEY`
    ile. Varsayilan model `gpt-4o-mini` (ucuz+hizli); `OPENAI_MODEL` ile degistirilebilir.
  - **Anthropic Claude (ucretli)**: Daha guclu bir model istersen `.env`'de
    `LLM_PROVIDER=anthropic` yapabilirsin; bu durumda `ANTHROPIC_API_KEY` gerekir.
  - Hicbir `LLM_PROVIDER` ya da `GEMINI_API_KEY` girmezsen, hicbir API anahtari
    olmadan **Ollama ile calisir** - sunucu terminalinde "kullanilan saglayici:"
    satirini kontrol ederek hangisinin aktif oldugunu gorebilirsin.
- **Web'de arastirma (sadece Claude ile, varsayilan kapali)**: `LLM_PROVIDER=anthropic`
  ve `ENABLE_WEB_SEARCH=true` ise, guncel bir sey sorulunca Claude'un web arama araci
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
  - En fazla 1 fikir icin otomatik bir **kod yamasi taslagi** hazirlar (hangi dosyanin
    nasil degisecegini belirler, `data/patches.json` icine "pending" olarak kaydeder). Bu
    sayi kasitli olarak dusuk tutulur: ucretsiz LLM katmanlarinin (Gemini) dakika basina
    istek siniri var.
- **Sesli komutla YouTube'dan muzik calma**: "Youtube'den <sarki> calar misin", "muzik ac"
  gibi bir sey soyleyince, once sunucunun calistigi bilgisayarda **gercek Chrome'u**
  acmayi dener; basarisiz olursa (Chrome bulunamadi, farkli isletim sistemi vb.) sayfa
  icinde gomulu bir YouTube oynaticiya geri duser. Detaylar icin asagidaki
  "Bilgisayar kontrolu" bolumune bak.
- **Sesli komutla sistem sesi ayarlama**: sunucunun calistigi bilgisayarin (sadece
  Windows) sistem ses seviyesini degistirir:
  - Kesin deger: "sesi %70 yap", "ses seviyesini 30 yap"
  - Mevcut seviyeye gore fark: "sesi %10 dusur", "sesi %30 yukselt"
  - Sayi verilmezse sabit bir adimla (15 puan): "sesi kis", "sesi ac", "sesi yukselt"
  - Sessize alma: "sesi kapat", "sesi sustur"
- **Sesli komutla medya kontrolu**: "sonraki sarki", "onceki sarki", "muzigi duraklat",
  "devam et" gibi komutlarla aktif medya oynaticisini (YouTube, Spotify vb.) kontrol
  eder - klavyenin medya tuslarini simule eder (sadece Windows).
- **Sesli komutla ekran parlakligi**: "parlakligi %70 yap", "parlakligi kis/ac",
  "parlakligi %10 dusur" - ses seviyesiyle ayni mantik (sadece Windows, cogunlukla
  dizustu dahili ekranlarda calisir).
- **Sesli komutla ekran goruntusu**: "ekran goruntusu al" (istege bagli "...ve ac")
  - masaustune PNG olarak kaydeder (sadece Windows).
- **Sesli komutla uygulama acma**: "chrome'u ac", "not defterini ac", "hesap
  makinesini ac", "spotify ac" gibi bilinen bir uygulama listesini acar (sadece
  Windows, guvenlik icin sabit bir listeyle sinirli).
- **Sesli komutla genel web islemleri**: "google'da <X> ara", "vikipedi'de <X> ara",
  "whatsapp web ac" - sadece izinli bir site listesine (google/vikipedi/whatsapp)
  acilabilir.
- **Sesli komutla bilgisayari kilitleme/kapatma/yeniden baslatma**: "bilgisayari
  kilitle" (aninda), "bilgisayari kapat" / "bilgisayari yeniden baslat" (60 saniye
  gecikmeli, "kapatmayi iptal et" ile durdurulabilir) - yanlis anlasilan bir sesli
  komutun bilgisayari aninda kapatmasini onlemek icin kasitli bir guvenlik onlemi
  (sadece Windows).
- **Ucretsiz/kaba ses profili dogrulamasi (konusmaci filtreleme)**: Yan paneldeki
  "Sesimi Kaydet" ile 4 saniyelik bir ses ornegi kaydedip tarayicida (localStorage)
  saklarsin. Kayittan sonra, her komut oncesi o anki konusmacinin ses ozellikleri
  (ortalama pitch + spektral renk) kayitli profille kiyaslanir; uyusmuyorsa komut
  yoksayilir. Bu GERCEK bir konusmaci dogrulamasi DEGILDIR - ucretsiz ve basit bir
  yaklastirmadir, yanlis kabul/red olabilir. Profil kaydedilmediyse hicbir filtreleme
  yapilmaz (herkesin sesi kabul edilir).
- **YouTube video ozetleme**: Yan paneldeki "Video Ozetle" kutusuna bir YouTube linki
  yapistirip "Ozetle"ye basinca, Jarvis videonun altyazi/transkript metnini cekip
  LLM ile Turkce ozet cikarir ve sesli okur. **Onemli sinirlama**: Jarvis videoyu
  gercekten izlemez/dinlemez - sadece YouTube'un altyazi metnini okur. YouTube bazi
  sunuculardan (ozellikle bulut ortamlarindan) otomatik altyazi indirmeyi
  engelleyebilir; bu durumda arayuz sana YouTube'da "..." > "Transkripti goster" ile
  metni elle kopyalayip yapistirma secenegi sunar. Ozet, hafiza modulune de kalici
  bilgi olarak eklenir (sonraki sohbetlerde hatirlanir).

## Bilgisayar kontrolu (Windows) - onemli sinirlama

Muzik calma ve ses seviyesi ozellikleri, sunucunun **CALISTIGI bilgisayari** kontrol
eder - konusan kisinin degil. Bu, sadece Jarvis'i kendi bilgisayarinda `npm start`
ile calistirdigin senaryoda anlam ifade eder (senin durumun budur). Eger bu sunucuyu
ileride uzak/paylasimli bir yerde barindirirsan, bu komutlar SUNUCUNUN bulundugu
makineyi etkiler, seninkini degil - bu yuzden bu ozellikler kasitli olarak basit ve
tek-kullanicili bir yerel kurulum varsayimiyla tasarlandi.

- **Muzik calma**: `src/lib/systemControl.js` icindeki `openUrlInChrome()`, Windows'ta
  `start "" "chrome" "<url>"`, macOS'ta `open -a "Google Chrome"`, Linux'ta `xdg-open`
  komutunu calistirir. Sadece `https://www.youtube.com/...` ile baslayan adreslere izin
  verilir (baska bir adres denenirse reddedilir).
- **Ses seviyesi**: `setSystemVolumePercent()` sadece Windows'ta calisir; Windows'un
  yerlesik Core Audio API'sini PowerShell uzerinden kullanir (nircmd gibi ekstra bir
  program kurulumu GEREKMEZ). Deger her zaman 0-100 arasina sinirlandirilir.
- Ikisi de `child_process` ile yerel komut calistirdigi icin, bu API'lere
  (`/api/system/open-youtube`, `/api/system/volume`) disaridan/agdan erisimi
  olabilecek bir ortamda **calistirmamalisin** - varsayilan olarak sadece
  `localhost` uzerinden erisilebilir oldugu icin (Express sunucusu disariya acik
  degil) bu risk normal kullanimda yok, ama bunu bilerek unutma.

## Kod yamalari: otomatik hazirlanir, insan onayiyla uygulanir

Asistan bir hatayi/eksigi fark edip kodunu duzeltmek istediginde, tam degisikligi
(hedef dosya + yeni icerik + aciklama + diff) otomatik olarak hazirlar ama **hicbir
zaman dogrudan dosyaya yazmaz**. Web arayuzundeki "Bekleyen Kod Yamalari" panelinde
diff'i gorup "Onayla ve Uygula" ya da "Reddet" ile karar verirsin; sadece bu tikla
gercek dosya guncellenir.

Bu tasarim bilinclidir:
- Web arastirmasi acilirsa, kotu niyetli bir sayfanin icerigi "kodunu soyle
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

## Maliyet kontrolu

`.env` dosyasinda `GEMINI_API_KEY` bos birakilirsa **Ollama** (yerel, API anahtari
gerektirmeyen) kullanilir - hicbir hesap ya da ucret olusmaz. `GEMINI_API_KEY`
girersen **Google Gemini'nin ucretsiz katmani** kullanilir - kredi karti gerekmez,
normal kisisel kullanimda ucret olusmaz (sadece dakika/gun basina istek sayisi
sinirlidir). Sesli motoru de "Tarayici (ucretsiz)" modunda tutarsan, her iki
durumda da tum sistem tamamen ucretsiz calisir.

`LLM_PROVIDER=anthropic` ile Claude'a gecersen (daha guclu ama ucretli), proje yine
maliyeti dusuk tutacak onlemler icerir:
- **Ucuz model varsayilan**: `CLAUDE_MODEL` varsayilani `claude-haiku-4-5-20251001`
  (Sonnet'e gore cok daha ucuz). `.env`'de `CLAUDE_MODEL=claude-sonnet-5` ile daha iyi
  kaliteye gecebilirsin, ama bu daha pahalidir.
- **Gorunmez arka plan cagrilari her zaman ucuz model kullanir**: Her mesajdan sonra
  sessizce calisan hafiza cikarma ve kendini gelistirme/yama taslagi adimlari
  `CLAUDE_BACKGROUND_MODEL` (varsayilan yine Haiku) ile calisir.
- **Web aramasi varsayilan kapali** (`ENABLE_WEB_SEARCH=false`): acilirsa hem token
  hem arama basina ekstra ucret ekler.
- **Kisa cevap siniri**: `CHAT_MAX_TOKENS` (varsayilan 400) sesli cevaplarin uzunlugunu
  ve dolayisiyla maliyetini sinirlar.
- **Prompt caching**: sistem promptu `cache_control` ile isaretlenir; Anthropic ayni
  promptu art arda gelen isteklerde tam fiyattan degil, cok daha ucuza isler.
- Claude kullanirken **sabit harcama limiti koy**: console.anthropic.com/settings/limits
  uzerinden aylik/gunluk bir ust sinir belirleyebilirsin.
- **Kullanimi takip et**: console.anthropic.com/settings/usage (Claude) ya da
  aistudio.google.com (Gemini) guncel kullanimi gosterir.

## Kurulum

### Secenek A: Hicbir API anahtari girmeden (Ollama)

```bash
# 1) ollama.com adresinden Ollama'yi indir/kur, sonra bir model indir:
ollama run llama3.1
# 2) Jarvis'i kur ve calistir - .env dosyasina DOKUNMANA GEREK YOK:
npm install
cp .env.example .env
npm start
```

Terminaldeki `[llm] kullanilan saglayici: ollama` satiri Ollama'nin devrede
oldugunu dogrular. Ollama uygulamasi kapaliysa ya da model indirilmemisse
sohbet hata verir; `ollama run llama3.1` komutunu calistirip acik birakman
yeterli (Ollama arka planda `ollama serve` ile API'yi ayaga kaldirir).

### Secenek B: Google Gemini (ucretsiz ama API anahtari ister)

```bash
npm install
cp .env.example .env
# .env dosyasina GEMINI_API_KEY degerini gir (aistudio.google.com/apikey - ucretsiz)
npm start        # ya da: npm run dev (kod yamasi onayladiktan sonra canli yeniler)
```

Sonra tarayicida `http://localhost:3000` adresini ac. Sesli motoru "Tarayici
(ucretsiz)" modunda tutarsan, her iki secenekte de tum sistem tamamen ucretsiz
calisir; `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` girmene sadece o motorlara
gecersen gerekir.

## Gerekli API anahtarlari

| Degisken | Ne icin | Nereden alinir |
|---|---|---|
| *(hicbiri)* | Sohbet, Ollama ile - API anahtari GEREKMEZ | ollama.com (yerel kurulum) |
| `GEMINI_API_KEY` | Sohbet, Gemini ile - ucretsiz ama anahtar ister | aistudio.google.com/apikey |
| `ANTHROPIC_API_KEY` | Sadece `LLM_PROVIDER=anthropic` ise: sohbet + web arama - ucretli | console.anthropic.com |
| `OPENAI_API_KEY` | "OpenAI" ses modu (Whisper+TTS) ve/ya `LLM_PROVIDER=openai` (sohbet) icin - ucretli | platform.openai.com |

`.env` icindeki `LLM_PROVIDER`, `GEMINI_MODEL`, `OLLAMA_HOST`, `OLLAMA_MODEL`,
`CLAUDE_MODEL`, `CLAUDE_BACKGROUND_MODEL`, `CHAT_MAX_TOKENS`, `TTS_VOICE`,
`ENABLE_WEB_SEARCH` ve `WEB_SEARCH_MAX_USES` degerleri istege bagli olarak
degistirilebilir; `.env.example` her birini aciklar.

## Proje yapisi

```
src/
  server.js              Express uygulamasi, route'lari baglar
  lib/llm.js             Saglayicidan bagimsiz sohbet cagrisi (Ollama/Gemini/Claude secimi)
  lib/gemini.js          Google Gemini API istemcisi (ucretsiz katman)
  lib/ollama.js          Yerel Ollama istemcisi (API anahtari GEREKMEZ)
  lib/anthropic.js       Claude Messages API istemcisi (+ web_search araci)
  lib/openai.js          Whisper (STT) + TTS + sohbet (LLM_PROVIDER=openai) API istemcisi
  lib/systemControl.js   Yerel bilgisayarda Chrome acma + (Windows) sistem sesi ayarlama
  lib/youtube.js          YouTube video ID cikarma + altyazi/transkript cekme (youtubei.js)
  routes/
    transcribe.js        POST /api/transcribe        - ses -> metin
    chat.js               POST /api/chat              - metin -> LLM cevabi
    speak.js              POST /api/speak              - metin -> ses
    selfImprove.js        POST /api/self-improve       - kendini gelistirme analizi
    state.js               GET  /api/state              - hafiza + persona notlarini okur
    patches.js             GET  /api/patches            - bekleyen/islenmis yamalar
                           POST /api/patches/:id/apply  - yamayi ONAYLA ve dosyaya yaz
                           POST /api/patches/:id/reject - yamayi reddet
    system.js              POST /api/system/open-youtube - yerel bilgisayarda Chrome ac
                           POST /api/system/volume       - (Windows) sistem sesini ayarla
    youtube.js              POST /api/youtube/summarize  - video altyazisini ozetle
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
