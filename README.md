# Gündem Kutusu

Türk haber sitelerinin RSS akışlarını toplayıp tek sayfada gösteren, sunucusuz ve ücretsiz çalışan bir gündem sitesi.

## Nasıl çalışır?

GitHub Actions her ~15 dakikada bir `scripts/fetch.mjs` dosyasını çalıştırır. Betik `feeds.json` içindeki akışları çeker, tekrar eden haberleri ayıklar, kategorilere ayırır ve `public/news.json` dosyasını üretir. Ardından `public/` klasörü GitHub Pages’e yayınlanır. Sayfa her 5 dakikada bir bu dosyayı kontrol eder ve yeni haber varsa haber verir.

Sunucu, veritabanı ya da ücretli servis yok. Repo **public** olduğu sürece GitHub Actions dakikaları sınırsızdır.

## Özellikler

- **Aynı haber, farklı kaynaklar:** Aynı olayı veren haberler tek kartta toplanır; "3 kaynak daha bu haberi verdi" satırına dokununca diğer kaynakların başlıkları açılır. Gruplama `scripts/cluster.mjs` içinde, başlıklardaki ayırt edici kelimelere bakılarak yapılır. Fazla ya da az birleştiriyorsa `threshold` değerini (varsayılan 0.5) değiştir.
- **Manşet:** Son 12 saatte en çok kaynağın verdiği olay en üstte büyük kartta gösterilir.
- **Piyasa şeridi:** Dolar, euro, gram ve çeyrek altın, BIST 100. Veri Truncgil Finans’tan, o çalışmazsa Yahoo Finance’ten alınır (`scripts/markets.mjs`).
- **Gündemde:** Son 12 saatte en az 3 kaynağın bahsettiği konular üstte etiket olarak gösterilir (`scripts/topics.mjs`); dokununca o konunun haberleri süzülür.
- **X’te gündem:** X Türkiye gündeminin ilk 20 başlığı (`scripts/xtrends.mjs`). X’in resmi API’si ücretli olduğu için veri, gündemi herkese açık listeleyen trends24.in’den okunur; o site yapısını değiştirirse bu bölüm kendiliğinden gizlenir. Sitede ilgili haber varsa başlığın yanında “N haber” düğmesi çıkar.
- **Oyun sekmesi:** Oyungezer ve Merlin’in Kazanı akışları, ayrıca teknoloji ve genel akışlardaki oyun haberleri.
- **Şehrim:** 81 il arasından seçilen şehir için Open-Meteo’dan hava durumu (anlık ve 5 günlük) ve ulusal kaynaklarda şehrin adı geçen haberler. Seçim cihazda saklanır.
- **Uygulama olarak kurulum (PWA):** Telefonda “Ana ekrana ekle” ile uygulama gibi açılır; internet yokken son indirilen haberler gösterilir.
- Hata veren akışlar 3 saniye sonra bir kez daha denenir; bozuk XML (tırnaksız öznitelik, kapanmamış etiket) otomatik düzeltilir.
- Kaynak aç/kapa, kategoriler, arama, kaydetme, okundu işareti, açık/koyu tema.

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

`feeds.json` içinde `sources` kısmına kaynağı (ad, kısaltma, renk), `feeds` kısmına akış adresini ve varsayılan kategorisini ekle. Kategoriler: `gundem`, `siyaset`, `ekonomi`, `dunya`, `spor`, `teknoloji`. Genel akışlarda kategori, haberin adresine ve RSS etiketlerine bakılarak tahmin edilir.

## Bilmen gerekenler

- GitHub, 60 gün boyunca hiç commit almayan repolarda zamanlanmış iş akışlarını durdurur. Arada bir commit at ya da Actions sekmesinden yeniden etkinleştir.
- Bir akış hata verirse diğerleri etkilenmez; hatalar `news.json` içindeki `errors` alanında ve Actions günlüğünde görünür.
- Başlık, kısa özet ve görseller yayıncıların kendi RSS akışlarından gelir ve her haber orijinal kaynağa bağlanır.
