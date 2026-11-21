// Arama motorları ve paylaşım için sabit sayfalar: konu sayfaları, günlük gündem arşivi, site haritası, RSS, robots.txt.
// Uygulama tek sayfa ve "#" adresleriyle çalıştığı için Google içeriği göremiyor; bu sayfalar o boşluğu kapatır.
import { writeFile, mkdir, readFile } from "node:fs/promises";

const SITE = "https://harmanhaber.app";
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const trDate = d => new Date(d + "T12:00:00+03:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
const todayTR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const GL = { hukumet: "Hükümete yakın", bagimsiz: "Bağımsız", muhalefet: "Muhalefete yakın" };

async function page({ path, title, desc, body, jsonld, appLink }) {
  const logo = await readFile(new URL("./logo-inline.svg", import.meta.url), "utf8");
  const url = SITE + path;
  const html = `<!DOCTYPE html>
<html lang="tr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Harman Haber">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/icons/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="Harman Haber" href="/rss.xml">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<style>
:root{--paper:#F4F6F9;--surface:#fff;--ink:#14213D;--ink-2:#4F5A70;--ink-3:#737D92;--line:#E2E6ED;--accent:#2350E6;--g-hukumet:#6D28D9;--g-bagimsiz:#94A3B8;--g-muhalefet:#0F766E}
@media (prefers-color-scheme:dark){:root{--paper:#0E1424;--surface:#161E31;--ink:#E9EDF5;--ink-2:#B4BDCE;--ink-3:#8C96AA;--line:#28324B;--accent:#8AA4FF}}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
.w{max-width:760px;margin:0 auto;padding:16px}
header{background:var(--surface);border-bottom:1px solid var(--line)} header .w{display:flex;align-items:center;justify-content:space-between;padding-top:12px;padding-bottom:12px}
.logo{height:28px;width:auto;display:block} .lg-i{fill:var(--ink)} .lg-a{fill:var(--accent)}
a{color:inherit} .cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;border-radius:10px;padding:10px 16px}
h1{font-size:clamp(28px,6vw,40px);line-height:1.1;margin:18px 0 8px;letter-spacing:-.02em}
h2{font-size:20px;margin:26px 0 8px}
.card{background:var(--surface);border-radius:14px;padding:14px 16px;box-shadow:0 1px 0 var(--line);margin:10px 0}
.sum{font-size:17px} .sum b{color:var(--accent)}
.muted{color:var(--ink-3);font-size:14px}
ul.l{list-style:none;margin:0;padding:0} ul.l li{padding:9px 0;border-top:1px solid var(--line)} ul.l li:first-child{border-top:0}
ul.l a{text-decoration:none;font-weight:600} ul.l a:hover{color:var(--accent)} ul.l small{display:block;color:var(--ink-3);font-size:13px}
.tag{display:inline-block;font-size:12px;font-weight:700;border-radius:6px;padding:1px 7px;color:#fff;margin-right:6px}
.hukumet{background:var(--g-hukumet)} .bagimsiz{background:var(--g-bagimsiz)} .muhalefet{background:var(--g-muhalefet)}
footer{color:var(--ink-3);font-size:13px;padding:30px 0}
</style></head><body>
<header><div class="w"><a href="/" aria-label="Harman Haber ana sayfa">${logo}</a><a class="cta" href="${esc(appLink || "/")}">Canlı gündemi aç</a></div></header>
<main class="w">${body}</main>
<footer class="w"><p><b>Harman Haber</b>: haberin özü, her kaynaktan. 40’a yakın Türk haber kaynağını tek yerde toplar, bir olayı kimin nasıl verdiğini yan yana gösterir.</p>
<p><a href="/">Ana sayfa</a> · <a href="/gundem/">Gündem arşivi</a> · <a href="/resmi-gazete/">Resmî Gazete özeti</a> · <a href="/rss.xml">RSS</a></p></footer>
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "3eae1e480b86457fa28243ab3d96bec2"}'></script>
</body></html>`;
  const dir = new URL("../public" + path, import.meta.url);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("index.html", dir), html);
}

