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
- **X gündemi sekmesi:** X Türkiye gündeminin 20 başlığı ve her birinin altında sitedeki ilgili haberler. Etiketler kelimelerine ayrılır (#TümMağdurlar → tüm mağdurlar), Türkçe karakterler sadeleştirilerek eşleştirilir; sayılı kısa başlıklar (GTA 6) birebir aranır.
- **X’te gündem:** X Türkiye gündeminin ilk 20 başlığı (`scripts/xtrends.mjs`). X’in resmi API’si ücretli olduğu için veri, gündemi herkese açık listeleyen trends24.in’den okunur; o site yapısını değiştirirse bu bölüm kendiliğinden gizlenir. Sitede ilgili haber varsa başlığın yanında “N haber” düğmesi çıkar.
- **Son depremler:** AFAD’ın herkese açık servisinden son 48 saatin depremleri (`scripts/quakes.mjs`). Şehrim sekmesinde ve geniş ekranda yan sütunda listelenir; seçili şehre uzaklık gösterilir. Son 6 saatte 4,5 ve üzeri ya da şehrine 100 km içinde 3,5 ve üzeri bir deprem olursa akışın üstünde uyarı çıkar.
- **Bildirimler:** Bir olayı 5 ya da daha fazla kaynak verdiğinde ve 5,0 ve üzeri deprem olduğunda ntfy.sh üzerinden bildirim gönderilir (`scripts/notify.mjs`). Eşikler ve konu adı `feeds.json` içindeki `notify` bölümünde. Aynı olay iki kez gönderilmesin diye yayındaki bir önceki `news.json` okunur. Ntfy konuları herkese açıktır: konu adını bilen herkes abone olabilir ya da mesaj gönderebilir.
- **Özü satırı:** Tık tuzağı başlıkların altına haberin asıl bilgisini tek cümleyle yazar (`scripts/summarize.mjs`). Haber sayfasının ilk paragrafları Google Gemini’nin ücretsiz katmanına 10’arlı gruplar halinde gönderilir; tur başına en fazla 3, günde en fazla 400 istek. Anahtar repo ayarlarında `GEMINI_API_KEY` secret’ı olarak durur. Sınır dolarsa ya da anahtar yoksa site özetsiz çalışmaya devam eder.
- **Kaynak dağılımı ve Kör nokta:** Birden çok etiketli kaynağın verdiği haberlerde, haberi hangi kesimden kaynakların verdiğini gösteren çubuk (Ground News’teki “bias bar” benzeri). Etiketler (`hukumet`, `bagimsiz`, `muhalefet`) ve dayanakları `feeds.json` içinde her kaynağın `lean`, `leanNote`, `leanUrl` alanlarında; okuyucu Ayarlar’dan kendi cihazında değiştirebilir. Çubuk genişlikleri grup büyüklüğüne göre dengelenir. “Kör nokta” sekmesi, son 24 saatte yalnızca bir kesimin akışlarında görünen haberleri listeler.
- **Konu sayfaları:** “Gündemde” konularının her biri için ayrı sayfa (`#konu-…`): Gemini ile 2–3 cümlelik tarafsız özet, konunun tüm haberlerinin kaynak dağılımı, “Kim nasıl verdi?” bölümünde hükümete yakın, bağımsız ve muhalefete yakın kaynakların başlıkları yan yana ve zaman sırasına göre tüm haberler. Özetler önbellekte tutulur; konuya en az 2 yeni haber eklendiğinde ya da 3 saatte bir yenilenir.
- **Paylaş ve haber menüsü:** Her haberin yanında Kaydet, Paylaş (telefonda paylaşım menüsü, bilgisayarda bağlantıyı kopyalar; başlık ve “Özü” cümlesiyle) ve “…” menüsü: kaynağında aç, konuya git, okundu/okunmadı, bu kaynağı gizle, özette hata bildir. Hata bildirimleri `feeds.json` içindeki `notify.reportTopic` ntfy konusuna gider.
- **Oyunlar / Kelime Harmanı:** Wordle benzeri günlük Türkçe kelime oyunu (`#oyun-kelime`). Günün kelimesi, son 36 saatin haberlerinde en az iki farklı haberde geçen 5 harfli sözlük kelimelerinden seçilir (`scripts/wordgame.mjs`); gün boyunca sabit kalır ve son 120 gün içinde tekrar etmez. Çözünce kelimenin geçtiği haberler gösterilir. İstatistik ve seri bilgisi okuyucunun cihazında tutulur. Kelime listesi `public/games/kelimeler.json`, Vikisözlük’ten derlenmiştir (CC BY-SA 4.0).
- **Diğer günlük oyunlar** (`scripts/games.mjs`, Türkiye saatiyle günde bir kez üretilir):
  - **Manşet Tamamla:** Günün manşetlerinden gizlenen bir kelime ya da özel isim, dört seçenekle.
  - **Rakam Avı:** Başlıktaki sayı gizlenir; %5, %20, %50 yakınlığa göre 3/2/1 puan.
  - **Hangi Kaynak?:** Tek kaynaklı bir başlığı hangi sitenin attığı, dört seçenekle.
  - **Petek:** 7 harf, ortadaki harf zorunlu; en az 4 harfli kelimeler, 7 harfin hepsini kullanan kelimeye +7 puan. Sözlük `data/sozluk.json` (Vikisözlük, CC BY-SA 4.0).
  Ölüm, kaza, şiddet gibi acı haberler oyun sorusu olarak seçilmez.
- **Yapay zekâ sekmesi:** Tüm kaynaklardan başlığında ya da özetinde yapay zekâ geçen haberler (yapay zekâ, ChatGPT, OpenAI, Gemini, Claude, Anthropic, Copilot, deepfake vb.).
- **Şehrim:** Önce ülke seçilir (varsayılan Türkiye). Türkiye’de 81 il listesinden, diğer ülkelerde Open-Meteo şehir aramasıyla (Türkçe adlarla: Londra, Moskova) seçilen şehir için Open-Meteo’dan hava durumu (anlık ve 5 günlük) ve ulusal kaynaklarda şehrin adı geçen haberler. Seçim cihazda saklanır.
- **Namaz vakitleri:** Şehrim’de seçili şehir için günün altı vakti ve sıradaki vakte kalan süre; şeritte sıradaki vakit. Veri Aladhan API’den; Türkiye’de Diyanet hesaplama yöntemi (Diyanet’in yayımladığı vakitlerden 1–2 dakika farklı olabilir), diğer ülkelerde Müslüman Dünya Birliği yöntemi.
- **Uygulama olarak kurulum (PWA):** Telefonda “Ana ekrana ekle” ile uygulama gibi açılır; internet yokken son indirilen haberler gösterilir.
- Hata veren akışlar 3 saniye sonra bir kez daha denenir; bozuk XML (tırnaksız öznitelik, kapanmamış etiket) otomatik düzeltilir.
- Kaynak aç/kapa, kategoriler, arama, kaydetme, okundu işareti, açık/koyu tema.

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
