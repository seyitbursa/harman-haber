// İnternet gündemi: Google’da en çok arananlar (Google Trends, Türkiye) ve Vikipedi’de en çok okunanlar (Wikimedia).
const UA = { "User-Agent": "HarmanHaber/1.0 (https://harmanhaber.app)" };
const decode = s => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
async function get(url, json) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  try { const r = await fetch(url, { signal: ctrl.signal, headers: UA }); if (!r.ok) throw new Error("HTTP " + r.status); return json ? r.json() : r.text(); }
  finally { clearTimeout(t); }
}

export async function googleTrends(log = console.log) {
  try {
    const xml = await get("https://trends.google.com/trending/rss?geo=TR");
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => {
      const e = m[1], g = re => decode((e.match(re) || [])[1] || "");
      const news = [...e.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)].slice(0, 2).map(n => ({
        title: decode((n[1].match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/) || [])[1] || ""),
        url: decode((n[1].match(/<ht:news_item_url>([\s\S]*?)<\/ht:news_item_url>/) || [])[1] || ""),
        source: decode((n[1].match(/<ht:news_item_source>([\s\S]*?)<\/ht:news_item_source>/) || [])[1] || "")
      })).filter(n => n.title && n.url);
      return { name: g(/<title>([\s\S]*?)<\/title>/), traffic: g(/<ht:approx_traffic>([^<]*)/), date: g(/<pubDate>([^<]*)/), news };
    }).filter(x => x.name);
    return { source: "Google Trends", sourceUrl: "https://trends.google.com/trending?geo=TR", at: new Date().toISOString(), items };
  } catch (e) { log("  ✗ Google Trends → " + e.message); return null; }
}

// Vikipedi: dünün en çok okunanları; her gün zaten okunan "kalıcı" maddeler (Türkiye, Atatürk…) ve müstehcen maddeler elenir
const WIKI_SKIP = /^(Anasayfa|Özel:|Vikipedi:|Dosya:|Kategori:|Yardım:|Şablon:|Portal:|Kullanıcı:|Tartışma:|-$)|porno|seks|cinsel|penis|vajina|mastürbasyon|orgazm|xhamster|xvideos|pornhub|onlyfans|çıplak|erotik|fetiş|ensest|anal_/i;
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "/");
async function top(day) {
  const d = await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/tr.wikipedia/all-access/${day}`, true);
  return d.items?.[0]?.articles || [];
}
export async function wikiTop({ prev, log = console.log }) {
  // Veri günde bir kez değişir: aynı gün için önceki sonucu kullan
  const y = new Date(Date.now() - 864e5);
  if (prev?.date === ymd(y) && prev.items?.length) return prev;
  try {
    let cur, date = y;
    try { cur = await top(ymd(y)); } catch { date = new Date(Date.now() - 2 * 864e5); cur = await top(ymd(date)); }
    if (prev?.date === ymd(date) && prev.items?.length) return prev;
    const base = await top(ymd(new Date(date.getTime() - 14 * 864e5))).catch(() => []);
    const baseViews = Object.fromEntries(base.slice(0, 150).map(a => [a.article, a.views]));
    const items = cur.filter(a => !WIKI_SKIP.test(a.article))
      .filter(a => !(a.article in baseViews) || a.views > 3 * baseViews[a.article])      // iki hafta önce de en üstteyse ve patlama yoksa ele
      .slice(0, 25).map(a => ({ name: a.article.replace(/_/g, " "), views: a.views, url: "https://tr.wikipedia.org/wiki/" + encodeURIComponent(a.article) }));
    // Kısa açıklamalar (ilk 15 madde)
    await Promise.all(items.slice(0, 15).map(async it => {
      try { const s = await get("https://tr.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(it.name.replace(/ /g, "_")), true); it.desc = (s.description || "").slice(0, 90) || null; } catch {}
    }));
    return { source: "Vikipedi", sourceUrl: "https://tr.wikipedia.org", date: ymd(date), items };
  } catch (e) { log("  ✗ Vikipedi → " + e.message); return prev || null; }
}
