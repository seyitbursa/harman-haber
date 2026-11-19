// NYT Games tarzı günlük bulmacalar: Sudoku, Harf Kutusu (Letter Boxed), Bağlantılar (Connections).
// Sudoku ve Harf Kutusu tamamen algoritmayla, Bağlantılar Gemini ile üretilir ve kurallara göre doğrulanır.
import { readFile } from "node:fs/promises";
function rng(seed) { let h = 2166136261; for (const c of seed) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; }; }
const shuffle = (a, r) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const enc = o => Buffer.from(JSON.stringify(o), "utf8").toString("base64").split("").reverse().join("");

// ---------- Sudoku: tek çözümlü, orta zorluk ----------
function sudoku(r) {
  const g = Array(81).fill(0);
  const ok = (g, i, v) => { const R = Math.floor(i / 9), C = i % 9, b = Math.floor(R / 3) * 27 + Math.floor(C / 3) * 3;
    for (let k = 0; k < 9; k++) if (g[R * 9 + k] === v || g[k * 9 + C] === v || g[b + Math.floor(k / 3) * 9 + k % 3] === v) return false; return true; };
  const fill = i => { if (i === 81) return true; for (const v of shuffle([1,2,3,4,5,6,7,8,9], r)) if (ok(g, i, v)) { g[i] = v; if (fill(i + 1)) return true; g[i] = 0; } return false; };
  fill(0);
  const sol = [...g], puz = [...g];
  const count = (p, lim = 2) => { let n = 0; const s = [...p];
    const go = () => { const i = s.indexOf(0); if (i < 0) { n++; return n >= lim; } for (let v = 1; v <= 9; v++) if (ok(s, i, v)) { s[i] = v; if (go()) return true; s[i] = 0; } return false; };
    go(); return n; };
  let clues = 81;
  for (const i of shuffle([...Array(81).keys()], r)) {
    if (clues <= 30) break;
    const k = puz[i]; puz[i] = 0;
    if (count(puz) !== 1) puz[i] = k; else clues--;
  }
  return { p: puz.join(""), s: enc(sol.join("")), clues };
}

// ---------- Harf Kutusu: 4 kenar × 3 harf; iki kelimelik bir çözüm garanti ----------
function harfKutusu(words, r) {
  const W = words.filter(w => [...w].length >= 4 && [...w].length <= 10 && !/(.)\1/.test(w));
  const byFirst = new Map(); W.forEach(w => { const f = w[0]; if (!byFirst.has(f)) byFirst.set(f, []); byFirst.get(f).push(w); });
  for (const w1 of shuffle(W, r).slice(0, 4000)) {
    const s1 = new Set(w1); if (s1.size < 6 || s1.size > 9) continue;
    for (const w2 of shuffle(byFirst.get(w1.at(-1)) || [], r).slice(0, 200)) {
      const all = new Set([...w1, ...w2]); if (all.size !== 12) continue;
      // Kenar ataması: ardışık harfler aynı kenarda olamaz (her kenarda 3 harf)
      const letters = [...all], adj = new Map(letters.map(l => [l, new Set()]));
      for (const w of [w1, w2]) for (let i = 1; i < w.length; i++) { adj.get(w[i]).add(w[i - 1]); adj.get(w[i - 1]).add(w[i]); }
      const side = {}, cnt = [0,0,0,0];
      const order = [...letters].sort((a, b) => adj.get(b).size - adj.get(a).size);
      const place = k => { if (k === order.length) return true; const l = order[k];
        for (const s of shuffle([0,1,2,3], r)) { if (cnt[s] >= 3 || [...adj.get(l)].some(x => side[x] === s)) continue; side[l] = s; cnt[s]++; if (place(k + 1)) return true; delete side[l]; cnt[s]--; } return false; };
      if (!place(0)) continue;
      const sides = [0,1,2,3].map(s => letters.filter(l => side[l] === s));
      // Bu harflerle kurallara uyan bütün sözlük kelimeleri (istemcide doğrulama için)
      const sideOf = Object.fromEntries(letters.map(l => [l, side[l]]));
      const valid = words.filter(w => [...w].length >= 3 && [...w].every(c => c in sideOf) && [...w].every((c, i, a) => i === 0 || sideOf[c] !== sideOf[a[i - 1]]));
      if (valid.length < 40) continue;
      return { sides, w: enc(valid), sol: enc([w1, w2]), n: valid.length };
    }
  }
  return null;
}

