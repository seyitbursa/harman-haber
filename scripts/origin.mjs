// "Bu haberin ilk kaynağı ne?": çok kaynaklı olaylarda haber sayfalarındaki AÇIK ajans imzalarını bulur.
// Yalnızca açık atıf kullanılır ("(AA)", "Kaynak: DHA", "İHA muhabiri", yapılandırılmış veride yazar olarak ajans);
// kanıt yoksa köken belirsiz bırakılır.
const AG = [
  ["aa", "AA", /(Anadolu Ajansı|\bAA\b)/],
  ["dha", "DHA", /(Demirören Haber Ajansı|\bDHA\b)/],
  ["iha", "İHA", /(İhlas Haber Ajansı|\bİHA\b)/],
  ["anka", "ANKA", /(ANKA Haber Ajansı|\bANKA\b)/],
  ["reuters", "Reuters", /\bReuters\b/],
  ["afp", "AFP", /\bAFP\b/],
  ["ap", "AP", /(Associated Press|\(AP\))/]
];
const ATTR = [
  n => new RegExp("\\((?:" + n + ")\\)"),                                            // (AA)
  n => new RegExp("(?:Kaynak|Haber kaynağı)\\s*:\\s*(?:" + n + ")", "i"),             // Kaynak: AA
  n => new RegExp("(?:" + n + ")\\s+muhabir", "i"),                                   // AA muhabiri
  n => new RegExp("(?:" + n + ")['’]?(?:n[ıiuü]n|[ıiuü]n|y[ae]|[ae])?\\s+(?:göre|aktardığına|bildirdiğine|verdiği bilgiye)", "i")   // Reuters'ın haberine göre
];
const SRC_AG = { aa: "aa" };   // ajansın kendi yayını

function detect(html) {
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join(" ");
  const authors = [...ld.matchAll(/"author"\s*:\s*(\{[^}]*\}|\[[^\]]*\])/g)].map(m => m[1]).join(" ");
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<nav[\s\S]*?<\/nav>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const [id, , re] of AG) {
    const names = re.source.replace(/^\(|\)$/g, "");
    if (re.test(authors)) return id;
    if (ATTR.some(f => f(names).test(text))) return id;
  }
  return null;
}

export async function addOrigins({ stories, prev, log = console.log }) {
  const cache = { ...(prev || {}) };
  const now = Date.now();
  const uniq = s => new Set(s.items.map(i => i.source)).size;
  const cands = stories.filter(s => uniq(s) >= 3 && now - new Date(s.date) < 36 * 3600e3);
  const todo = [];
  for (const s of cands) for (const i of s.items) {
    if (SRC_AG[i.source]) { cache[i.url] = SRC_AG[i.source]; continue; }
    if (!(i.url in cache) && !/news\.google\.com/.test(i.url)) todo.push(i.url);
  }
  const batch = todo.slice(0, 48);
  let k = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (k < batch.length) {
      const url = batch[k++];
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
      try { const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (HarmanHaber; +https://harmanhaber.app)" } }); cache[url] = r.ok ? (detect(await r.text()) || "-") : "-"; }
      catch { cache[url] = "-"; } finally { clearTimeout(t); }
    }
  }));
  for (const s of cands) {
    const c = {}; s.items.forEach(i => { const a = cache[i.url]; if (a && a !== "-") c[a] = (c[a] || 0) + 1; });
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) s.origin = { ag: AG.find(a => a[0] === top[0])[1], n: top[1], of: uniq(s) };
  }
  // Önbellek: yalnızca son iki günün haberleri
  const live = new Set(stories.flatMap(s => s.items.map(i => i.url)));
  for (const u of Object.keys(cache)) if (!live.has(u)) delete cache[u];
  log(`Köken: ${batch.length} sayfa okundu, ${cands.filter(s => s.origin).length} olayda açık ajans imzası.`);
  return cache;
}
