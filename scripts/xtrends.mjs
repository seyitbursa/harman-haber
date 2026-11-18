// X (Twitter) Türkiye gündemi. X’in resmi API’si ücretli olduğu için, X gündemini
// herkese açık olarak listeleyen trends24.in sayfası okunur ve kaynak olarak gösterilir.
const URL_TR = "https://trends24.in/turkey/";

const decode = t => t
  .replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export async function getXTrends({ max = 20 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(URL_TR, {
      signal: ctrl.signal,
      headers: { "User-Agent": "GundemKutusu/1.0 (+https://github.com/seyitbursa/gundem-kutusu)", "Accept-Language": "tr-TR,tr;q=0.9" }
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const html = await r.text();
    // İlk liste en güncel saatin gündemidir
    const start = html.indexOf('class=list-container');
    if (start < 0) throw new Error("liste bulunamadı");
    const end = html.indexOf('class=list-container', start + 10);
    const block = html.slice(start, end > 0 ? end : start + 20000);
    const ts = block.match(/data-timestamp=["']?([\d.]+)/);
    const items = [];
    const re = /class=["']?trend-link["']?>([^<]+)<\/a>\s*<span class=["']?tweet-count["']?[^>]*data-count=["']?([^"'\s>]*)/g;
    let m;
    while ((m = re.exec(block)) && items.length < max) {
      const name = decode(m[1]).trim();
      const count = parseInt(m[2], 10);
      if (name) items.push({ name, count: Number.isFinite(count) ? count : null });
    }
    if (!items.length) throw new Error("gündem boş");
    return {
      source: "trends24.in", sourceUrl: URL_TR,
      at: ts ? new Date(parseFloat(ts[1]) * 1000).toISOString() : new Date().toISOString(),
      items
    };
  } catch (e) {
    return { source: "trends24.in", sourceUrl: URL_TR, items: [], error: String(e.message || e) };
  } finally { clearTimeout(timer); }
}
