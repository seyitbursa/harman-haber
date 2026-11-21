// "Özü" satırı: tık tuzağı başlıkların altına haberin asıl bilgisini tek cümleyle yazar.
// Google Gemini’nin ücretsiz katmanı kullanılır. Ücretsiz sınıra sığmak için 10 haber tek istekte gönderilir,
// önceki turlarda yazılan özetler yayındaki news.json’dan okunup yeniden kullanılır.

const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];
const BATCH = 10;                 // istek başına haber
const MAX_REQ_PER_RUN = 2;        // tur başına en fazla istek
const MAX_REQ_PER_DAY = +(process.env.GEMINI_DAILY_CAP || (process.env.GEMINI_API_KEY_2 ? 800 : 400));   // yedek anahtar varsa tavan iki katı      // ücretsiz sınırın altında kalmak için günlük tavan (UTC günü)
const TEXT_LEN = 1400;            // haber başına gönderilen metin (karakter)

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const decode = t => t
  .replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&[a-z]+;/gi, " ");

// Haber sayfasından metin: önce makale paragrafları, olmazsa sayfa açıklaması
async function articleText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9" } });
    if (!r.ok) return "";
    let html = (await r.text()).slice(0, 600000);
    html = html.replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|figure)[\s\S]*?<\/\1>/gi, " ");
    const desc = (html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)/i) || [])[1] || "";
    const scope = (html.match(/<article[\s\S]*?<\/article>/i) || [html])[0];
    const paras = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(m => decode(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
      .filter(p => p.length > 60 && !/çerez|cookie|abone ol|tüm hakları|kvkk|reklam/i.test(p));
    const text = [decode(desc), ...paras].join(" ").replace(/\s+/g, " ").trim();
    return text.slice(0, TEXT_LEN);
  } catch { return ""; }
  finally { clearTimeout(timer); }
}

// Tık tuzağına benzeyen başlıklar önce işlenir
const BAIT = /(\.\.\.|…|!|\?|işte|o isim|bakın|şok|flaş|herkes|meğer|ortaya çıktı|belli oldu|açıklandı|kim\b|neden|nasıl|ne kadar|hangi|son dakika|sürpriz|yok artık|dikkat|bomba)/i;

const PROMPT = `Sen bir Türk haber editörüsün. Aşağıda haber başlıkları ve haberlerin metninden kısa parçalar var.
Her haber için okuyucunun başlığa tıklamadan öğrenmek istediği asıl bilgiyi tek cümleyle yaz:
- Başlık bir şeyi saklıyorsa (kim, ne, ne kadar, nerede, nasıl) onu açıkça söyle.
- En fazla 25 kelime. Türkçe, düz ve tarafsız yaz; yorum, abartı, ünlem kullanma.
- Yalnızca verilen metindeki bilgiyi kullan, tahmin yürütme. Metinden cümle kopyalama, kendi cümlenle yaz.
- Metin asıl bilgiyi içermiyorsa ya da başlık zaten her şeyi söylüyorsa o haber için boş metin ("") döndür.
Yalnızca şu biçimde JSON dizi döndür, başka hiçbir şey yazma: [{"i":1,"oz":"..."}, ...]`;

async function callGemini(key, items) {
  const body = items.map((it, n) => `#${n + 1}\nBaşlık: ${it.title}\nMetin: ${it.text || it.summary || "(metin yok)"}`).join("\n\n");
  return callGeminiRaw(key, PROMPT + "\n\n" + body);
}
export async function callGeminiRaw(key, text, models = MODELS) {
  let lastErr;
  // Yedek anahtar (GEMINI_API_KEY_2): ilk anahtar kota sınırına (429) takılırsa aynı model onunla denenir
  const keys = [...new Set([key, process.env.GEMINI_API_KEY_2].filter(Boolean))];
  for (const model of models) {
    for (const k of keys) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": k },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 1500, responseMimeType: "application/json" }
          })
        });
        if (r.status === 429 || r.status === 401 || r.status === 403) { lastErr = new Error(model + " " + r.status + " (anahtar " + (keys.indexOf(k) + 1) + ")"); continue; }      // kota ya da anahtar sorunu: sıradaki anahtar
        if (r.status === 400) { const t = await r.text(); if (/api key|API_KEY/i.test(t)) { lastErr = new Error(model + " geçersiz anahtar " + (keys.indexOf(k) + 1)); continue; } throw new Error(model + " 400 " + t.slice(0, 200)); }
        if (r.status === 404 || r.status >= 500) { lastErr = new Error(model + " " + r.status); break; }          // sıradaki model
        if (!r.ok) throw new Error(model + " " + r.status + " " + (await r.text()).slice(0, 200));
        const d = await r.json();
        const txt = d.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "[]";
        const arr = JSON.parse(txt.replace(/^```(json)?|```$/g, "").trim());
        return { model: model + (keys.indexOf(k) ? " (yedek anahtar)" : ""), out: Array.isArray(arr) ? arr : [] };
      } catch (e) { lastErr = e; break; }
    }
  }
  throw lastErr || new Error("model yok");
}