function itemList(items, sources, noTag) {
  return `<ul class="l">${items.map(i => {
    const s = sources[i.s] || { name: i.s }; const lean = s.lean && !noTag ? `<span class="tag ${s.lean}">${GL[s.lean]}</span>` : "";
    return `<li><a href="${esc(i.u)}" rel="nofollow noopener" target="_blank">${esc(i.t)}</a><small>${lean}${esc(s.name)}${i.g ? " · Özü: " + esc(i.g) : ""}</small></li>`;
  }).join("")}</ul>`;
}

export async function buildStatic({ stories, topics, sources, prev, rg }) {
  const today = todayTR();
  const byId = Object.fromEntries(stories.map(s => [s.id, s]));
  const pick = s => ({ t: s.items[0].title, u: s.items[0].url, s: s.items[0].source, g: s.items[0].gist || null, n: s.items.length });

  // Konu sayfaları: 14 gün saklanır, böylece paylaşılan bağlantılar hemen ölmez
  const topicPages = Object.fromEntries(Object.entries(prev?.topicPages || {}).filter(([, v]) => Date.now() - new Date(v.at) < 14 * 864e5));
  for (const t of topics) {
    if (!t.slug || !t.storyIds?.length) continue;
    const list = t.storyIds.map(id => byId[id]).filter(Boolean).flatMap(s => s.items.map(i => ({ t: i.title, u: i.url, s: i.source, g: i.gist || null }))).slice(0, 40);
    topicPages[t.slug] = { title: t.title || t.label, summary: t.summary || null, items: list, at: new Date().toISOString(), first: topicPages[t.slug]?.first || new Date().toISOString() };
  }
  for (const [slug, p] of Object.entries(topicPages)) {
    const groups = ["hukumet", "bagimsiz", "muhalefet"].map(g => [g, p.items.filter(i => sources[i.s]?.lean === g)]);
    const desc = p.summary || `${p.title}: ${p.items.length} haber, ${new Set(p.items.map(i => i.s)).size} kaynak. Kim nasıl verdi, yan yana.`;
    const body = `<p class="muted">Konu · ${new Date(p.at).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "long", timeStyle: "short" })} itibarıyla</p>
<h1>${esc(p.title)}</h1>
${p.summary ? `<div class="card sum"><b>Özet:</b> ${esc(p.summary)}<div class="muted">Başlıklardan yapay zekâyla çıkarılmıştır; hata içerebilir.</div></div>` : ""}
<h2>Kim nasıl verdi?</h2>
${groups.filter(([, l]) => l.length).map(([g, l]) => `<div class="card"><b>${GL[g]}</b>${itemList(l.slice(0, 6), sources, true)}</div>`).join("")}
<h2>Tüm haberler</h2><div class="card">${itemList(p.items, sources)}</div>
<p><a class="cta" href="/#konu-${esc(slug)}">Bu konuyu Harman Haber’de canlı takip et</a></p>`;
    await page({ path: `/konu/${slug}/`, title: `${p.title}: son gelişmeler ve kaynaklar | Harman Haber`, desc, body, appLink: `/#konu-${slug}`,
      jsonld: { "@context": "https://schema.org", "@type": "CollectionPage", name: p.title, description: desc, url: `${SITE}/konu/${slug}/`, dateModified: p.at, datePublished: p.first,
        isPartOf: { "@type": "WebSite", name: "Harman Haber", url: SITE },
        mainEntity: { "@type": "ItemList", itemListElement: p.items.slice(0, 20).map((i, k) => ({ "@type": "ListItem", position: k + 1, url: i.u, name: i.t })) } } });
  }

  // Günlük gündem: bugünün en çok kaynağın verdiği olayları; 30 gün arşiv
  const archive = (prev?.archive || []).filter(a => a.date !== today && Date.now() - new Date(a.date) < 31 * 864e5);
  const since = Date.now() - 24 * 3600e3;
  const top = stories.filter(s => new Date(s.date).getTime() >= since).sort((a, b) => b.items.length - a.items.length || b.date.localeCompare(a.date)).slice(0, 15).map(pick);
  archive.unshift({ date: today, top, topics: topics.filter(t => t.slug).map(t => ({ slug: t.slug, title: t.title || t.label, summary: t.summary || null })) });
  for (const a of archive) {
    const title = `${trDate(a.date)} gündemi: günün en çok konuşulan haberleri | Harman Haber`;
    const desc = `${trDate(a.date)} gündeminde en çok kaynağın verdiği haberler: ${a.top.slice(0, 3).map(x => x.t).join("; ")}.`;
    const body = `<p class="muted">Günlük gündem</p><h1>${trDate(a.date)} gündemi</h1>
${a.topics.length ? `<h2>Günün konuları</h2>${a.topics.map(t => `<div class="card"><a href="/konu/${esc(t.slug)}/"><b>${esc(t.title)}</b></a>${t.summary ? `<p>${esc(t.summary)}</p>` : ""}</div>`).join("")}` : ""}
<h2>En çok kaynağın verdiği haberler</h2><div class="card"><ul class="l">${a.top.map(x => `<li><a href="${esc(x.u)}" rel="nofollow noopener" target="_blank">${esc(x.t)}</a><small>${x.n} kaynak verdi · ${esc(sources[x.s]?.name || x.s)}${x.g ? " · Özü: " + esc(x.g) : ""}</small></li>`).join("")}</ul></div>
<p><a class="cta" href="/">Canlı gündemi aç</a></p>`;
    await page({ path: `/gundem/${a.date}/`, title, desc, body,
      jsonld: { "@context": "https://schema.org", "@type": "CollectionPage", name: `${trDate(a.date)} gündemi`, description: desc, url: `${SITE}/gundem/${a.date}/`, datePublished: a.date } });
  }
  await page({ path: "/gundem/", title: "Gündem arşivi | Harman Haber", desc: "Son 30 günün gündemi: her gün en çok kaynağın verdiği haberler ve günün konuları.",
    body: `<h1>Gündem arşivi</h1><div class="card"><ul class="l">${archive.map(a => `<li><a href="/gundem/${a.date}/">${trDate(a.date)}</a><small>${esc(a.top.slice(0, 2).map(x => x.t).join(" · "))}</small></li>`).join("")}</ul></div>`,
    jsonld: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Gündem arşivi", url: `${SITE}/gundem/` } });

  // Haber detay sayfaları: 3+ kaynaklı olaylar, 7 gün saklanır (adres uygulamadaki #h-<olay> ile aynı anahtarı kullanır)
  const urlKey = u => { let h = 5381; for (const c of u) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h.toString(36); };
  const detailPages = Object.fromEntries(Object.entries(prev?.detailPages || {}).filter(([, v]) => Date.now() - new Date(v.at) < 7 * 864e5));
  for (const st of stories) {
    const srcs = [...new Set(st.items.map(i => i.source))];
    if (srcs.length < 3) continue;
    const k = urlKey(st.items[0].url), seen = new Set();
    detailPages[k] = { t: (st.neutral || st.items[0].title).replace(/\.$/, ""), g: st.items[0].gist || null, hl: st.hl || [], img: st.items[0].image || null, first: st.first || st.date, at: st.date,
      origin: st.origin || null, items: st.items.filter(i => !seen.has(i.source) && seen.add(i.source)).map(i => ({ t: i.title, u: i.url, s: i.source, d: i.date })) };
  }
  for (const [k, d] of Object.entries(detailPages)) {
    const groups = ["hukumet", "bagimsiz", "muhalefet"].map(g => [g, d.items.filter(i => sources[i.s]?.lean === g)]).filter(([, l]) => l.length);
    const un = d.items.filter(i => !sources[i.s]?.lean);
    const desc = d.g || (d.t + ": " + d.items.length + " kaynağın başlıkları yan yana.");
    const when = new Date(d.at).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "long", timeStyle: "short" });
    const body = `<p class="muted">${d.items.length} kaynak verdi · ${esc(when)}</p>
<h1>${esc(d.t)}</h1>
${d.g ? `<div class="card sum"><b>Özü:</b> ${esc(d.g)}</div>` : ""}
${d.hl.length ? `<div class="card"><b>Öne çıkanlar</b><ul>${d.hl.map(x => `<li>${esc(x)}</li>`).join("")}</ul><p class="muted">Haber metninden yapay zekâyla çıkarılmıştır; ayrıntılar için haberin tamamını kaynağında okuyun.</p></div>` : ""}
${d.origin ? `<p class="muted">${d.items.length} yayın · ${d.origin.n} tanesi ${esc(d.origin.ag)} imzası taşıyor</p>` : ""}
<p><a class="cta" href="/#h-${k}">Harman Haber’de karşılaştır</a></p>
<h2>Kim nasıl verdi?</h2>
${groups.map(([g, l]) => `<div class="card"><b>${GL[g]}</b>${itemList(l.map(i => ({ t: i.t, u: i.u, s: i.s })), sources, true)}</div>`).join("")}
${un.length ? `<div class="card"><b>Sınıflandırma dışı</b>${itemList(un.map(i => ({ t: i.t, u: i.u, s: i.s })), sources, true)}</div>` : ""}`;
    await page({ path: `/haber/${k}/`, title: `${d.t} | ${d.items.length} kaynak karşılaştırması | Harman Haber`, desc, body, appLink: `/#h-${k}`,
      jsonld: { "@context": "https://schema.org", "@type": "CollectionPage", name: d.t, description: desc, url: `${SITE}/haber/${k}/`, datePublished: d.first, dateModified: d.at,
        isPartOf: { "@type": "WebSite", name: "Harman Haber", url: SITE }, ...(d.img ? { image: d.img } : {}),
        mainEntity: { "@type": "ItemList", itemListElement: d.items.map((i, n) => ({ "@type": "ListItem", position: n + 1, url: i.u, name: i.t })) } } });
  }

  // Resmî Gazete: günün sayısı ve 30 günlük arşiv (sade özetlerle)
  const rgArchive = (prev?.rgArchive || []).filter(x => x.date !== rg?.date && Date.now() - new Date(x.date) < 31 * 864e5);
  if (rg?.items?.length) rgArchive.unshift({ date: rg.date, pdf: rg.pdf, items: rg.items.map(i => ({ sec: i.sec, title: i.title, url: i.url, sade: i.sade || null, ozet: i.ozet || null, etki: i.etki || null, onem: i.onem || 1 })) });
  rgArchive.sort((a, b) => b.date.localeCompare(a.date));
  const rgBody = x => `<p class="muted">Resmî Gazete</p><h1>${trDate(x.date)} Resmî Gazete özeti</h1>
<div class="card">${x.pdf ? `<a href="${esc(x.pdf)}" rel="noopener" target="_blank">Resmî metin (PDF)</a> · ` : ""}<span class="muted">Sade özetler yapay zekâyla çıkarılır, hukuki tavsiye değildir; bağlayıcı olan resmî metindir.</span></div>
${[...x.items].sort((a, b) => b.onem - a.onem).map(i => `<div class="card"><h2 style="margin:0 0 6px">${esc(i.sade || i.title)}</h2>${i.ozet ? `<p>${esc(i.ozet)}</p>` : ""}${i.etki ? `<p><b>Kimi etkiler:</b> ${esc(i.etki)}</p>` : ""}<p class="muted">${esc(i.title)} · <a href="${esc(i.url)}" rel="noopener" target="_blank">Resmî metin</a></p></div>`).join("")}
${rgArchive.length > 1 ? `<h2>Önceki sayılar</h2><div class="card"><ul class="l">${rgArchive.filter(y => y.date !== x.date).slice(0, 10).map(y => `<li><a href="/resmi-gazete/${y.date}/">${trDate(y.date)}</a><small>${esc(y.items.slice(0, 2).map(i => i.sade || i.title).join(" · "))}</small></li>`).join("")}</ul></div>` : ""}
<p><a class="cta" href="/#resmigazete">Harman Haber’de aç</a></p>`;
  for (const x of rgArchive) {
    const desc = `${trDate(x.date)} Resmî Gazete’de neler var? ${x.items.slice(0, 3).map(i => i.sade || i.title).join("; ")}.`;
    await page({ path: `/resmi-gazete/${x.date}/`, title: `${trDate(x.date)} Resmî Gazete özeti: bugün neler değişti? | Harman Haber`, desc, body: rgBody(x), appLink: "/#resmigazete",
      jsonld: { "@context": "https://schema.org", "@type": "CollectionPage", name: `${trDate(x.date)} Resmî Gazete özeti`, description: desc, url: `${SITE}/resmi-gazete/${x.date}/`, datePublished: x.date } });
  }
  if (rgArchive[0]) await page({ path: "/resmi-gazete/", title: "Bugünkü Resmî Gazete özeti: sade dille | Harman Haber",
    desc: `Bugünkü (${trDate(rgArchive[0].date)}) Resmî Gazete’deki düzenlemeler, sade Türkçe özet ve kimi etkilediğiyle.`, body: rgBody(rgArchive[0]), appLink: "/#resmigazete",
    jsonld: { "@context": "https://schema.org", "@type": "CollectionPage", name: "Bugünkü Resmî Gazete özeti", url: `${SITE}/resmi-gazete/` } });

  // Site haritası, robots.txt, RSS
  const urls = [[`${SITE}/`, new Date().toISOString(), "always"], [`${SITE}/gundem/`, new Date().toISOString(), "daily"],
    ...archive.map(a => [`${SITE}/gundem/${a.date}/`, a.date, a.date === today ? "hourly" : "never"]),
    ...Object.entries(topicPages).map(([slug, p]) => [`${SITE}/konu/${slug}/`, p.at, "hourly"]),
    ...Object.entries(detailPages).map(([k, d]) => [`${SITE}/haber/${k}/`, d.at, "hourly"]),
    ...(rgArchive.length ? [[`${SITE}/resmi-gazete/`, rgArchive[0].date, "daily"]] : []),
    ...rgArchive.map(x => [`${SITE}/resmi-gazete/${x.date}/`, x.date, "never"])];
  await writeFile(new URL("../public/sitemap.xml", import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d, f]) => `<url><loc>${u}</loc><lastmod>${new Date(d).toISOString()}</lastmod><changefreq>${f}</changefreq></url>`).join("\n")}\n</urlset>\n`);
  await writeFile(new URL("../public/robots.txt", import.meta.url), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  const rssItems = [...archive.slice(0, 10).map(a => ({ t: `${trDate(a.date)} gündemi`, u: `${SITE}/gundem/${a.date}/`, d: a.date + "T08:00:00+03:00", s: a.top.slice(0, 5).map(x => x.t).join(" · ") })),
    ...Object.entries(topicPages).map(([slug, p]) => ({ t: p.title, u: `${SITE}/konu/${slug}/`, d: p.at, s: p.summary || "" })),
    ...rgArchive.slice(0, 10).map(x => ({ t: `${trDate(x.date)} Resmî Gazete özeti`, u: `${SITE}/resmi-gazete/${x.date}/`, d: x.date + "T07:00:00+03:00", s: x.items.slice(0, 4).map(i => i.sade || i.title).join(" · ") }))].sort((a, b) => new Date(b.d) - new Date(a.d)).slice(0, 40);
  await writeFile(new URL("../public/rss.xml", import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Harman Haber</title><link>${SITE}/</link><description>Haberin özü, her kaynaktan.</description><language>tr</language>\n${rssItems.map(i => `<item><title>${esc(i.t)}</title><link>${i.u}</link><guid>${i.u}</guid><pubDate>${new Date(i.d).toUTCString()}</pubDate><description>${esc(i.s)}</description></item>`).join("\n")}\n</channel></rss>\n`);
  return { topicPages, archive, rgArchive, detailPages, count: Object.keys(topicPages).length + archive.length + rgArchive.length + Object.keys(detailPages).length };
}
