// Mini Bulmaca: 5×5 çengel bulmaca. Izgara sık kullanılan sözlük kelimeleriyle algoritmayla doldurulur,
// ipuçlarını Gemini yazar. Kelime sıklığı: hermitdave/FrequencyWords (Türkçe, OpenSubtitles).
import { readFile } from "node:fs/promises";
function rng(seed) { let h = 2166136261; for (const c of seed) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; }; }
const enc = o => Buffer.from(JSON.stringify(o), "utf8").toString("base64").split("").reverse().join("");

// Siyah kare desenleri (# siyah); NYT Mini’lerdeki gibi köşelerde
const PATTERNS = [
  ["#....", ".....", ".....", ".....", "....#"],
  ["....#", ".....", ".....", ".....", "#...."],
  ["##...", "#....", ".....", "....#", "...##"],
  ["...##", "....#", ".....", "#....", "##..."],
  ["#...#", ".....", ".....", ".....", "#...#"],
  [".....", ".....", "##.##", ".....", "....."].slice(0, 5)
];

function slots(pat) {
  const out = [];
  for (let r = 0; r < 5; r++) { let c = 0; while (c < 5) { if (pat[r][c] === "#") { c++; continue; } const s = c; while (c < 5 && pat[r][c] !== "#") c++; if (c - s >= 3) out.push({ dir: "y", cells: [...Array(c - s)].map((_, k) => r * 5 + s + k) }); } }
  for (let c = 0; c < 5; c++) { let r = 0; while (r < 5) { if (pat[r][c] === "#") { r++; continue; } const s = r; while (r < 5 && pat[r][c] !== "#") r++; if (r - s >= 3) out.push({ dir: "a", cells: [...Array(r - s)].map((_, k) => (s + k) * 5 + c) }); } }
  return out;
}

function fill(pat, pool, r, deadline) {
  const sl = slots(pat);
  // Her beyaz kare en az bir yatay ve bir dikey kelimeye ait olmalı (tek harflik kenarlar olmasın)
  for (let i = 0; i < 25; i++) { if (pat[Math.floor(i / 5)][i % 5] === "#") continue; const n = sl.filter(s => s.cells.includes(i)).length; if (n < 2) return null; }
  const byLen = {}; for (const [w, f] of pool) (byLen[[...w].length] = byLen[[...w].length] || []).push([w, f]);
  for (const k in byLen) byLen[k] = byLen[k].map(([w, f]) => [w, f + r() * 600]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  const grid = Array(25).fill(null), used = new Set();
  const fits = (s, w) => [...w].every((ch, k) => grid[s.cells[k]] === null || grid[s.cells[k]] === ch);
  const go = () => {
    if (Date.now() > deadline) return false;
    let best = null, bestC = null;
    for (const s of sl) {
      if (s.cells.every(c => grid[c] !== null)) continue;
      const cand = (byLen[s.cells.length] || []).filter(w => !used.has(w) && fits(s, w));
      if (!best || cand.length < bestC.length) { best = s; bestC = cand; if (!cand.length) return false; }
    }
    if (!best) return sl.every(s => used.has(s.cells.map(c => grid[c]).join("")));
    for (const w of bestC.slice(0, 60)) {
      const prev = best.cells.map(c => grid[c]);
      [...w].forEach((ch, k) => grid[best.cells[k]] = ch); used.add(w);
      // Dolan çapraz kelimeler de sözlükte olmalı
      const okCross = sl.every(s => { if (s === best) return true; const cur = s.cells.map(c => grid[c]); if (cur.includes(null)) return true; const ww = cur.join(""); return (byLen[ww.length] || []).includes(ww); });
      if (okCross) { sl.filter(s => s !== best && s.cells.every(c => grid[c] !== null)).forEach(s => used.add(s.cells.map(c => grid[c]).join(""))); if (go()) return true; }
      best.cells.forEach((c, k) => grid[c] = prev[k]); used.delete(w);
      sl.filter(s => s !== best).forEach(s => { const ww = s.cells.map(c => grid[c]); if (ww.includes(null)) used.delete(s.cells.map(c => grid[c] ?? "?").join("")); });
    }
    return false;
  };
  if (!go()) return null;
  return { grid, sl };
}

const CLUE_PROMPT = `Sen bir Türk bulmaca yazarısın. Aşağıdaki kelimeler için kısa, zekice ve doğru çengel bulmaca ipuçları yaz.
- Her ipucu en fazla 8 kelime. Kelimenin kendisini ya da kökünü ipucunda kullanma.
- Kelimenin en bilinen anlamını kullan; gerekirse eş anlamlı, boşluk doldurma ("___ ile çay") ya da tanım biçiminde yaz.
- Siyaset, din ve şiddet içeren ipucu yazma.
Yalnızca şu biçimde JSON dizi döndür: [{"k":"KELİME","i":"ipucu"}, ...]`;

// Bulmacada istenmeyen kaba ya da kırıcı kelimeler
const BLOCK = new Set("kaka çiş bok sik siki piç göt meme salak enayi aptal ahmak budala gerzek dangalak öküz eşek hıyar kevaşe orospu fahişe kahpe ibne gavat yavşak şerefsiz ölü ölüm ceset kan katil savaş bomba silah intihar tecavüz zina".split(" "));
export async function miniBulmaca({ date, key, callGeminiRaw, usage }) {
  const pool = Object.entries(JSON.parse(await readFile(new URL("../data/mini-kelimeler.json", import.meta.url), "utf8"))).filter(([w]) => !BLOCK.has(w));
  const r = rng("mini-" + date);
  let res = null;
  const order = [...PATTERNS].sort(() => r() - .5);
  for (const pat of order) { res = fill(pat, pool, r, Date.now() + 12000); if (res) { res.pat = pat; break; } }
  if (!res) return null;
  // Numaralandırma (NYT gibi: bir kelimenin başladığı her kareye numara)
  const startNum = {}; let n = 0;
  for (let i = 0; i < 25; i++) { const starts = res.sl.filter(s => s.cells[0] === i); if (starts.length) startNum[i] = ++n; }
  const across = res.sl.filter(s => s.dir === "y").map(s => ({ n: startNum[s.cells[0]], cells: s.cells, w: s.cells.map(c => res.grid[c]).join("") }));
  const down = res.sl.filter(s => s.dir === "a").map(s => ({ n: startNum[s.cells[0]], cells: s.cells, w: s.cells.map(c => res.grid[c]).join("") }));
  const words = [...across, ...down].map(x => x.w);
  let clues = {};
  if (key && callGeminiRaw) {
    try {
      usage && usage.requests++;
      const { out } = await callGeminiRaw(key, CLUE_PROMPT + "\n\n" + words.map(w => w.toLocaleUpperCase("tr")).join(", "), ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"]);
      (out || []).forEach(o => { const w = String(o.k || "").toLocaleLowerCase("tr"); if (o.i) clues[w] = String(o.i).trim(); });
    } catch (e) {}
  }
  if (!words.every(w => clues[w])) return null;   // ipucu eksikse bugün yayınlama
  const blacks = res.pat.join("").split("").map((c, i) => c === "#" ? i : -1).filter(i => i >= 0);
  across.sort((a, b) => a.n - b.n); down.sort((a, b) => a.n - b.n);
  return { blacks, nums: startNum, across: across.map(x => ({ n: x.n, cells: x.cells, c: clues[x.w] })), down: down.map(x => ({ n: x.n, cells: x.cells, c: clues[x.w] })), s: enc(res.grid.map(x => x || "#").join("")) };
}
