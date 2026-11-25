// Kelime Harmanı: günün kelimesi, o günün haberlerinde geçen 5 harfli bir sözlük kelimesinden seçilir.
// Gün boyunca aynı kalır (yayındaki bir önceki news.json’dan okunur).
import { readFile } from "node:fs/promises";

// Çözümler gündelik dilde tek başına anlam taşıyan kelimelerden seçilir.
// Tahminler için tam sözlük kullanılmaya devam eder.
const ANSWERS = new Set(
  `ahenk ahşap akort altın armut arıcı arşiv aslan atlas avize badem bahar bakla
   bakır balık belge beste biber biblo bilim bulut buluş buzul börek ceviz dalga
   davul demir deney deniz dergi desen dolap doruk duvar dünya ekmek ekran elmas
   fener fidan forma fosil gazel geyik gölge gümüş güney güneş güreş halat hamak
   hamur hasat hasır havlu havuç hekim helva hurma iklim incir iplik kabak kalem
   kanat kapak kavak kaval kavun kayak kayaç kazan kaşık keman kemer kiler kilim
   kiraz kitap konak konuk kovan kulis kumaş kutup kuzey kömür köprü kürek ladin
   levha liman limon lodos magma makas martı marul masal merak meyve mimar motor
   müzik mısır nakış nohut orman palto panda perde petek pilot plato pınar radar
   radyo rende resim reçel ritim robot roket roman sabah sabun sahne saman sanat
   saray sebze sedef sehpa semer sepet sergi servi simit sokak soğan söğüt süsen
   tabak takım tarih tarım taşra tenis tepsi teras terzi tilki tohum turna tuğla
   tünel türkü vagon vapur vaşak vişne yakut yamaç yarış yazar yağış yelek yonca
   yosun yılan zebra çadır çatal çayır çelik çilek çimen çizgi çizim çiçek çoban
   çorap çörek çınar çırak ölçüm ördek ırmak şahin şarkı şehir şeker`.split(/\s+/)
);
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
    const cands = [...count.entries()].filter(([w, n]) => n >= 2 && ANSWERS.has(w) && !used.has(w)).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w]) => w);
    const rnd = seeded(date);
    const pool = cands.length ? cands : [...ANSWERS].filter(w => dict.has(w) && !used.has(w));
    word = pool[Math.floor(rnd() * pool.length)];
    history.push(word);
  }
  // Kelimenin geçtiği güncel haberler (çözünce gösterilir)
  const re = new RegExp(`(^|[^a-zçğıöşü])${word}([^a-zçğıöşü]|$)`);
  const news = stories.filter(s => s.items.some(i => re.test(low(i.title + " " + (i.summary || ""))))).slice(0, 4)
    .map(s => ({ title: s.items[0].title, url: s.items[0].url, source: s.items[0].source }));
  return { date, w: enc(word), news: news.length ? news : (prevGame?.date === date ? prevGame.news || [] : []), extra: [...extra].slice(0, 1500), history };
}
