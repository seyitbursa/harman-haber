// Aynı olayı anlatan haberleri gruplar.
// Başlıklar kelimelere ayrılır, Türkçe ekler kabaca kırpılır (ilk 5 harf) ve
// nadir kelimelere daha çok ağırlık verilerek (IDF) benzerlik hesaplanır.
const STOP = ("ve ile için bir bu da de ki mi mu mı mü ne o şu en çok daha gibi kadar sonra önce olarak olan oldu etti " +
  "yaptı dedi açıkladı son dakika flaş haber haberi işte nasıl neden ne zaman kim nerede yeni ilk iki üç yüzde " +
  "bin milyon milyar çıktı ortaya karar belli günü bugün").split(" ");
const stem = w => /^\d/.test(w) ? w : w.slice(0, 5);
const STOPS = new Set(STOP.map(stem));

function tokens(text) {
  return new Set(text.toLocaleLowerCase("tr")
    .replace(/['’‘`]\p{L}+/gu, "")          // Sözcü TV'ye → sözcü tv
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/).filter(w => w.length > 1).map(stem).filter(w => !STOPS.has(w)));
}

export function cluster(items, { windowHours = 30, threshold = 0.5 } = {}) {
  const docs = items.map(it => ({
    it,
    T: tokens(it.title),
    F: tokens(it.title + " " + ((it.summary || "").split(/[.!?…]/)[0] || "")),
    t: new Date(it.date).getTime()
  }));
  const df = new Map();
  docs.forEach(d => d.F.forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const idf = w => Math.log(docs.length / (df.get(w) || 1));
  docs.forEach(d => { d.w = [...d.F].reduce((s, w) => s + idf(w), 0); });

  const score = (a, b) => {
    let sharedTitle = 0, shared = 0;
    for (const w of a.T) if (b.T.has(w) && idf(w) > 1.5) sharedTitle++;
    if (sharedTitle < 2) return 0;                  // başlıkta en az iki ayırt edici ortak kelime
    for (const w of a.F) if (b.F.has(w)) shared += idf(w);
    return shared / Math.min(a.w, b.w);
  };

  const groups = [];
  for (const d of docs) {
    let best = null, bestScore = 0;
    for (const g of groups) {
      if (Math.abs(g.t - d.t) > windowHours * 3600e3) continue;
      if (g.sources.has(d.it.source)) continue;     // aynı kaynaktan ikinci haber gruba girmez
      const s = Math.max(...g.docs.map(m => score(d, m)));
      if (s >= threshold && s > bestScore) { best = g; bestScore = s; }
    }
    if (best) { best.docs.push(d); best.sources.add(d.it.source); }
    else groups.push({ docs: [d], t: d.t, sources: new Set([d.it.source]) });
  }
  return groups.map(g => g.docs.map(d => d.it));
}
