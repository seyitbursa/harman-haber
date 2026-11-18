# Gündem Kutusu

Türk haber sitelerinin RSS akışlarını toplayıp tek sayfada gösteren, sunucusuz ve ücretsiz çalışan bir gündem sitesi.

## Nasıl çalışır?

GitHub Actions her ~15 dakikada bir `scripts/fetch.mjs` dosyasını çalıştırır. Betik `feeds.json` içindeki akışları çeker, tekrar eden haberleri ayıklar, kategorilere ayırır ve `public/news.json` dosyasını üretir. Ardından `public/` klasörü GitHub Pages’e yayınlanır. Sayfa her 5 dakikada bir bu dosyayı kontrol eder ve yeni haber varsa haber verir.

Sunucu, veritabanı ya da ücretli servis yok. Repo **public** olduğu sürece GitHub Actions dakikaları sınırsızdır.

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
