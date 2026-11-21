# Harman Haber

*Haberin özü, her kaynaktan.*

Türk haber sitelerinin RSS akışlarını toplayıp bir olayı kimin nasıl verdiğini yan yana gösteren, sunucusuz ve ücretsiz çalışan bir gündem sitesi.

## Nasıl çalışır?

GitHub Actions her ~15 dakikada bir `scripts/fetch.mjs` dosyasını çalıştırır. Betik `feeds.json` içindeki akışları çeker, tekrar eden haberleri ayıklar, kategorilere ayırır ve `public/news.json` dosyasını üretir. Ardından `public/` klasörü GitHub Pages’e yayınlanır. Sayfa her 5 dakikada bir bu dosyayı kontrol eder ve yeni haber varsa haber verir.

Sunucu, veritabanı ya da ücretli servis yok. Repo **public** olduğu sürece GitHub Actions dakikaları sınırsızdır.

## Özellikler

- **Aynı haber, farklı kaynaklar:** Aynı olayı veren haberler tek kartta toplanır; "3 kaynak daha bu haberi verdi" satırına dokununca diğer kaynakların başlıkları açılır. Gruplama `scripts/cluster.mjs` içinde, başlıklardaki ayırt edici kelimelere bakılarak yapılır. Fazla ya da az birleştiriyorsa `threshold` değerini (varsayılan 0.5) değiştir.
- **Manşet:** Son 12 saatte en çok kaynağın verdiği olay en üstte büyük kartta gösterilir.
- **Piyasa şeridi:** Dolar, euro, gram ve çeyrek altın, BIST 100. Veri Truncgil Finans’tan, o çalışmazsa Yahoo Finance’ten alınır (`scripts/markets.mjs`).
- **Gündemde:** Son 12 saatte en az 3 kaynağın bahsettiği konular üstte etiket olarak gösterilir (`scripts/topics.mjs`); dokununca o konunun haberleri süzülür.
- **YouTube sekmesi:** `feeds.json` içindeki `youtube` listesindeki haber kanallarının son 36 saatteki videoları (kanalların herkese açık RSS akışından, API anahtarı gerekmez; `scripts/youtube.mjs`). Her kanaldan en çok izlenen 8 video ve 4 kısa video alınır; kısa videolar ayrı şeritte gösterilir. Videolar başlıklarındaki ayırt edici kelimelerle haberlere eşleştirilir; eşleşen haberlerde “YouTube’da N video” düğmesi ve konu sayfalarında “YouTube’da” bölümü çıkar. Videolar site içinde youtube-nocookie oynatıcısıyla açılır. Kanallar `type` alanıyla “kurum” ve “gazeteci” olarak ayrılır; gazeteci kanallarında son 7 gün alınır, bu kanallar siyasi olarak etiketlenmez. Okuyucu Ayarlar → YouTube kanalları bölümünden istediği kanalı kapatabilir.
- **İnternet gündemi:** X gündemine ek olarak Google’da en çok arananlar (Google Trends Türkiye RSS) ve Türkçe Vikipedi’de dün en çok okunan maddeler (Wikimedia pageviews; iki hafta önce de en üstte olan kalıcı maddeler ve müstehcen maddeler elenir) (`scripts/trends.mjs`). Birden çok listede geçen başlıklar işaretlenir.
- **X gündemi sekmesi:** X Türkiye gündeminin 20 başlığı ve her birinin altında sitedeki ilgili haberler. Etiketler kelimelerine ayrılır (#TümMağdurlar → tüm mağdurlar), Türkçe karakterler sadeleştirilerek eşleştirilir; sayılı kısa başlıklar (GTA 6) birebir aranır.
- **X’te gündem:** X Türkiye gündeminin ilk 20 başlığı (`scripts/xtrends.mjs`). X’in resmi API’si ücretli olduğu için veri, gündemi herkese açık listeleyen trends24.in’den okunur; o site yapısını değiştirirse bu bölüm kendiliğinden gizlenir. Sitede ilgili haber varsa başlığın yanında “N haber” düğmesi çıkar.
- **Son depremler:** AFAD’ın herkese açık servisinden son 48 saatin depremleri (`scripts/quakes.mjs`). Şehrim sekmesinde ve geniş ekranda yan sütunda listelenir; seçili şehre uzaklık gösterilir. Son 6 saatte 4,5 ve üzeri ya da şehrine 100 km içinde 3,5 ve üzeri bir deprem olursa akışın üstünde uyarı çıkar.
- **Bildirimler:** Bir olayı 5 ya da daha fazla kaynak verdiğinde ve 5,0 ve üzeri deprem olduğunda ntfy.sh üzerinden bildirim gönderilir (`scripts/notify.mjs`). Eşikler ve konu adı `feeds.json` içindeki `notify` bölümünde. Aynı olay iki kez gönderilmesin diye yayındaki bir önceki `news.json` okunur. Ntfy konuları herkese açıktır: konu adını bilen herkes abone olabilir ya da mesaj gönderebilir.
- **Özü satırı:** Tık tuzağı başlıkların altına haberin asıl bilgisini tek cümleyle yazar (`scripts/summarize.mjs`). Haber sayfasının ilk paragrafları Google Gemini’nin ücretsiz katmanına 10’arlı gruplar halinde gönderilir; tur başına en fazla 3, günde en fazla 400 istek. Anahtar repo ayarlarında `GEMINI_API_KEY` secret’ı olarak durur. Sınır dolarsa ya da anahtar yoksa site özetsiz çalışmaya devam eder.
- **Kaynak dağılımı ve Kör nokta:** Birden çok etiketli kaynağın verdiği haberlerde, haberi hangi kesimden kaynakların verdiğini gösteren çubuk (Ground News’teki “bias bar” benzeri). Etiketler (`hukumet`, `bagimsiz`, `muhalefet`) ve dayanakları `feeds.json` içinde her kaynağın `lean`, `leanNote`, `leanUrl` alanlarında; okuyucu Ayarlar’dan kendi cihazında değiştirebilir. Çubuk genişlikleri grup büyüklüğüne göre dengelenir. “Kör nokta” sekmesi, son 24 saatte yalnızca bir kesimin akışlarında görünen haberleri listeler.
- **Fark ne?:** Hükümete yakın kaynaklarla muhalefete yakın ya da bağımsız kaynakların birlikte verdiği olaylarda, grupların başlıklarda neyi farklı vurguladığı tek cümleyle (Gemini; tur başına 8 olay, 48 saat önbellek).
- **Resmî Gazete:** Günün sayısındaki düzenlemeler sade Türkçe başlık, özet, “kimi etkiler” ve önem derecesiyle (`scripts/resmigazete.mjs`, günde bir Gemini isteği). Sitede “Resmî Gazete” sekmesi, arama motorları için `/resmi-gazete/` ve 30 günlük arşiv sayfaları.
- **Gündemi dinle:** Günün en çok kaynağın verdiği 10 haberi, başlık ve “Özü” satırıyla cihazın kendi Türkçe sesiyle okur (Web Speech API; ücretsiz, sunucusuz).
- **Konu sayfaları:** “Gündemde” konularının her biri için ayrı sayfa (`#konu-…`): Gemini ile 2–3 cümlelik tarafsız özet, konunun tüm haberlerinin kaynak dağılımı, “Kim nasıl verdi?” bölümünde hükümete yakın, bağımsız ve muhalefete yakın kaynakların başlıkları yan yana ve zaman sırasına göre tüm haberler. Özetler önbellekte tutulur; konuya en az 2 yeni haber eklendiğinde ya da 3 saatte bir yenilenir.
- **Paylaş ve haber menüsü:** Her haberin yanında Kaydet, Paylaş (telefonda paylaşım menüsü, bilgisayarda bağlantıyı kopyalar; başlık ve “Özü” cümlesiyle) ve “…” menüsü: kaynağında aç, konuya git, okundu/okunmadı, bu kaynağı gizle, özette hata bildir. Hata bildirimleri `feeds.json` içindeki `notify.reportTopic` ntfy konusuna gider.
- **Oyunlar / Kelime Harmanı:** Wordle benzeri günlük Türkçe kelime oyunu (`#oyun-kelime`). Günün kelimesi, son 36 saatin haberlerinde en az iki farklı haberde geçen 5 harfli sözlük kelimelerinden seçilir (`scripts/wordgame.mjs`); gün boyunca sabit kalır ve son 120 gün içinde tekrar etmez. Çözünce kelimenin geçtiği haberler gösterilir. İstatistik ve seri bilgisi okuyucunun cihazında tutulur. Kelime listesi `public/games/kelimeler.json`, Vikisözlük’ten derlenmiştir (CC BY-SA 4.0).
- **Diğer günlük oyunlar** (`scripts/games.mjs`, Türkiye saatiyle günde bir kez üretilir):
  - **Manşet Tamamla:** Günün manşetlerinden gizlenen bir kelime ya da özel isim, dört seçenekle.
  - **Rakam Avı:** Başlıktaki sayı gizlenir; %5, %20, %50 yakınlığa göre 3/2/1 puan.
  - **Hangi Kaynak?:** Tek kaynaklı bir başlığı hangi sitenin attığı, dört seçenekle.
  - **Petek:** 7 harf, ortadaki harf zorunlu; en az 4 harfli kelimeler, 7 harfin hepsini kullanan kelimeye +7 puan. Sözlük `data/sozluk.json` (Vikisözlük, CC BY-SA 4.0).
  Ölüm, kaza, şiddet gibi acı haberler oyun sorusu olarak seçilmez.
- **NYT Games tarzı oyunlar** (`scripts/games2.mjs`):
  - **Bağlantılar:** 16 kelime, 4 grup. Kolay üç grup Gemini ile (günün rastgele seçilen kategorileriyle) üretilir ve ikinci bir istekle denetlenir; zor grup kodla kesin doğru olarak üretilir (haberlerde geçen kelimelerin içine saklanmış hayvan, sayı ya da renk adları).
  - **Harf Kutusu:** 4 kenar × 3 harf; iki kelimelik bir çözümü garanti edecek şekilde sözlükten algoritmayla kurulur, geçerli kelime listesi bulmacayla birlikte gönderilir.
  - **Sudoku:** Tarihe göre tohumlanan, tek çözümlü, 30 ipuçlu günlük bulmaca.
  - **Mini Bulmaca:** 5×5 çengel bulmaca (`scripts/mini.mjs`). Izgara, köşe siyah kare desenlerinden biriyle, sık kullanılan sözlük kelimelerinden (`data/mini-kelimeler.json`; sıklık verisi hermitdave/FrequencyWords, MIT) geri izleme algoritmasıyla doldurulur; kaba ve kırıcı kelimeler hariç tutulur. İpuçlarını Gemini yazar; eksik ipucu varsa o gün bulmaca yayınlanmaz.
- **Yapay zekâ sekmesi:** Tüm kaynaklardan başlığında ya da özetinde yapay zekâ geçen haberler (yapay zekâ, ChatGPT, OpenAI, Gemini, Claude, Anthropic, Copilot, deepfake vb.).
- **Şehrim:** Önce ülke seçilir (varsayılan Türkiye). Türkiye’de 81 il listesinden, diğer ülkelerde Open-Meteo şehir aramasıyla (Türkçe adlarla: Londra, Moskova) seçilen şehir için Open-Meteo’dan hava durumu (anlık ve 5 günlük) ve ulusal kaynaklarda şehrin adı geçen haberler. Seçim cihazda saklanır.
- **Spor:** Spor sekmesinin üstünde Süper Lig maçları (son iki hafta ve önümüzdeki günler), puan durumu ve Türk takımlarının Avrupa kupası maçları (`scripts/sports.mjs`). Veri ESPN’in açık veri adreslerinden gelir (resmi bir API değildir; erişilemezse bölüm gizlenir). Maç günü Spor sekmesi açıkken canlı skorlar tarayıcıdan dakikada bir yenilenir. Okuyucu Ayarlar → Takımım bölümünden takımını seçerse şeritte takımının canlı skoru, sıradaki maçı ya da son sonucu görünür.
- **Namaz vakitleri:** Şehrim’de seçili şehir için günün altı vakti ve sıradaki vakte kalan süre; şeritte sıradaki vakit. Veri Aladhan API’den; Türkiye’de Diyanet hesaplama yöntemi (Diyanet’in yayımladığı vakitlerden 1–2 dakika farklı olabilir), diğer ülkelerde Müslüman Dünya Birliği yöntemi.
- **Uygulama olarak kurulum (PWA):** Telefonda “Ana ekrana ekle” ile uygulama gibi açılır; internet yokken son indirilen haberler gösterilir.
- Hata veren akışlar 3 saniye sonra bir kez daha denenir; bozuk XML (tırnaksız öznitelik, kapanmamış etiket) otomatik düzeltilir.
- Kaynak aç/kapa, kategoriler, arama, kaydetme, okundu işareti, açık/koyu tema.

## Okur özellikleri (Kasım 2026)

- **Son ziyaretimden beri:** Okurun tıkladığı haberlerin zamanı cihazda saklanır; o olaya sonradan yeni kaynak eklenirse kartta “Sen okuduktan sonra” satırı çıkar.
- **Zaman çizelgesi:** Konu sayfasında en fazla 5 dönüm noktası (en eski, en yeni ve en çok kaynağın verdiği olaylar), tarih sırasıyla.
- **Kaynaklar neyi öne çıkardı?:** 4+ kaynaklı olaylarda başlıklar arasındaki 2–3 somut fark, ilgili yayınlar ve özgün başlıklarıyla (Gemini; “Fark ne?” ile aynı istekte).
- **Günün beş gelişmesi** (Keşfet): farklı konulardan beş olay; tek dokunuşla dinlenebilir.
- **Birincil kaynak:** Resmî Gazete’den söz eden ve düzenleme başlığıyla en az üç ayırt edici kelimeyi paylaşan haberlere asıl metin bağlantısı.
- **Konu takibi:** Konu sayfasındaki “Konuyu takip et” ile; Keşfet’te “Takip ettiklerim” altında yeni haber sayısıyla.
- **Paylaşılabilir karşılaştırma:** Seçilen iki yayının başlıklarıyla 1080×1350 görsel; `#k-<olay>-<yayın>-<yayın>` bağlantısı aynı karşılaştırmayı açar.
- **Yanlış eşleşme bildirimi:** Haber menüsünde “Bu haber bu konuya ait değil”; haber o cihazda konudan çıkarılır, bildirim ntfy geri bildirim konusuna gider.

## Gemini anahtarları

`GEMINI_API_KEY` asıl, `GEMINI_API_KEY_2` yedek anahtardır (ikisi de repo secret). İlk anahtar kota sınırına (429) takılırsa ya da geçersizse aynı istek yedekle yapılır. Yedek tanımlıyken günlük istek tavanı 400’den 800’e çıkar (`GEMINI_DAILY_CAP` ile değiştirilebilir). Google’ın kotası proje başınadır; yedek anahtar ancak farklı bir Google Cloud projesinden alındıysa ek kota sağlar.

## Kaynak ve doğrulama özellikleri (21 Kasım 2026)

- **Haber linkini karşılaştır:** Arama kutusuna yapıştırılan yayıncı bağlantısı, takip parametreleri (utm, fbclid…), mobil/AMP adres farkları temizlenerek kayıtlı haberlerle eşleştirilir; bulunursa karşılaştırma o yayın seçili açılır, bulunamazsa açıkça söylenir.
- **İlk kaynak** (`scripts/origin.mjs`): 3+ kaynaklı olaylarda haber sayfalarındaki AÇIK ajans imzaları (yapılandırılmış veride yazar olarak ajans, “(AA)”, “Kaynak: DHA”, “İHA muhabiri”) okunur: “9 yayın · 3’ü AA’ya atıf yapıyor”. Kanıt yoksa köken belirsiz bırakılır.
- **Sırada ne var?** (`data/takvim.json`): yalnızca resmî takvimden doğrulanmış tarihler (TCMB, TÜİK); kaynak, son kontrol günü ve takvime ekleme (.ics). Konu sayfalarında anahtar kelimeyle, Ekonomi sekmesinde genel liste. Tarih değişirse eskisi `eski` alanına yazılır.
- **Başlık değişim geçmişi:** Aynı adreste başlık değişirse (noktalama/harf büyüklüğü hariç) ilk ve son sürüm gözlem saatleriyle; “düzeltme” etiketi kullanılmaz.
- **Bu iddia incelendi mi?** (`scripts/factcheck.mjs`): Teyit analizleri haberlerle otomatik eşleştirilir ama yalnızca ADAY olur; yönetici sayfasında editör iddiayı ve sonucu yazıp onaylarsa (Worker `/onay`, D1 `onay` tablosu) haberin altında “🔎 Teyit” olarak görünür.

## Haber detay sayfası

Başlığa dokununca haber önce sitede (`#h-<olay>`) açılır: ortak başlık, görsel, “Özü”, 3+ kaynaklı olaylarda haber metninden çıkarılan 3–4 maddelik “Öne çıkanlar” (Gemini, `addHighlights`), kaynak dağılımı, gözlemler ve bütün kaynakların özgün başlıkları, ilk kaynak, başlık değişikliği, doğrulama, birincil belge, zaman çizelgesi, sırada ne var, YouTube videoları. Tam metin için belirgin “Haberin tamamını …’de oku” düğmesi kaynağa götürür; haber metni sitede yeniden yayımlanmaz. 3+ kaynaklı olayların detay sayfaları arama motorları için `/haber/<olay>/` adresinde sabit sayfa olarak da üretilir (7 gün saklanır, site haritasında); bu olayların paylaşım bağlantısı sabit sayfadır.

## Performans

- **Veri ayrımı:** `news.json` yalnızca sitenin kullandığı alanları içerir (gzip ~190 KB). İlk ekran için en yeni 40 hikâyeyi taşıyan `head.json` (gzip ~15 KB) paralel istenir ve önce çizilir. Sunucunun kendi hafızası (özet önbellekleri, arşivler, bildirim durumu) `state.json`’dadır; okuyucu bu dosyayı indirmez.
- **Önbellek:** Veri adreslerine zaman damgası eklenmez; tarayıcı ETag ile sorar, değişmediyse gövde yeniden indirilmez ve JSON yeniden işlenmez. Arka plan kontrolü yalnızca sekme görünürken yapılır.
- **Kod ayrımı:** `scripts/build.mjs` yayından önce stil ve betiği içerik sürümlü dosyalara (`app.<sürüm>.css/js`) taşır, oyun kodunu (`// @@OYUN{ … }` bölgeleri) `games.<sürüm>.js` olarak ayırır; oyunlar yalnızca Oyunlar açılınca yüklenir. Servis çalışanı sürümlü dosyaları önce önbellekten verir.

## Doğruluk güvenceleri

- **Konu eşleştirme** (`scripts/topics.mjs`): kısa kelimeler yalnızca ekli biçimleriyle eşleşir (fon ≠ fonksiyon); suç, soruşturma ve dava konularında ve konunun baskın kategorisinden farklı kategorideki haberlerde konu kelimelerinin hepsi başlıkta geçmelidir. Birden çok kişiyi kapsayan tek ad (ör. "Serdar") konu olamaz.
- **Aynı olayın birleştirilmesi** (`mergeByGist`, `scripts/cluster.mjs`): başlıkları farklı yazılmış haberler “Özü” özetlerinin benzerliği, ortak özel isimler ve 12 saatlik pencereyle tek olayda toplanır.
- **Ortak başlık**: 3 ve daha fazla kaynağın verdiği olaylarda kartta tek bir yayıncının başlığı yerine Gemini’nin yazdığı tarafsız “kim ne yaptı” başlığı gösterilir; her yayıncının özgün başlığı “başlıkları karşılaştır” panelinde.
- **Regresyon testleri** (`scripts/test.mjs`): her güncellemeden önce çalışır; başarısız olursa yayın yapılmaz.

## Arama motorları ve paylaşım

Uygulama tek sayfa olduğu için arama motorları içeriği göremez. Her güncellemede `scripts/static.mjs` şunları üretir:
- `/konu/<konu>/`: her gündem konusu için özet, “Kim nasıl verdi?” ve haber bağlantıları içeren sabit sayfa (14 gün saklanır).
- `/gundem/<tarih>/` ve `/gundem/`: son 30 günün günlük gündem arşivi.
- `/sitemap.xml`, `/robots.txt`, `/rss.xml`.
Konu paylaşımları bu sabit sayfaların adresini kullanır.

## Sosyal medyaya otomatik paylaşım (isteğe bağlı)

`scripts/social.mjs`, repo ayarlarında şu secret’lar tanımlıysa çalışır: `TELEGRAM_BOT_TOKEN` ve `TELEGRAM_CHAT_ID` (Telegram kanalı), `BSKY_HANDLE` ve `BSKY_APP_PASSWORD` (Bluesky). Her sabah 08.00’den sonra günün gündemini, gün içinde de 5 ve daha fazla kaynağın verdiği olayları (günde en fazla 4) paylaşır.

## Kullanım istatistikleri

`worker/sayac.js`, Cloudflare’de `harman-sayac` adlı Worker olarak çalışır ve `harman-sayac` D1 veritabanına yalnızca “gün + olay adı → sayı” yazar (IP, cihaz kimliği ya da kişisel veri tutulmaz). Site; günlük tekil cihaz (`ziyaret`), bölüm görüntülemeleri (`sayfa:…`), oyun açma/bitirme (`oyun:<oyun>:acildi|bitti`, Kelime Harmanı’nda kazanma ve deneme sayısı), paylaşımlar ve “Gündemi dinle” olaylarını gönderir. Yönetici özeti `https://harmanhaber.app/#istatistik` adresinde, Worker’daki `ADMIN_KEY` anahtarıyla görülür. Oyunlar sayfasındaki “Bugün N kişi oynadı” bilgisi `/public` uç noktasından gelir.

## Zamanlama

GitHub’ın kendi zamanlayıcısı (`schedule`) yoğun saatlerde saatlerce gecikebildiği için asıl tetikleme Cloudflare’den yapılır: `harman-tetikleyici` adlı Cloudflare Worker her 15 dakikada bu iş akışını `workflow_dispatch` ile başlatır. GitHub token’ı Worker’da `GH_TOKEN` gizli değişkeni olarak durur. GitHub zamanlayıcısı yedek olarak açık kalır. Token’ın süresi dolarsa Cloudflare panelinde Workers → harman-tetikleyici → Settings → Variables bölümünden `GH_TOKEN` güncellenir.

## Kurulum (5 dakika)

1. GitHub’da yeni bir **public** repo aç ve bu klasördeki her şeyi yükle (`.github` klasörü dahil).
2. Repo’da **Settings → Pages → Build and deployment → Source** kısmını **GitHub Actions** yap.
3. **Actions** sekmesinde “Haberleri güncelle ve yayınla” iş akışını seç, **Run workflow** ile ilk kez çalıştır.
4. Bitince site `https://KULLANICI_ADIN.github.io/REPO_ADI/` adresinde yayında.

## Yerelde denemek

```bash
npm install
npm run dev
```

## Kaynak eklemek / çıkarmak

RSS akışı olmayan ya da isteklerimizi reddeden siteler (Gazete Oksijen, T24, BBC Türkçe, Odatv, Independent Türkçe) Google Haberler’in site araması akışıyla (`"gnews": true`) alınır; bunlarda başlık ve bağlantı gelir, özet ve görsel gelmez.


`feeds.json` içinde `sources` kısmına kaynağı (ad, kısaltma, renk), `feeds` kısmına akış adresini ve varsayılan kategorisini ekle. Kategoriler: `gundem`, `siyaset`, `ekonomi`, `dunya`, `spor`, `yapayzeka`, `teknoloji`. Genel akışlarda kategori, haberin adresine ve RSS etiketlerine bakılarak tahmin edilir.

## Bilmen gerekenler

- GitHub, 60 gün boyunca hiç commit almayan repolarda zamanlanmış iş akışlarını durdurur. Arada bir commit at ya da Actions sekmesinden yeniden etkinleştir.
- Bir akış hata verirse diğerleri etkilenmez; hatalar `news.json` içindeki `errors` alanında ve Actions günlüğünde görünür.
- Başlık, kısa özet ve görseller yayıncıların kendi RSS akışlarından gelir ve her haber orijinal kaynağa bağlanır.
