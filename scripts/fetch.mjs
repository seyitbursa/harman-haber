// RSS kaynaklarını çeker, birleştirir ve public/news.json dosyasını üretir.
import Parser from "rss-parser";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { cluster } from "./cluster.mjs";
import { getMarkets } from "./markets.mjs";
import { trendingTopics } from "./topics.mjs";
import { getXTrends } from "./xtrends.mjs";
import { getQuakes } from "./quakes.mjs";
import { notify, previousJson } from "./notify.mjs";
import { addGists, addTopicSummaries } from "./summarize.mjs";
import { dailyWord } from "./wordgame.mjs";
import { dailyGames } from "./games.mjs";
import { getYoutube } from "./youtube.mjs";
import { getSports } from "./sports.mjs";
import { buildStatic } from "./static.mjs";
import { socialPost } from "./social.mjs";

const MAX_PER_FEED = 30;          // her akıştan en fazla
const MAX_AGE_HOURS = 48;         // bundan eski haberler atılır
const MAX_TOTAL = 900;
const SUMMARY_LEN = 220;

const config = JSON.parse(await readFile(new URL("../feeds.json", import.meta.url), "utf8"));

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9"
};
const parser = new Parser({
  customFields: { item: [["media:content", "mediaContent", { keepArray: true }], ["media:thumbnail", "mediaThumb"], ["image", "image"]] }
});

// URL yolundaki ve RSS kategorilerindeki ipuçlarıyla kategori tahmini
const RULES = [
  ["spor",      /\b(spor|futbol|basketbol|voleybol|super-?lig|süper lig|transfer)\b/i],
  ["ekonomi",   /\b(ekonomi|finans|borsa|piyasa|dolar|altin|altın|enflasyon|is-dunyasi|iş dünyası)\b/i],
  ["dunya",     /\b(dunya|dünya|world|uluslararasi|uluslararası)\b/i],
  ["teknoloji", /\b(teknoloji|tekno|bilim|bilim-teknoloji|yapay-zeka|yapay zeka|otomobil)\b/i],
  ["siyaset",   /\b(siyaset|politika|meclis|tbmm|secim|seçim)\b/i],
];
// Yapay zekâ haberleri tüm akışlardan ayıklanır (başlıkta ya da özetin ilk cümlesinde geçiyorsa)
const AI = /(yapay\s*zek[aâ]|\bAI\b|\bA\.I\.|chatgpt|openai|\bgemini\b|\bclaude\b|anthropic|copilot|\bllm\b|dil modeli|makine öğren|derin öğren|deepfake|deepseek|\bgrok\b|mistral ai|\bsora\b|nöral ağ|üretken zek|t3ai|yapay genel zek)/i;
function guessCategory(item, fallback) {
  if (AI.test(item.title || "") || /yapay\s*zek[aâ]/i.test((item.contentSnippet || "").split(/[.!?…]\s/)[0])) return "yapayzeka";
  if (fallback !== "gundem") return fallback;
  let path = "";
  try { path = new URL(item.link).pathname.split("/").slice(0, 3).join(" "); } catch {}
  const cats = (item.categories || []).map(c => (typeof c === "string" ? c : c?._ || "")).join(" ");
  const hay = (path + " " + cats).replace(/[-_]/g, " ");
  for (const [cat, re] of RULES) if (re.test(hay)) return cat;
  return fallback;
}

