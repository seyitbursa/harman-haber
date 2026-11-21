// "Bu iddia incelendi mi?": Teyit'in yayımladığı doğrulamalarla haber eşleşmeleri.
// Otomatik eşleşmeler yalnızca ADAY olarak yönetici sayfasına gider; sitede yalnızca editörün onayladıkları görünür.
const SAYAC = "https://harman-sayac.harmanhaber.workers.dev";
const decode = s => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#8217;|&#039;|&#39;/g, "'").replace(/&quot;|&#8220;|&#8221;/g, "\"").replace(/\s+/g, " ").trim();
const propers = t => new Set((t.match(/[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}/g) || []).map(w => w.toLocaleLowerCase("tr").slice(0, 5)));
const stems = t => new Set(t.toLocaleLowerCase("tr").split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4).map(w => w.slice(0, 5)));

export async function factChecks({ stories, log = console.log }) {
  let items = [];
  try {
    const r = await fetch("https://teyit.org/feed", { headers: { "User-Agent": "Mozilla/5.0 (HarmanHaber)" } });
    const xml = await r.text();
    items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({ t: decode((m[1].match(/<title>([\s\S]*?)<\/title>/) || [])[1] || ""), u: decode((m[1].match(/<link>([\s\S]*?)<\/link>/) || [])[1] || ""), d: (m[1].match(/<pubDate>([^<]+)/) || [])[1] })).filter(x => /\/analiz\//.test(x.u));
  } catch (e) { log("  ✗ Teyit → " + e.message); }
  // Aday eşleşmeler: en az iki ortak özel isim ve üç ortak kelime
  const cands = [];
  for (const it of items) {
    const P = propers(it.t), S = stems(it.t);
    for (const s of stories) {
      const tt = s.items.map(i => i.title).join(" ");
      const p = [...P].filter(x => propers(tt).has(x)).length, w = [...S].filter(x => stems(tt).has(x)).length;
      if (p >= 2 && w >= 3) cands.push({ teyit: it.u, teyitBaslik: it.t, haber: s.items[0].url, haberBaslik: s.items[0].title, skor: p + w });
    }
  }
  cands.sort((a, b) => b.skor - a.skor);
  // Editör onayları
  let approved = [];
  try { const r = await fetch(SAYAC + "/onaylar"); approved = (await r.json()).onaylar || []; } catch {}
  let shown = 0;
  for (const a of approved) {
    const s = stories.find(x => x.items.some(i => i.url === a.haber));
    if (s) { (s.check = s.check || []).push({ iddia: a.iddia, sonuc: a.sonuc, url: a.teyit, baslik: a.baslik }); shown++; }
  }
  log(`Doğrulama: Teyit’ten ${items.length} analiz, ${cands.length} aday eşleşme, ${shown} onaylı eşleşme sitede.`);
  return cands.slice(0, 15);
}