// ---------- Bağlantılar: Gemini ile 4 grup × 4 kelime ----------
// Zor grup kodla, kesin doğru olarak üretilir: haberlerde geçen yaygın kelimelerin içine saklanmış hayvan, sayı ya da renk adları
const HIDDEN = {
  "İçinde bir hayvan adı saklı": ["arı","kaz","kedi","kuş","fil","ayı","koç","boğa","eşek","yılan","tavuk","kurt","geyik","sinek","balık","inek","keçi","tilki","aslan","kartal","ördek","horoz","öküz","deve","katır"],
  "İçinde bir sayı saklı": ["bir","iki","üç","dört","beş","altı","yedi","sekiz","dokuz","yüz","bin","elli","otuz","kırk","yirmi","seksen","doksan"],
  "İçinde bir renk adı saklı": ["kara","mor","sarı","gri","pembe","mavi","yeşil","beyaz","siyah","kırmızı","turuncu","lacivert","bordo"]
};
function hiddenGroup(common, r) {
  for (const [ad, list] of shuffle(Object.entries(HIDDEN), r)) {
    const pick = [], used = new Set();
    for (const w of shuffle(common, r)) {
      // Saklı ad kelimenin sonunda olmasın (ALABALIK, SİNEK gibi kendisi zaten hayvan olanlar elenir)
      const h = list.find(x => w.includes(x) && !w.endsWith(x) && !used.has(x) && !list.some(y => w === y || w.endsWith(y)));
      if (!h || [...w].length < 5 || [...w].length > 9) continue;
      pick.push({ w, h }); used.add(h);
      if (pick.length === 4) return { ad: ad + " (" + pick.map(p => p.h.toLocaleUpperCase("tr")).join(", ") + ")", k: pick.map(p => p.w.toLocaleUpperCase("tr")), why: pick };
    }
  }
  return null;
}
const THEMES = ["Mutfak eşyaları","Ege şehirleri","Karadeniz şehirleri","Türk yemekleri","Tatlılar","Meyveler","Sebzeler","Kuşlar","Deniz canlıları","Müzik aletleri","Spor dalları","Futbol terimleri","Satranç terimleri","Hava olayları","Gezegenler","Takımyıldızlar","Ağaçlar","Çiçekler","Baharatlar","Kahvaltılıklar","İçecekler","Giysiler","Ayakkabı türleri","Mobilyalar","Okul eşyaları","Meslekler","Hastane bölümleri değil, araç gereçleri: alet edevat","Taşıtlar","Dans türleri","Peynir türleri","Ekmek türleri","Kumaş türleri","Değerli taşlar","Madenler","Renk tonları","Geometrik şekiller","Matematik terimleri","Dilbilgisi terimleri","Bilgisayar parçaları","Sosyal medya terimleri","Kamp malzemeleri","Bahçe aletleri","Masal kahramanları","Burçlar","Mevsimlik meyveler","Kış sporları","Su sporları","Kart oyunları","Masa oyunları","Akdeniz ülkeleri","Başkentler","Nehirler","Göller","Dağlar","Adalar","Köpek ırkları","Kedi ırkları","Ölçü birimleri","Zaman birimleri","Duygu adları"];
const BAG_PROMPT = `Türkçe bir "Bağlantılar" bulmacası için 3 grup hazırla (NYT Connections gibi). Her grupta ortak noktası olan 4 Türkçe kelime olsun.
Kullanılacak kategoriler (sırayla, zorluk 1, 2, 3): KATEGORİLER
- Kelimeler herkesin bildiği, tek kelime, büyük harfle olsun. Özel isim kullanma (yer adları hariç).
- 3. grup daha dar ya da şaşırtıcı olabilir; kategori adını buna göre belirginleştir.
- Kafa karıştırmak için en az bir kelime ilk bakışta başka bir gruba da uyuyormuş gibi görünsün; ama her kelimenin doğru grubu tek olsun.
- Şu kelimeleri kullanma: YASAK
Yalnızca 3 elemanlı şu biçimde JSON dizi döndür: [{"ad":"Grup açıklaması","zorluk":1,"kelimeler":["A","B","C","D"]}, ...]`;
const CHECK_PROMPT = `Aşağıda bir kelime bulmacasının grupları var. Her grup için 4 kelimenin HEPSİ grup açıklamasına kesin olarak uyuyor mu, ve kelimelerden biri başka bir gruba da aynı derecede uyuyor mu, kontrol et.
Yalnızca şu biçimde JSON dizi döndür: [{"grup":1,"dogru":true,"sorun":""}, ...]`;
const STRONG = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
async function baglantilar(key, callGeminiRaw, usage, common, r) {
  if (!key || !callGeminiRaw) return null;
  const hard = hiddenGroup(common, r); if (!hard) return null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const themes = shuffle(THEMES, r).slice(0, 3);
      usage.requests++;
      const { out } = await callGeminiRaw(key, BAG_PROMPT.replace("KATEGORİLER", themes.join(" / ")).replace("YASAK", hard.k.join(", ")), STRONG);
      const gr = Array.isArray(out) ? (out[0]?.gruplar || out) : null;
      const groups = (gr || []).slice(0, 3).map(g => ({ ad: String(g.ad || "").trim(), z: +g.zorluk || 1, k: (g.kelimeler || []).map(x => String(x).trim().toLocaleUpperCase("tr")) }));
      groups.push({ ad: hard.ad, z: 4, k: hard.k });
      const all = groups.flatMap(g => g.k);
      if (!(groups.length === 4 && groups.every(g => g.k.length === 4 && g.ad) && new Set(all).size === 16 && all.every(w => /^[A-ZÇĞİÖŞÜ]{2,12}$/.test(w)))) continue;
      usage.requests++;
      const { out: chk } = await callGeminiRaw(key, CHECK_PROMPT + "\n\n" + groups.slice(0, 3).map((g, i) => `${i + 1}. ${g.ad}: ${g.k.join(", ")}`).join("\n"), STRONG);
      if (!Array.isArray(chk) || chk.length < 3 || chk.some(c => c.dogru === false)) continue;
      groups.sort((a, b) => a.z - b.z); groups.forEach((g, i) => g.z = i + 1);
      return { g: enc(groups) };
    } catch (e) {}
  }
  return null;
}

export async function dailyGames2({ prev, date, key, usage, callGeminiRaw, stories = [] }) {
  if (prev?.date === date && prev.sudoku && prev.harf && (prev.bag || !key)) return prev;
  const words = JSON.parse(await readFile(new URL("../data/sozluk.json", import.meta.url), "utf8"));
  const r = rng("nyt-" + date);
  const out = { date };
  out.sudoku = prev?.date === date && prev.sudoku ? prev.sudoku : sudoku(r);
  out.harf = prev?.date === date && prev.harf ? prev.harf : harfKutusu(words, r);
  if (prev?.date === date && prev.bag) out.bag = prev.bag;
  else if (key && usage) {
    // Yaygınlık ölçüsü: son günlerin haberlerinde küçük harfle geçen sözlük kelimeleri
    const dict = new Set(words), seen = new Set();
    stories.forEach(s => s.items.forEach(i => (i.title + " " + (i.summary || "")).split(/[^a-zçğıöşü]+/).forEach(w => { if (dict.has(w)) seen.add(w); })));
    out.bag = await baglantilar(key, callGeminiRaw, usage, [...seen], r);
  }
  return out;
}
