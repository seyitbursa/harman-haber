// YouTube haber gündemi: seçilmiş haber kanallarının son videoları (kanalların herkese açık RSS akışından).
// Videolar sitedeki haberlerle eşleştirilir; eşleşen habere "YouTube’da konuşuldu" bağlantısı eklenir.
const decode = t => t.replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const STOP = new Set("için olan gibi daha ile bir çok son yeni canlı izle video haber haberi açıklama açıkladı oldu sonra önce kadar şimdi bugün dakika flaş özel röportaj yayın program".split(" "));
const stem = w => w.slice(0, 5);
const STOPS = new Set([...STOP].map(stem));
function toks(t) {
  return new Set(t.toLocaleLowerCase("tr").replace(/['’‘][a-zçğıöşü]+/g, "").split(/[^a-zçğıöşü0-9]+/)
    .filter(w => w.length >= 4).map(stem).filter(w => !STOPS.has(w)));
}

async function channel(c) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${c.channelId}`, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (HarmanHaber)" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const xml = await r.text();
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
      const e = m[1], g = re => (e.match(re) || [])[1];
      return {
        id: g(/<yt:videoId>([^<]+)/),
        title: decode(g(/<title>([^<]*)/) || ""),
        date: g(/<published>([^<]+)/),
        views: parseInt(g(/<media:statistics views="(\d+)"/) || "0", 10),
        short: /youtube\.com\/shorts\//.test(g(/<link rel="alternate" href="([^"]+)"/) || ""),
        ch: c.key
      };
    }).filter(v => v.id && v.title);
  } finally { clearTimeout(timer); }
}

export async function getYoutube({ channels, stories, hours = 36, max = 320 }) {
  const errors = [];
  const res = await Promise.allSettled(channels.map(channel));
  const since = Date.now() - hours * 3600e3;
  let vids = [];
  res.forEach((r, i) => { if (r.status === "fulfilled") vids.push(...r.value); else errors.push(channels[i].name + ": " + (r.reason?.message || r.reason)); });
  // Shorts (dikey kısa videolar) ayrı tutulur: izlenme sıralamasını bozmasınlar
  const typeOf = Object.fromEntries(channels.map(c => [c.key, c.type || "kurum"]));
  const sinceJ = Date.now() - 7 * 24 * 3600e3;   // gazeteciler daha seyrek yayın yaptığı için 7 gün
  vids = vids.filter(v => new Date(v.date).getTime() >= (typeOf[v.ch] === "gazeteci" ? sinceJ : since)).map(({ short, ...v }) => (short || /#shorts?\b/i.test(v.title)) ? { ...v, s: 1 } : v);
  // Her kanaldan en çok izlenen 8 video ve 4 kısa video: büyük kanallar küçükleri listeden silmesin
  const per = new Map();
  vids.sort((a, b) => b.views - a.views).forEach(v => { const k = v.ch + (v.s ? "s" : ""), n = per.get(k) || 0; if (n < (v.s ? 4 : 8)){ per.set(k, n + 1); v.keep = true; } });
  vids = vids.filter(v => v.keep).map(({ keep, ...v }) => v).slice(0, max + 40);
  // Haberlerle eşleştir: nadir kelimelere ağırlık veren (IDF) benzerlik; en az iki ayırt edici ortak kelime
  const st = stories.map(s => ({ s, t: toks(s.items.map(i => i.title + " " + (i.gist || "")).join(" ")) }));
  const df = new Map(); st.forEach(x => x.t.forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const idf = w => Math.log(st.length / (df.get(w) || 1));
  for (const v of vids) {
    const vt = toks(v.title); let best = null, bestScore = 0;
    for (const x of st) {
      let score = 0, strong = 0;
      for (const w of vt) if (x.t.has(w)) { const f = idf(w); score += f; if (f > 3) strong++; }
      if (strong >= 2 && score >= 12 && score > bestScore) { best = x.s; bestScore = score; }
    }
    if (best) { v.story = best.id; (best.yt = best.yt || []).length < 4 && best.yt.push(v.id); }
  }
  return { at: new Date().toISOString(), channels: channels.map(c => ({ key: c.key, name: c.name, source: c.source, type: c.type || "kurum" })), items: vids, errors };
}
