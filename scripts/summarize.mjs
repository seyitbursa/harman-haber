// "Özü" satırı: tık tuzağı başlıkların altına haberin asıl bilgisini tek cümleyle yazar.
// Google Gemini’nin ücretsiz katmanı kullanılır. Ücretsiz sınıra sığmak için 10 haber tek istekte gönderilir,
// önceki turlarda yazılan özetler yayındaki news.json’dan okunup yeniden kullanılır.

const MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];
const BATCH = 10;                 // istek başına haber
const MAX_REQ_PER_RUN = 3;        // tur başına en fazla istek
const MAX_REQ_PER_DAY = 400;      // ücretsiz sınırın altında kalmak için günlük tavan (UTC günü)
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
export async function callGeminiRaw(key, text) {
  let lastErr;
  for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1500, responseMimeType: "application/json" }
        })
      });
      if (r.status === 429 || r.status === 404 || r.status >= 500) { lastErr = new Error(model + " " + r.status); continue; }
      if (!r.ok) throw new Error(model + " " + r.status + " " + (await r.text()).slice(0, 200));
      const d = await r.json();
      const txt = d.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "[]";
      const arr = JSON.parse(txt.replace(/^```(json)?|```$/g, "").trim());
      return { model, out: Array.isArray(arr) ? arr : [] };
    } catch (e) { lastErr = e; }
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
- Ayrıca konuya 2–4 kelimelik, eksiz ve yalın bir başlık ver (ör. "Fon soruşturması", "CHP kurultay davası"). Konu adı birden çok kişiyi ya da olayı karıştırıyorsa başlığı en çok haberin ilgili olduğuna göre seç.
Yalnızca şu biçimde JSON dizi döndür: [{"k":1,"baslik":"...","oz":"..."}, ...]`;

export async function addTopicSummaries({ topics, stories, sources, prevTopicSums, usage, key, log = console.log }) {
  const now = Date.now();
  const cache = {};
  for (const [slug, v] of Object.entries(prevTopicSums || {})) if (now - new Date(v.at) < 24 * 3600e3) cache[slug] = v;
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
          cache[t.slug] = { oz, title: (o?.baslik || "").replace(/\s+/g, " ").trim().slice(0, 40) || null, at: new Date().toISOString(), urls: t.storyIds.map(id => byId[id]?.items[0]?.url).filter(Boolean) };
      });
    } catch (e) { log("  ✗ konu özeti → " + e.message); }
  }
  topics.forEach(t => { if (cache[t.slug]){ t.summary = cache[t.slug].oz; if (cache[t.slug].title) t.title = cache[t.slug].title; } });
  return cache;
}

// ---- "Fark ne?": aynı olayı farklı kesimlerden kaynakların neyi farklı vurguladığı ----
const FARK_PROMPT = `Sen tarafsız bir medya analistisin. Aşağıda aynı olayı veren haber başlıkları, kaynakların bağımsız kuruluşlarca yapılmış eğilim gruplarına göre ayrılmış olarak var.
Her olay için gruplar arasındaki vurgu farkını tek cümleyle yaz:
- En fazla 30 kelime. Grupları adıyla an ("Hükümete yakın kaynaklar ..., muhalefete yakın kaynaklar ...").
- Sadece başlıklarda görünen farkı anlat: hangi bilgiyi, kişiyi ya da yönü öne çıkardıkları. Hangisinin doğru olduğunu söyleme, yorum ve değerlendirme katma.
- Başlıklar aynı şeyi söylüyorsa ya da belirgin bir fark yoksa "" döndür.
Yalnızca şu biçimde JSON dizi döndür: [{"i":1,"fark":"..."}, ...]`;
const GLN = { hukumet: "Hükümete yakın", bagimsiz: "Bağımsız", muhalefet: "Muhalefete yakın" };
export async function addContrasts({ stories, sources, prevFark, usage, key, log = console.log }) {
  const now = Date.now(), cache = {};
  for (const [k, v] of Object.entries(prevFark || {})) if (now - new Date(v.at) < 48 * 3600e3) cache[k] = v;
  const keyOf = s => s.items.map(i => i.url).sort().slice(0, 6).join("|");
  const cands = stories.filter(s => now - new Date(s.date) < 36 * 3600e3 && s.items.length >= 3).map(s => {
    const g = {}; s.items.forEach(i => { const l = sources[i.source]?.lean; if (l) (g[l] = g[l] || []).push(i); });
    return { s, g };
  }).filter(x => x.g.hukumet && (x.g.muhalefet || x.g.bagimsiz));
  const todo = cands.filter(x => !(keyOf(x.s) in cache)).sort((a, b) => b.s.items.length - a.s.items.length).slice(0, 8);
  if (key && todo.length && usage.requests < MAX_REQ_PER_DAY) {
    const body = todo.map((x, n) => `#${n + 1}\n` + Object.entries(x.g).map(([l, its]) => `${GLN[l]}:\n` + its.slice(0, 4).map(i => `- ${sources[i.source]?.name}: ${i.title}`).join("\n")).join("\n")).join("\n\n");
    try {
      usage.requests++;
      const { out } = await callGeminiRaw(key, FARK_PROMPT + "\n\n" + body);
      todo.forEach((x, n) => { const o = out.find(r => r.i === n + 1); const f = (o?.fark || "").replace(/\s+/g, " ").trim();
        cache[keyOf(x.s)] = { f: f.length > 15 && !/[\u0400-\u04FF\u4E00-\u9FFF]/.test(f) ? f : "", at: new Date().toISOString() }; });
    } catch (e) { log("  ✗ fark özeti → " + e.message); }
  }
  for (const x of cands) { const c = cache[keyOf(x.s)]; if (c?.f) x.s.fark = c.f; }
  return cache;
}
