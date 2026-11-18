// RSS kaynaklarını çeker, birleştirir ve public/news.json dosyasını üretir.
import Parser from "rss-parser";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const MAX_PER_FEED = 30;          // her akıştan en fazla
const MAX_AGE_HOURS = 48;         // bundan eski haberler atılır
const MAX_TOTAL = 500;
const SUMMARY_LEN = 220;

const config = JSON.parse(await readFile(new URL("../feeds.json", import.meta.url), "utf8"));

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9"
  },
  customFields: { item: [["media:content", "mediaContent", { keepArray: true }], ["media:thumbnail", "mediaThumb"], ["image", "image"]] }
});

// URL yolundaki ve RSS kategorilerindeki ipuçlarıyla kategori tahmini
const RULES = [
  ["spor",      /\b(spor|futbol|basketbol|voleybol|super-?lig|süper lig|transfer)\b/i],
  ["ekonomi",   /\b(ekonomi|finans|borsa|piyasa|dolar|altin|altın|enflasyon|is-dunyasi|iş dünyası)\b/i],
  ["dunya",     /\b(dunya|dünya|world|uluslararasi|uluslararası)\b/i],
  ["teknoloji", /\b(teknoloji|tekno|bilim|bilim-teknoloji|yapay-zeka|yapay zeka|oyun|otomobil)\b/i],
  ["siyaset",   /\b(siyaset|politika|meclis|tbmm|secim|seçim)\b/i],
];
function guessCategory(item, fallback) {
  if (fallback !== "gundem") return fallback;
  let path = "";
  try { path = new URL(item.link).pathname.split("/").slice(0, 3).join(" "); } catch {}
  const cats = (item.categories || []).map(c => (typeof c === "string" ? c : c?._ || "")).join(" ");
  const hay = (path + " " + cats).replace(/[-_]/g, " ");
  for (const [cat, re] of RULES) if (re.test(hay)) return cat;
  return fallback;
}

function pickImage(item) {
  const fromArr = a => Array.isArray(a) ? a.map(x => x?.$?.url).find(Boolean) : null;
  return item.enclosure?.url && /image|jpe?g|png|webp/i.test(item.enclosure.type || item.enclosure.url) ? item.enclosure.url
    : fromArr(item.mediaContent)
    || item.mediaThumb?.$?.url
    || (typeof item.image === "string" ? item.image : item.image?.url)
    || (item.content || item["content:encoded"] || "").match(/<img[^>]+src=["']([^"']+)/i)?.[1]
    || null;
}

function clean(text = "") {
  const t = text.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return t.length > SUMMARY_LEN ? t.slice(0, SUMMARY_LEN).replace(/\s+\S*$/, "") + "…" : t;
}
const norm = s => s.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

const cutoff = Date.now() - MAX_AGE_HOURS * 3600e3;
const errors = [];

const results = await Promise.allSettled(config.feeds.map(async f => {
  const feed = await Promise.race([
    parser.parseURL(f.url),
    new Promise((_, reject) => setTimeout(() => reject(new Error("zaman aşımı")), 25000))
  ]);
  return feed.items.slice(0, MAX_PER_FEED).map(it => {
    const date = new Date(it.isoDate || it.pubDate || Date.now());
    return {
      title: clean(it.title || ""),
      summary: clean(it.contentSnippet || it.summary || it.content || ""),
      url: it.link,
      image: pickImage(it),
      source: f.source,
      category: guessCategory(it, f.category),
      date: isNaN(date) ? new Date().toISOString() : date.toISOString()
    };
  });
}));

const seen = new Set();
let items = [];
results.forEach((r, i) => {
  if (r.status === "rejected") { errors.push({ url: config.feeds[i].url, error: String(r.reason?.message || r.reason) }); return; }
  for (const it of r.value) {
    if (!it.title || !it.url) continue;
    if (new Date(it.date).getTime() < cutoff) continue;
    const key = norm(it.title);
    if (seen.has(key) || seen.has(it.url)) continue;
    seen.add(key); seen.add(it.url);
    if (it.summary && norm(it.summary) === key) it.summary = "";
    items.push(it);
  }
});
items.sort((a, b) => b.date.localeCompare(a.date));
items = items.slice(0, MAX_TOTAL).map((it, i) => ({ id: i.toString(36) + "-" + it.source, ...it }));

await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await writeFile(new URL("../public/news.json", import.meta.url),
  JSON.stringify({ updatedAt: new Date().toISOString(), sources: config.sources, items, errors }));

console.log(`${items.length} haber yazıldı, ${errors.length} akış hata verdi.`);
errors.forEach(e => console.log("  ✗", e.url, "→", e.error));
// Açık kalan bağlantılar yüzünden işlem asılı kalmasın
process.exit(0);