function sanitize(xml) {
  return xml
    .replace(/<(?!!\[CDATA\[|!--)[^>]+>/g, tag => tag.replace(/(\s[\w:-]+=)([^"'\s>][^\s>]*)/g, '$1"$2"'))
    .replace(/<\/enclosure>/g, "")
    .replace(/<enclosure([^>]*?)\/?>/g, "<enclosure$1/>")     // kapatılmamış enclosure etiketleri
    .replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[\da-fA-F]+);)/g, "&amp;");
}
const absolute = u => (typeof u === "string" && u.startsWith("//")) ? "https:" + u : u;

function pickImage(item) {
  const fromArr = a => Array.isArray(a) ? a.map(x => x?.$?.url).find(Boolean) : null;
  return item.enclosure?.url && /image|jpe?g|png|webp/i.test(item.enclosure.type || item.enclosure.url) ? item.enclosure.url
    : fromArr(item.mediaContent)
    || item.mediaThumb?.$?.url
    || (typeof item.image === "string" ? item.image : item.image?.url)
    || (item.content || item["content:encoded"] || "").match(/<img[^>]+src=["']([^"']+)/i)?.[1]
    || null;
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", ndash: "–", mdash: "—" };
const decode = t => t
  .replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
function clean(text = "") {
  const t = decode(decode(text)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > SUMMARY_LEN ? t.slice(0, SUMMARY_LEN).replace(/\s+\S*$/, "") + "…" : t;
}
const norm = s => s.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();

// Saat dilimi belirtilmemiş tarihler ("2026-11-18 16:30:00") Türkiye saati kabul edilir; ileri tarihler şimdiye çekilir
function parseDate(pub, iso) {
  let d;
  if (pub && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(pub.trim())) d = new Date(pub.trim().replace(" ", "T") + "+03:00");
  else d = new Date(iso || pub || Date.now());
  if (isNaN(d)) d = new Date();
  return d > new Date() ? new Date() : d;
}

const cutoff = Date.now() - MAX_AGE_HOURS * 3600e3;
const errors = [];

const results = await Promise.allSettled(config.feeds.map(async f => {
  // Akışı kendimiz indirip küçük XML hatalarını (tırnaksız öznitelik, "//" ile başlayan adres) düzeltiyoruz
  const once = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const r = await fetch(f.url, { headers: HEADERS, signal: ctrl.signal, redirect: "follow" });
      if (!r.ok) throw new Error("Status code " + r.status);
      return parser.parseString(sanitize(await r.text()));
    } finally { clearTimeout(timer); }
  };
  // Bazı siteler (ör. Euronews) ara sıra isteği reddediyor: 3 saniye bekleyip bir kez daha dene
  let feed;
  try { feed = await once(); }
  catch { await new Promise(r => setTimeout(r, 3000)); feed = await once(); }
  // Google News akışları: başlıktaki " - Kaynak" ekini at, HTML bağlantı listesi olan özeti kullanma
  if (f.gnews) feed.items.forEach(it => {
    it.title = (it.title || "").replace(new RegExp("\\s+-\\s+[^-]*" + (f.suffix ? "" : "") + "$"), "").trim();
    it.contentSnippet = ""; it.content = ""; it.summary = "";
  });
  return feed.items.slice(0, MAX_PER_FEED).map(it => {
    const date = parseDate(it.pubDate, it.isoDate);
    return {
      title: clean(it.title || ""),
      summary: clean(it.contentSnippet || it.summary || it.content || ""),
      url: absolute(it.link),
      image: absolute(pickImage(it)),
      source: f.source,
      category: guessCategory(it, f.category),
      date: date.toISOString()
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
items = items.slice(0, MAX_TOTAL);

// Aynı olayı veren haberleri tek "hikâye" altında topla.
// İlk sıradaki haber kartta gösterilir: görseli ve özeti olanlar öne alınır.
const richness = it => (it.image ? 2 : 0) + (it.summary ? 1 : 0);
const stories = cluster(items).map((group, i) => {
  const members = [...group].sort((a, b) => richness(b) - richness(a) || b.date.localeCompare(a.date));
  const cats = members.map(m => m.category).filter(c => c !== "gundem");
  const category = cats.length ? cats.sort((a, b) => cats.filter(c => c === b).length - cats.filter(c => c === a).length)[0] : "gundem";
  return {
    id: i.toString(36),
    category,
    date: group.map(m => m.date).sort().at(-1),
    items: members.map(({ category: _c, ...rest }) => rest)
  };
}).sort((a, b) => b.date.localeCompare(a.date));

const [markets, xtrends, quakes, prevJson] = await Promise.all([getMarkets(), getXTrends(), getQuakes(), previousJson()]);
const prev = prevJson?.notified || null;     // eski sürümde durum yoksa ilk çalıştırma sayılır
const sum = await addGists({ stories, prevGists: prevJson?.gists, prevUsage: prevJson?.gistUsage, key: process.env.GEMINI_API_KEY });

// Gündemdeki konular ve her konunun haberleri (konu sayfaları için)
const topics = trendingTopics(stories, { max: 10 });
const twords = t => t.toLocaleLowerCase("tr").replace(/['’‘`]/g, " ").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const slugify = t => t.toLocaleLowerCase("tr").replace(/ç/g,"c").replace(/ğ/g,"g").replace(/ı/g,"i").replace(/ö/g,"o").replace(/ş/g,"s").replace(/ü/g,"u").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
for (const t of topics) {
  const ws = twords(t.label).map(w => w.slice(0, Math.min(w.length, 6)));
  t.slug = slugify(t.label);
  t.storyIds = stories.filter(s => s.items.some(i => { const tw = twords(i.title + " " + (i.gist || "")); return ws.every(p => tw.some(x => x.startsWith(p))); })).map(s => s.id);
}
// Aynı haberleri kapsayan konuları birleştir ("Cem Küçük" ve "Tahir Sarıkaya" gibi): öndeki kalır
for (let i = topics.length - 1; i > 0; i--) {
  const mine = new Set(topics[i].storyIds);
  if (!mine.size) { topics.splice(i, 1); continue; }
  const dup = topics.slice(0, i).some(t => t.storyIds.filter(id => mine.has(id)).length / mine.size >= 0.6);
  if (dup) topics.splice(i, 1);
}
const youtube = config.youtube ? await getYoutube({ channels: config.youtube, stories }) : null;
const sports = await getSports({ stories }).catch(e => ({ errors: [String(e)] }));
const game = { kelime: await dailyWord({ stories, prevGame: prevJson?.game?.kelime }), gunluk: await dailyGames({ stories, sources: config.sources, prev: prevJson?.game?.gunluk }) };
const topicSums = await addTopicSummaries({ topics, stories, sources: config.sources, prevTopicSums: prevJson?.topicSums, usage: sum.usage, key: process.env.GEMINI_API_KEY });
const cfg = config.notify || {};
const note = cfg.ntfyTopic
  ? await notify({ cfg, stories, quakes, sources: config.sources, prev, dryRun: !process.env.GITHUB_ACTIONS })
  : { state: null, sent: [], first: false };


await mkdir(new URL("../public/", import.meta.url), { recursive: true });
const soc = await socialPost({ stories, topics, sources: config.sources, prev: prevJson?.social, dry: !process.env.GITHUB_ACTIONS || !prevJson }).catch(e => ({ state: prevJson?.social || {}, sent: ["HATA " + e.message] }));
const stat = await buildStatic({ stories, topics, sources: config.sources, prev: prevJson }).catch(e => { console.log("  ✗ sabit sayfalar → " + e.message); return { topicPages: prevJson?.topicPages || {}, archive: prevJson?.archive || [], count: 0 }; });
await writeFile(new URL("../public/news.json", import.meta.url),
  JSON.stringify({ version: 3, leanInfo: config.leanInfo || null, updatedAt: new Date().toISOString(), sources: config.sources, markets, topics, xtrends, quakes,
    notify: cfg.ntfyTopic ? { topic: cfg.ntfyTopic, minSources: cfg.minSources, minQuake: cfg.minQuake, reportTopic: cfg.reportTopic || null } : null,
    notified: note.state, gists: sum.gists, gistUsage: sum.usage, topicSums, game, youtube, sports, topicPages: stat.topicPages, archive: stat.archive, social: soc.state, stories, errors }));

const multi = stories.filter(s => s.items.length > 1).length;
console.log(`${items.length} haber, ${stories.length} hikâye (${multi} tanesi birden çok kaynaktan), piyasa: ${markets.source || "yok"}, ${topics.length} gündem konusu, X gündeminde ${xtrends.items.length} başlık; ${errors.length} akış hata verdi.`);
errors.forEach(e => console.log("  ✗", e.url, "→", e.error));
if (markets.error) console.log("  ✗ piyasa →", markets.error);
if (xtrends.error) console.log("  ✗ X gündemi →", xtrends.error);
console.log(`Özet: bu turda ${sum.made} yeni, bekleyen ${sum.pending}, bugün ${sum.usage.requests} istek${sum.usage.model ? " (" + sum.usage.model + ")" : ""}${process.env.GEMINI_API_KEY ? "" : " — GEMINI_API_KEY yok"}.`);
if (soc.sent.length) console.log("Sosyal medya: " + soc.sent.join(", "));
console.log(`Sabit sayfalar: ${stat.count} sayfa (konu ve günlük gündem), site haritası ve RSS.`);
console.log(`Spor: ${sports.standings?.length || 0} takım, ${sports.matches?.length || 0} lig maçı, ${sports.europe?.length || 0} Avrupa maçı${sports.errors?.length ? "; hatalar: " + sports.errors.join(", ") : ""}.`);
if (youtube) console.log(`YouTube: ${youtube.items.length} video, ${youtube.items.filter(v => v.story).length} tanesi haberlerle eşleşti${youtube.errors.length ? "; hatalar: " + youtube.errors.join(", ") : ""}.`);
console.log(`Depremler: ${quakes.items.length}${quakes.error ? " (hata: " + quakes.error + ")" : ""}. Bildirim: ${note.first ? "ilk çalıştırma, yalnızca işaretlendi" : note.sent.length ? note.sent.join(" | ") : "yok"}`);

// Açık kalan bağlantılar yüzünden işlem asılı kalmasın
process.exit(0);
