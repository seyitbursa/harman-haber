// Resmî Gazete’de bugün: günün sayısındaki düzenlemeleri sade Türkçe ile özetler (Gemini).
// Günde bir kez özetlenir; aynı gün içinde sonuç önbellekten kullanılır.
const HOME = "https://www.resmigazete.gov.tr/";
const UA = { "User-Agent": "Mozilla/5.0 (HarmanHaber; +https://harmanhaber.app)" };
const decode = s => s.replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const clean = s => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

async function getText(url, enc = "utf-8") {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: UA });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const buf = await r.arrayBuffer();
    let txt = new TextDecoder(enc).decode(buf);
    const m = txt.match(/charset=["']?([\w-]+)/i);
    if (m && m[1].toLowerCase() !== enc) txt = new TextDecoder(m[1].toLowerCase()).decode(buf);
    return txt;
  } finally { clearTimeout(t); }
}

// Ana sayfadan günün içindekiler: bölüm başlıkları ve maddeler
async function contents() {
  const html = await getText(HOME);
  const start = html.search(/YASAMA BÖLÜMÜ|YÜRÜTME VE İDARE BÖLÜMÜ/);
  const end = html.indexOf("İLÂN BÖLÜMÜ", start);
  if (start < 0) throw new Error("içindekiler bulunamadı");
  const seg = html.slice(start, end > 0 ? end : start + 60000);
  const pdf = (html.match(/href="([^"]+eskiler\/\d{4}\/\d{2}\/\d{8}\.pdf)"/) || [])[1] || null;
  const date = (seg.match(/eskiler\/(\d{4})\/(\d{2})\/(\d{4})(\d{2})(\d{2})/) || []);
  const items = []; let sec = "";
  // Bölüm başlıkları bağlantısız büyük harfli satırlar, maddeler bağlantı
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|>([^<>]{4,90})</g; let m;
  while ((m = re.exec(seg))) {
    if (m[1]) {
      const title = clean(m[2]).replace(/^[–-]+\s*/, "");
      if (title && !/PDF Görüntüle/i.test(title)) items.push({ sec, title, url: new URL(m[1], HOME).href });
    } else {
      const t = clean(m[3]);
      if (t && t === t.toLocaleUpperCase("tr") && /[A-ZÇĞİÖŞÜ]{4}/.test(t) && !/BÖLÜMÜ$/.test(t)) sec = t.replace(/\s+/g, " ");
    }
  }
  return { date: date.length ? `${date[1]}-${date[2]}-${date[5]}` : null, pdf, items };
}

const PROMPT = `Sen bir hukuk editörüsün. Aşağıda bugünkü Resmî Gazete’de yayımlanan düzenlemelerin başlıkları ve metinlerinden parçalar var.
Her biri için sıradan bir vatandaşın anlayacağı sade Türkçe ile şunları yaz:
- "baslik": en fazla 10 kelimelik sade başlık (ör. "Pilot lisansı şartları değişti")
- "ozet": ne değiştiğini anlatan en fazla 2 cümle; yalnızca metindeki bilgiyle, yorum katmadan
- "etki": kimi etkilediği, en fazla 10 kelime (ör. "Pilot adayları ve havacılık okulları"); belirsizse ""
- "onem": 1 (dar bir kesimi ilgilendirir), 2 (orta), 3 (geniş kesimleri ilgilendirir: vergi, ücret, sağlık, eğitim, trafik gibi)
Metin anlaşılmıyorsa ozet için "" döndür. Yalnızca şu biçimde JSON dizi döndür: [{"i":1,"baslik":"...","ozet":"...","etki":"...","onem":1}, ...]`;

export async function resmiGazete({ prev, key, usage, callGeminiRaw, log = console.log }) {
  let c;
  try { c = await contents(); } catch (e) { log("  ✗ Resmî Gazete → " + e.message); return prev || null; }
  if (!c.date || !c.items.length) return prev || null;
  if (prev?.date === c.date && prev.done) return prev;          // bugünkü sayı zaten özetlendi
  const items = c.items.slice(0, 25);
  const out = { date: c.date, pdf: c.pdf, home: HOME, items: items.map(x => ({ ...x })), done: false };
  if (!key || !callGeminiRaw) return out;
  const texts = await Promise.all(items.map(async x => {
    if (!/\.htm/.test(x.url)) return "";
    try { const h = await getText(x.url, "windows-1254"); return clean(h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")).replace(/^.*?Sayı\s*:\s*\d+/, "").slice(0, 1800); } catch { return ""; }
  }));
  const body = items.map((x, n) => `#${n + 1} [${x.sec}] ${x.title}\nMetin: ${texts[n] || "(metin alınamadı)"}`).join("\n\n");
  try {
    usage.requests++;
    const { out: res } = await callGeminiRaw(key, PROMPT + "\n\n" + body);
    res.forEach(r => { const it = out.items[r.i - 1]; if (!it) return; it.sade = (r.baslik || "").trim(); it.ozet = (r.ozet || "").trim(); it.etki = (r.etki || "").trim(); it.onem = +r.onem || 1; });
    out.done = true;
  } catch (e) { log("  ✗ Resmî Gazete özeti → " + e.message); }
  return out;
}
