// Günlük oyun içerikleri: Manşet Tamamla, Rakam Avı, Hangi Kaynak?, Petek.
// Her oyun Türkiye saatine göre günde bir kez üretilir ve gün boyunca sabit kalır.
import { readFile } from "node:fs/promises";

const trDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const low = s => s.replace(/I/g, "ı").replace(/İ/g, "i").toLocaleLowerCase("tr");
const enc = o => Buffer.from(JSON.stringify(o), "utf8").toString("base64").split("").reverse().join("");
function rng(seed) { let h = 2166136261; for (const c of seed) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; }; }
const shuffle = (a, r) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const SENSITIVE = /(öldü|ölü|ceset|cinayet|intihar|tecavüz|istismar|taciz|şehit|yaralı|kaza|vefat|hayatını kaybetti|katliam|bomba|saldırı|deprem|yangın|boğul|kurşun|silahlı|bıçak|terör)/i;

function recent(stories, sources, hours = 30) {
  const since = Date.now() - hours * 3600e3;
  return stories.filter(s => new Date(s.date).getTime() >= since && !SENSITIVE.test(s.items[0].title + " " + (s.items[0].summary || "")));
}

// ---- Manşet Tamamla: başlıktaki bir özel isim ya da kelime gizlenir ----
const STOPW = new Set("nasıl neden niçin üstelik milyon milyar bugün yarın artık sonra önce kadar gibi daha bütün bunun şöyle böyle işte hemen sadece bile yeniden ilgili olarak üzere karşı arasında içinde göre yapılan olan oldu".split(" "));
function manset(stories, sources, dict, r) {
  const pool = recent(stories, sources).filter(s => s.items[0].title.length < 110 && !/[A-Z]{2,}\s[A-Z]{2,}/.test(s.items[0].title));
  // Özel isimlerin kaç farklı haberde geçtiği (tanınırlık ölçüsü)
  const seen = new Map();
  const lowerUse = new Set(pool.flatMap(s => [...(s.items[0].title + " " + (s.items[0].summary || "")).matchAll(/(?<![A-Za-zÇĞİÖŞÜçğıöşü])[a-zçğıöşü]{4,}/g)].map(m => m[0])));
  for (const s of pool) {
    const t = s.items[0].title;
    new Set([...t.matchAll(/[A-ZÇĞİÖŞÜ][a-zçğıöşü]{3,}/g)].filter(m => m.index > 0 && !/["“:!?.]\s?$/.test(t.slice(Math.max(0, m.index - 2), m.index))).map(m => m[0]))
      .forEach(w => { if (!lowerUse.has(low(w))) seen.set(w, (seen.get(w) || 0) + 1); });
  }
  const cand = [];
  for (const s of pool) {
    const t = s.items[0].title;
    let best = null;
    [...t.matchAll(/[A-Za-zÇĞİÖŞÜçğıöşü]+/g)].forEach((m, idx) => {
      if (idx === 0) return;
      const before = t.slice(Math.max(0, m.index - 2), m.index);
      if (/["“:!?.]\s?$/.test(before)) return;                 // tırnak ya da cümle başı
      const w = m[0], lw = low(w);
      const proper = /^[A-ZÇĞİÖŞÜ][a-zçğıöşü]{3,}$/.test(w) && (seen.get(w) || 0) >= 2 && !dict.has(lw);
      const common = /^[a-zçğıöşü]{5,}$/.test(w) && dict.has(lw) && !STOPW.has(lw);
      if (!proper && !common) return;
      const score = (proper ? 3 : 1) + w.length / 10;
      if (!best || score > best.score) best = { w, at: m.index, kind: proper ? "p" : "c", score };
    });
    if (best) cand.push({ s, ...best });
  }
  const commons = [...new Set(pool.flatMap(s => [...s.items[0].title.matchAll(/[a-zçğıöşü]{5,}/g)].map(m => m[0]).filter(w => dict.has(w) && !STOPW.has(w))))];
  const propers = [...seen.entries()].filter(([w, n]) => n >= 2 && !dict.has(low(w))).map(([w]) => w);
  const uniq = []; const ans = new Set();
  for (const c of shuffle(cand.sort((a, b) => b.s.items.length - a.s.items.length).slice(0, 30), r)) { if (ans.has(low(c.w))) continue; ans.add(low(c.w)); uniq.push(c); }
  const picked = uniq.slice(0, 5);
  return picked.map(c => {
    const pool2 = (c.kind === "p" ? propers : commons).filter(x => low(x) !== low(c.w) && Math.abs(x.length - c.w.length) <= 3);
    const opts = shuffle([...new Set(shuffle(pool2, r))].slice(0, 3).concat(c.w), r);
    const t = c.s.items[0].title;
    return { q: t.slice(0, c.at) + "_____" + t.slice(c.at + c.w.length), a: c.w, o: opts, url: c.s.items[0].url, src: c.s.items[0].source };
  }).filter(x => x.o.length === 4);
}

// ---- Rakam Avı: başlık ya da özetteki sayı gizlenir ----
function rakam(stories, sources, r) {
  const out = [];
  const NUM = /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)(\s*(?:bin|milyon|milyar))?/g;
  for (const s of shuffle(recent(stories, sources), r)) {
    const i = s.items[0], t = i.title;
    const m = [...t.matchAll(NUM)].find(m => {
      const raw = m[1];
      if (/^(19|20)\d\d$/.test(raw)) return false;                 // yıl
      if (/([A-ZÇĞİÖŞÜ]{2,5}\s|[A-Za-zÇĞİÖŞÜçğıöşü])$/.test(t.slice(Math.max(0, m.index - 6), m.index))) return false;   // "GTA 6", "COP31", "PS5" gibi adlar
      if (/\d+\s*(yaşında|yaş|saat|dakika|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)/i.test(t.slice(m.index, m.index + raw.length + 12))) return false;
      const prevTok = (t.slice(0, m.index).match(/(\S+)\s*$/) || [])[1] || "";
      if (/^[A-ZÇĞİÖŞÜ][a-zçğıöşü]+$/.test(prevTok) && !m[2]) return false;   // "Honor 700" gibi model adları
      const after = t.slice(m.index + m[0].length), beforeCh = t[m.index - 1] || " ";
      if (/^[-–A-Za-zÇĞİÖŞÜçğıöşü]/.test(after) || /[-–]/.test(beforeCh)) return false;   // "5G", "omega-3", "22-26"
      if (/^[A-ZÇĞİÖŞÜ]$/.test(prevTok)) return false;                                    // "C 111" gibi model adları
      const v = parseFloat(raw.replace(/\./g, "").replace(",", "."));
      return v >= 3 && v !== 100;
    });
    if (!m) continue;
    let v = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
    const unit = (m[2] || "").trim();
    out.push({ q: t.slice(0, m.index) + "?" + (unit ? " " + unit : "") + t.slice(m.index + m[0].length), a: v, unit, url: i.url, src: i.source });
    if (out.length === 5) break;
  }
  return out;
}

// ---- Hangi Kaynak?: tek kaynaklı bir başlık, dört kaynak seçeneği ----
function kaynak(stories, sources, r) {
  const news = Object.keys(sources).filter(k => sources[k].lean !== undefined || ["euronews"].includes(k));
  const pool = shuffle(recent(stories, sources).filter(s => s.items.length === 1 && news.includes(s.items[0].source)), r);
  const out = [], used = new Set();
  for (const s of pool) {
    const src = s.items[0].source; if (used.has(src)) continue; used.add(src);
    const others = shuffle(news.filter(k => k !== src), r).slice(0, 3);
    out.push({ q: s.items[0].title, a: src, o: shuffle([src, ...others], r), url: s.items[0].url });
    if (out.length === 5) break;
  }
  return out;
}

// ---- Petek: 7 harf, ortadaki harf zorunlu, en az 4 harfli kelimeler ----
const PETEK_BLOCK = /(sik|amcık|göt|orospu|piç|yarak|taşak|meme|seks)/;
function petek(words, r) {
  const pangrams = shuffle(words.filter(w => new Set(w).size === 7 && w.length <= 10 && !PETEK_BLOCK.test(w)), r);
  for (const p of pangrams.slice(0, 400)) {
    const letters = [...new Set(p)];
    for (const center of shuffle(letters, r)) {
      const set = new Set(letters);
      const ok = words.filter(w => w.includes(center) && [...w].every(c => set.has(c)) && !PETEK_BLOCK.test(w));
      if (ok.length >= 18 && ok.length <= 70) {
        const outer = shuffle(letters.filter(c => c !== center), r);
        const score = w => (w.length === 4 ? 1 : w.length) + (new Set(w).size === 7 ? 7 : 0);
        return { center, outer, n: ok.length, max: ok.reduce((a, w) => a + score(w), 0), w: enc(ok) };
      }
    }
  }
  return null;
}

export async function dailyGames({ stories, sources, prev }) {
  const date = trDate();
  if (prev?.date === date && prev.manset) return prev;          // gün içinde sabit
  const words = JSON.parse(await readFile(new URL("../data/sozluk.json", import.meta.url), "utf8"));
  const dict = new Set(words);
  const r = rng("harman-" + date);
  return {
    date,
    manset: enc(manset(stories, sources, dict, r)),
    rakam: enc(rakam(stories, sources, r)),
    kaynak: enc(kaynak(stories, sources, r)),
    petek: petek(words, r)
  };
}
