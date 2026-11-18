// Kelime Harmanı: günün kelimesi, o günün haberlerinde geçen 5 harfli bir sözlük kelimesinden seçilir.
// Gün boyunca aynı kalır (yayındaki bir önceki news.json’dan okunur).
import { readFile } from "node:fs/promises";

const BLOCK = new Set(["savaş","ceset","katil","bomba","şehit","silah","ölüye","yaralı","kanlı","terör","tecav","intih","darbe","cinsi","fuhuş","irkçı","ırkçı","kurşu","hapis","zehir","vahşi","işkence"].filter(w => w.length === 5));
const FALLBACK = ["haber","kalem","deniz","güneş","şehir","kitap","yazar","dünya","bahar","sokak","kural","fiyat","hasat","sorun","tarih","kanun","seçim","altın","bilgi","yarış","ödül","konuk","umut","adalet"].filter(w => w.length === 5);
const low = s => s.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
const trDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const enc = w => Buffer.from([...w].reverse().join(""), "utf8").toString("base64");
const dec = s => [...Buffer.from(s, "base64").toString("utf8")].reverse().join("");

// Basit tohumlu rastgele (aynı gün aynı sonuç)
function seeded(str) { let h = 2166136261; for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }

function tokens(text) {
  // Cümle ortasında küçük harfle geçen kelimeler (özel isimler ve cümle başları elenir)
  return text.split(/[^A-Za-zÇĞİÖŞÜçğıöşüâîû']+/).map(t => t.split("'")[0]).filter(t => t && t[0] === t[0].toLowerCase()).map(low);
}

export async function dailyWord({ stories, prevGame }) {
  const dict = new Set(JSON.parse(await readFile(new URL("../public/games/kelimeler.json", import.meta.url), "utf8")));
  const date = trDate();
  const history = (prevGame?.history || []).slice(-120);
  const since = Date.now() - 36 * 3600e3;

  // Bugünkü haberlerde geçen 5 harfli sözlük kelimeleri ve tahmin için ek kelimeler
  const count = new Map(), extra = new Set();
  for (const s of stories) {
    if (new Date(s.date).getTime() < since) continue;
    const seen = new Set();
    for (const i of s.items) for (const t of tokens(i.title + " " + (i.summary || ""))) {
      if ([...t].length !== 5) continue;
      if (!dict.has(t)) { if (/^[a-zçğıöşü]{5}$/.test(t)) extra.add(t); continue; }
      seen.add(t);
    }
    seen.forEach(t => count.set(t, (count.get(t) || 0) + 1));
  }

  let word;
  if (prevGame?.date === date && prevGame.w) word = dec(prevGame.w);
  else {
    const used = new Set(history);
    const cands = [...count.entries()].filter(([w, n]) => n >= 2 && !BLOCK.has(w) && !used.has(w)).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w]) => w);
    const rnd = seeded(date);
    word = cands.length ? cands[Math.floor(rnd() * cands.length)] : FALLBACK.filter(w => !used.has(w))[Math.floor(rnd() * FALLBACK.length)] || FALLBACK[0];
    history.push(word);
  }
  // Kelimenin geçtiği güncel haberler (çözünce gösterilir)
  const re = new RegExp(`(^|[^a-zçğıöşü])${word}([^a-zçğıöşü]|$)`);
  const news = stories.filter(s => s.items.some(i => re.test(low(i.title + " " + (i.summary || ""))))).slice(0, 4)
    .map(s => ({ title: s.items[0].title, url: s.items[0].url, source: s.items[0].source }));
  return { date, w: enc(word), news: news.length ? news : (prevGame?.date === date ? prevGame.news || [] : []), extra: [...extra].slice(0, 1500), history };
}
