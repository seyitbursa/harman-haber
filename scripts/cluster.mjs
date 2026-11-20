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

// İkinci geçiş: yapay zekâ özetleri ("Özü") farklı yazılmış başlıkları ortak bir dile çevirdiği için,
// başlık + özet benzerliğiyle aynı olayı anlatan ayrı hikâyeleri birleştirir. Yalnızca 12 saat içindeki,
// ortak kaynağı olmayan ve en az üç ayırt edici kelimeyi paylaşan hikâyeler birleşir.
// Metindeki özel isimler: büyük harfle yazılan ve metinlerin hiçbirinde küçük harfle geçmeyen kelimeler (ilk 5 harf).
// Böylece cümle başındaki "Trump" özel isim sayılır, cümle başındaki "Katil" sayılmaz.
const PGENERIC = new Set(["türki", "abd", "bakan", "başka", "cumhu", "dünya", "avrup", "devle", "milli"]);
const rawWords = text => text.split(/\s+/).map(w => w.replace(/['’‘`].*$/u, "").replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
function propers(text, lowerSeen) {
  const out = new Set();
  for (const c of rawWords(text)) {
    if (!/^\p{Lu}/u.test(c) || c.length < 3) continue;
    const lw = c.toLocaleLowerCase("tr");
    if (lowerSeen.has(lw)) continue;
    const st = lw.slice(0, 5); if (!PGENERIC.has(st)) out.add(st);
  }
  return out;
}
export function mergeByGist(stories, { hours = 12, threshold = 0.45 } = {}) {
  const lowerSeen = new Set();
  stories.forEach(s => { const i = s.items[0]; rawWords(i.title + " " + (i.gist || "")).forEach(w => { if (/^\p{Ll}/u.test(w)) lowerSeen.add(w); }); });
  const docs = stories.map(s => {
    const i = s.items[0];
    return { s, F: tokens(i.title + " " + (i.gist || "")), P: propers(i.title + " " + (i.gist || ""), lowerSeen), has: !!i.gist, t: new Date(s.date).getTime(), src: new Set(s.items.map(x => x.source)) };
  });
  const df = new Map(); docs.forEach(d => d.F.forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const idf = w => Math.log(docs.length / (df.get(w) || 1));
  docs.forEach(d => d.w = [...d.F].reduce((a, w) => a + idf(w), 0));
  let merged = 0;
  for (let a = 0; a < docs.length; a++) {
    const A = docs[a]; if (!A || !A.has) continue;
    for (let b = a + 1; b < docs.length; b++) {
      const B = docs[b]; if (!B || !B.has || Math.abs(A.t - B.t) > hours * 3600e3) continue;
      if ([...B.src].some(x => A.src.has(x))) continue;
      if (A.s.category !== B.s.category && A.s.category !== "gundem" && B.s.category !== "gundem") continue;
      let strong = 0, shared = 0;
      for (const w of A.F) if (B.F.has(w)) { const f = idf(w); shared += f; if (f > 2) strong++; }
      // Ortak özel isim şartı: aynı tür olay (ör. iki ayrı saldırı) farklı yerlerde/kişilerde olduysa birleşmez
      const commonP = [...A.P].filter(x => B.P.has(x)).length;
      const sc = shared / Math.min(A.w, B.w);
      if (strong < 3 || sc < threshold || commonP === 0 || (commonP === 1 && sc < 0.6)) continue;
      // B’yi A’ya kat
      A.s.items.push(...B.s.items); B.src.forEach(x => A.src.add(x));
      A.s.date = [A.s.date, B.s.date].sort().at(-1); A.s.first = [A.s.first || A.s.date, B.s.first || B.s.date].sort()[0];
      A.F = new Set([...A.F, ...B.F]); A.P = new Set([...A.P, ...B.P]);
      docs[b] = null; merged++;
    }
  }
  if (merged) { const keep = new Set(docs.filter(Boolean).map(d => d.s)); for (let i = stories.length - 1; i >= 0; i--) if (!keep.has(stories[i])) stories.splice(i, 1); }
  return merged;
}