export async function addGists({ stories, prevGists, prevUsage, key, log = console.log }) {
  const today = new Date().toISOString().slice(0, 10);
  const usage = prevUsage && prevUsage.day === today ? { ...prevUsage } : { day: today, requests: 0 };
  // Önceki özetleri (son 72 saat) taşı
  const now = Date.now();
  const gists = {};
  for (const [url, g] of Object.entries(prevGists || {})) if (now - new Date(g.at) < 72 * 3600e3) gists[url] = g;

  // Google News yönlendirme bağlantılarında makale metni okunamadığı için onlar özetlenmez
  const primaries = stories.map(s => s.items[0]).filter(i => !/^https:\/\/news\.google\.com\//.test(i.url));
  const todo = primaries
    .filter(i => !(i.url in gists))
    .sort((a, b) => (BAIT.test(b.title) - BAIT.test(a.title)) || b.date.localeCompare(a.date));

  let made = 0;
  if (key) {
    for (let r = 0; r < MAX_REQ_PER_RUN && todo.length && usage.requests < MAX_REQ_PER_DAY; r++) {
      const batch = todo.splice(0, BATCH);
      const texts = await Promise.all(batch.map(i => articleText(i.url)));
      const items = batch.map((i, n) => ({ title: i.title, summary: i.summary, text: texts[n] }));
      try {
        usage.requests++;
        const { model, out } = await callGemini(key, items);
        batch.forEach((i, n) => {
          const o = out.find(x => x.i === n + 1);
          let oz = (o?.oz || "").replace(/\s+/g, " ").trim();
          // Model bazen araya başka alfabeden harf karıştırıyor: kaynakta olmayan Kiril/Arap/Çin harfi varsa özeti atla
          const foreign = /[\u0400-\u04FF\u0600-\u06FF\u3040-\u30FF\u4E00-\u9FFF]/;
          if (foreign.test(oz) && !foreign.test(i.title + " " + (texts[n] || ""))) oz = "";
          gists[i.url] = { oz: oz.length > 8 ? oz : "", at: new Date().toISOString() };   // boş özet de saklanır: tekrar sorulmaz
          if (oz) made++;
        });
        usage.model = model;
      } catch (e) { log("  ✗ özet → " + e.message); break; }
    }
  }
  // Özetleri haberlere işle
  for (const s of stories) for (const i of s.items) if (gists[i.url]?.oz) i.gist = gists[i.url].oz;
  return { gists, usage, made, pending: todo.length };
}

// ---- Konu özetleri: "Gündemde" konularının her biri için 2–3 cümlelik tarafsız özet ----
const TOPIC_PROMPT = `Sen bir Türk haber editörüsün. Aşağıda gündemdeki konular ve her konudaki haber başlıkları (kaynak adıyla) var.
Her konu için okuyucuya ne olduğunu anlatan 2–3 cümlelik özet yaz:
- En fazla 60 kelime. Düz, tarafsız Türkçe; yorum, değerlendirme ya da sıfat yükleme yok.
- Yalnızca verilen başlık ve özetlerdeki bilgiyi kullan. Tarafların iddialarını kendi ağızlarından aktar ("X'e göre...").
- Kaynaklar birbiriyle çelişiyorsa bunu belirt.
- Ayrıca konuya 3–7 kelimelik bir başlık ver: başlıkta mutlaka kişi ya da kurum ve somut gelişme olsun (ör. "Fon soruşturmasında Altınbaş yakalandı", "CHP kurultay davası ertelendi", "Arda Güler Real Madrid'de sakatlandı").
- "Güncel gelişmeler", "X haberleri", "X açıklamaları", "son durum" gibi genel başlıklar YASAK.
- Bütün konu başlıkları birbirinden farklı olsun; iki konu aynı olayı anlatıyorsa bunu başlıklarda ayırt edici ayrıntıyla belirt.
- Konu adı birden çok kişiyi ya da olayı karıştırıyorsa başlığı en çok haberin ilgili olduğuna göre seç; ilgisiz kişileri özete katma.
Yalnızca şu biçimde JSON dizi döndür: [{"k":1,"baslik":"...","oz":"..."}, ...]`;

export async function addTopicSummaries({ topics, stories, sources, prevTopicSums, usage, key, log = console.log }) {
  const now = Date.now();
  const cache = {};
  for (const [slug, v] of Object.entries(prevTopicSums || {})) if (now - new Date(v.at) < 24 * 3600e3 && v.v === 2) cache[slug] = v;
  const byId = Object.fromEntries(stories.map(s => [s.id, s]));
  const need = topics.filter(t => {
    const c = cache[t.slug]; if (!c) return true;
    const urls = new Set(c.urls || []);
    const fresh = t.storyIds.map(id => byId[id]?.items[0]?.url).filter(u => u && !urls.has(u)).length;
    return fresh >= 2 || now - new Date(c.at) > 3 * 3600e3;
  }).slice(0, 6);
  if (key && need.length && usage.requests < MAX_REQ_PER_DAY) {
    const body = need.map((t, n) => {
      const lines = t.storyIds.slice(0, 12).map(id => byId[id]).filter(Boolean).map(s => {
        const i = s.items[0];
        return `- ${sources[i.source]?.name || i.source}: ${i.title}${i.gist ? " (" + i.gist + ")" : ""}`;
      });
      return `#${n + 1} Konu: ${t.label}\n${lines.join("\n")}`;
    }).join("\n\n");
    try {
      usage.requests++;
      const { out } = await callGeminiRaw(key, TOPIC_PROMPT + "\n\n" + body);
      need.forEach((t, n) => {
        const o = out.find(x => x.k === n + 1);
        const oz = (o?.oz || "").replace(/\s+/g, " ").trim();
        if (oz && !/[\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF]/.test(oz))
          cache[t.slug] = { v: 2, oz, title: (o?.baslik || "").replace(/\s+/g, " ").trim().slice(0, 60) || null, at: new Date().toISOString(), urls: t.storyIds.map(id => byId[id]?.items[0]?.url).filter(Boolean) };
      });
    } catch (e) { log("  ✗ konu özeti → " + e.message); }
  }
  const GENERIC_T = /^(güncel gelişmeler|son durum|son gelişmeler|.* haberleri|.* açıklamaları)$/i;
  topics.forEach(t => { if (cache[t.slug]){ t.summary = cache[t.slug].oz; const ti = cache[t.slug].title; if (ti && !GENERIC_T.test(ti)) t.title = ti; } });
  // Aynı başlığı taşıyan konuları ayırt et: ikinci ve sonrakilere konu anahtar kelimesini ekle
  const seen = new Map();
  topics.forEach(t => { const k = (t.title || t.label).toLocaleLowerCase("tr"); if (seen.has(k)) t.title = (t.title || t.label) + " (" + t.label + ")"; else seen.set(k, t); });
  return cache;
}

// ---- "Fark ne?" ve "Kaynaklar neyi öne çıkardı?" ----
// Yalnızca başlıklara bakılır; tam metin farklı ayrıntılar içerebilir.
const FARK_PROMPT = `Sen tarafsız bir medya analistisin. Aşağıda aynı olayı veren haber başlıkları, kaynak adlarıyla var. Bazı kaynakların yanında bağımsız kuruluşların eğilim grubu yazıyor.
Her olay için:
1) "gozlemler": başlıklar arasındaki 2 ya da 3 somut farkı yaz. Her gözlem en fazla 12 kelime ve o farkı taşıyan kaynakların adlarını listele. Örnek: {"g":"Yakalanma anını öne çıkardı","k":["NTV","Diken"]}, {"g":"Açıklamanın İçişleri Bakanlığından geldiğini başlığa taşıdı","k":["BirGün"]}.
2) "fark": gruplar (Hükümete yakın / Bağımsız / Muhalefete yakın) arasında belirgin bir vurgu farkı varsa tek cümle, en fazla 30 kelime; yoksa "".
Kurallar: Yalnızca başlıklarda görünen farkı anlat. Hangi kaynağın doğru olduğunu söyleme, yorum ve değerlendirme katma. Başlıklar aynı şeyi söylüyorsa "gozlemler": [] döndür.
Yalnızca şu biçimde JSON dizi döndür: [{"i":1,"fark":"...","gozlemler":[{"g":"...","k":["..."]}]}, ...]`;
const GLN = { hukumet: "Hükümete yakın", bagimsiz: "Bağımsız", muhalefet: "Muhalefete yakın" };
export async function addContrasts({ stories, sources, prevFark, usage, key, log = console.log }) {
  const now = Date.now(), cache = {};
  for (const [k, v] of Object.entries(prevFark || {})) if (now - new Date(v.at) < 48 * 3600e3 && v.v === 2) cache[k] = v;
  const keyOf = s => s.items.map(i => i.url).sort().slice(0, 6).join("|");
  const uniq = s => new Set(s.items.map(i => i.source)).size;
  const cands = stories.filter(s => now - new Date(s.date) < 36 * 3600e3 && uniq(s) >= 4).map(s => {
    const g = {}; s.items.forEach(i => { const l = sources[i.source]?.lean; if (l) (g[l] = g[l] || []).push(i); });
    return { s, g, cross: !!(g.hukumet && (g.muhalefet || g.bagimsiz)) };
  });
  const todo = cands.filter(x => !(keyOf(x.s) in cache)).sort((a, b) => uniq(b.s) - uniq(a.s)).slice(0, 6);
  const turn = Math.floor(Date.now() / (15 * 60000)) % 2 === 0;      // kotayı korumak için iki turda bir
  if (key && turn && todo.length && usage.requests < MAX_REQ_PER_DAY) {
    const body = todo.map((x, n) => `#${n + 1}\n` + x.s.items.slice(0, 10).map(i => `- ${sources[i.source]?.name || i.source}${sources[i.source]?.lean ? " (" + GLN[sources[i.source].lean] + ")" : ""}: ${i.title}`).join("\n")).join("\n\n");
    try {
      usage.requests++;
      const { out } = await callGeminiRaw(key, FARK_PROMPT + "\n\n" + body);
      todo.forEach((x, n) => {
        const o = out.find(r => r.i === n + 1) || {};
        const f = (o.fark || "").replace(/\s+/g, " ").trim();
        const nameToId = Object.fromEntries(x.s.items.map(i => [(sources[i.source]?.name || i.source).toLocaleLowerCase("tr"), i.source]));
        const obs = (o.gozlemler || []).slice(0, 3).map(g => ({ g: String(g.g || "").trim(), k: [...new Set((g.k || []).map(n => nameToId[String(n).toLocaleLowerCase("tr")]).filter(Boolean))] })).filter(g => g.g && g.k.length && !/[\u0400-\u04FF\u4E00-\u9FFF]/.test(g.g));
        cache[keyOf(x.s)] = { v: 2, f: x.cross && f.length > 15 && !/[\u0400-\u04FF\u4E00-\u9FFF]/.test(f) ? f : "", obs, at: new Date().toISOString() };
      });
    } catch (e) { log("  ✗ fark özeti → " + e.message); }
  }
  for (const x of cands) { const c = cache[keyOf(x.s)]; if (c?.f) x.s.fark = c.f; if (c?.obs?.length) x.s.obs = c.obs; }
  return cache;
}

// ---- Ortak olay başlığı: tek bir yayıncının yorum yüklü başlığı yerine, kim ne yaptı diyen tarafsız başlık ----
const NEUTRAL_PROMPT = `Sen tarafsız bir haber editörüsün. Aşağıda her biri aynı olayı anlatan haber başlıkları grupları var.
Her grup için olayı anlatan tek bir tarafsız başlık yaz:
- En fazla 12 kelime. Kim, ne yaptı ya da ne oldu: özne ve eylem açık olsun.
- Yorum, sıfat, abartı, ünlem ve tırnak içinde alıntı yok ("sert yanıt", "ifşa etti", "olay yaratan" gibi ifadeler kullanma).
- Yalnızca başlıkların hepsinde ya da çoğunda geçen bilgiyi kullan; tek bir yayıncının iddiasını gerçekmiş gibi yazma.
Yalnızca şu biçimde JSON dizi döndür: [{"i":1,"b":"..."}, ...]`;
export async function addNeutralTitles({ stories, sources, prev, usage, key, log = console.log }) {
  const now = Date.now(), cache = {};
  for (const [k, v] of Object.entries(prev || {})) if (now - new Date(v.at) < 48 * 3600e3) cache[k] = v;
  const keyOf = s => s.items[0].url;
  const uniq = s => new Set(s.items.map(i => i.source)).size;
  const cands = stories.filter(s => uniq(s) >= 3 && now - new Date(s.date) < 36 * 3600e3);
  const todo = cands.filter(s => !(keyOf(s) in cache) || (cache[keyOf(s)].n < uniq(s) - 2)).sort((a, b) => uniq(b) - uniq(a)).slice(0, 15);
  const turn = Math.floor(Date.now() / (15 * 60000)) % 2 === 1 || todo.length >= 8;
  if (key && turn && todo.length && usage.requests < MAX_REQ_PER_DAY) {
    const body = todo.map((s, n) => `#${n + 1}\n` + s.items.slice(0, 8).map(i => `- ${sources[i.source]?.name || i.source}: ${i.title}`).join("\n")).join("\n\n");
    try {
      usage.requests++;
      const { out } = await callGeminiRaw(key, NEUTRAL_PROMPT + "\n\n" + body);
      todo.forEach((s, n) => { const o = out.find(r => r.i === n + 1); const b = (o?.b || "").replace(/\s+/g, " ").replace(/[!]+/g, "").trim();
        if (b.length > 10 && b.length < 140 && !/[\u0400-\u04FF\u4E00-\u9FFF]/.test(b)) cache[keyOf(s)] = { b, n: uniq(s), at: new Date().toISOString() }; });
    } catch (e) { log("  ✗ ortak başlık → " + e.message); }
  }
  for (const s of cands) { const c = cache[keyOf(s)]; if (c?.b) s.neutral = c.b; }
  return cache;
}

// ---- Haber detay sayfası: "Öne çıkanlar" (3–4 kısa madde) ----
// Yalnızca 3+ kaynaklı olaylar için; haber metnini yeniden yazmaz, okumaya teşvik edecek kadar kısa olgular çıkarır.
const HL_PROMPT = `Sen bir haber editörüsün. Aşağıdaki her haber için metinden 3 ya da 4 kısa "öne çıkan" madde çıkar:
- Her madde en fazla 15 kelime; kim, ne, nerede, ne zaman, rakamlar gibi somut olgular.
- Kendi cümlelerinle yaz; metinden uzun alıntı yapma (en fazla 3–4 kelimelik tırnak).
- Yalnızca metinde geçen bilgiyi kullan; yorum, değerlendirme ve tahmin ekleme.
- Metin yoksa ya da yetersizse boş dizi döndür.
Yalnızca şu biçimde JSON dizi döndür: [{"i":1,"m":["...","..."]}, ...]`;
export async function addHighlights({ stories, prev, usage, key, log = console.log }) {
  const now = Date.now(), cache = {};
  for (const [k, v] of Object.entries(prev || {})) if (now - new Date(v.at) < 72 * 3600e3) cache[k] = v;
  const uniq = s => new Set(s.items.map(i => i.source)).size;
  const cands = stories.filter(s => uniq(s) >= 3 && now - new Date(s.date) < 36 * 3600e3);
  const todo = cands.filter(s => !cache[s.items[0].url]).sort((a, b) => uniq(b) - uniq(a)).slice(0, 5);
  if (key && todo.length && usage.requests < MAX_REQ_PER_DAY) {
    const texts = await Promise.all(todo.map(async s => { for (const i of s.items.slice(0, 3)) { if (/news\.google\.com/.test(i.url)) continue; const t = await articleText(i.url).catch(() => ""); if (t && t.length > 400) return t.slice(0, 3500); } return ""; }));
    const body = todo.map((s, n) => `#${n + 1}\nBaşlık: ${s.items[0].title}\nMetin: ${texts[n] || "(metin yok)"}`).join("\n\n");
    try {
      usage.requests++;
      const { out } = await callGeminiRaw(key, HL_PROMPT + "\n\n" + body);
      todo.forEach((s, n) => { const o = out.find(r => r.i === n + 1); const m = (o?.m || []).map(x => String(x).replace(/\s+/g, " ").trim()).filter(x => x.length > 8 && x.length < 160 && !/[\u0400-\u04FF\u4E00-\u9FFF]/.test(x)).slice(0, 4);
        cache[s.items[0].url] = { m, at: new Date().toISOString() }; });
    } catch (e) { log("  ✗ öne çıkanlar → " + e.message); }
  }
  for (const s of cands) { const c = cache[s.items[0].url]; if (c?.m?.length) s.hl = c.m; }
  return cache;
}
