// Büyük haber ve deprem bildirimleri: ntfy.sh üzerinden, hesap gerektirmeden.
// Aynı olay iki kez bildirilmesin diye, yayındaki bir önceki news.json’daki "notified" listesine bakılır.

// Yayındaki bir önceki news.json (bildirim ve özet durumu için)
export async function previousJson() {
  const repo = process.env.GITHUB_REPOSITORY;              // "kullanici/repo"
  if (!repo) return null;
  const [owner, name] = repo.split("/");
  try {
    // Sunucunun kendi durumu (özet önbellekleri, arşivler) state.json’da; geçiş döneminde eski news.json’a da bakılır
    const base = `https://${owner.toLowerCase()}.github.io/${name}/`;
    const get = async f => { const r = await fetch(base + f + "?t=" + Date.now(), { headers: { "Cache-Control": "no-cache" } }); return r.ok ? r.json() : null; };
    const [state, news] = await Promise.all([get("state.json").catch(() => null), get("news.json").catch(() => null)]);
    return state ? { ...(news || {}), ...state } : news;
  } catch { return null; }
}

async function send(topic, { title, message, click, tags, priority }) {
  const r = await fetch("https://ntfy.sh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, title, message, click, tags, priority })
  });
  if (!r.ok) throw new Error("ntfy " + r.status);
}

export async function notify({ cfg, stories, quakes, sources, prev, dryRun }) {
  const now = Date.now();
  const keepMs = 72 * 3600e3;
  const state = {
    urls: (prev?.urls || []).filter(x => now - new Date(x.at) < keepMs),
    quakes: (prev?.quakes || []).filter(x => now - new Date(x.at) < keepMs)
  };
  const seenUrls = new Set(state.urls.flatMap(x => x.list));
  const seenQuakes = new Set(state.quakes.map(x => x.id));
  const sent = [];
  // İlk çalıştırmada (önceki durum yoksa) bildirim gönderme, yalnızca mevcutları işaretle
  const first = !prev;

  const big = stories
    .filter(s => s.items.length >= cfg.minSources && now - new Date(s.date) < 3 * 3600e3)
    .filter(s => !s.items.some(i => seenUrls.has(i.url)))
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, 2);
  for (const s of big) {
    const i = s.items[0];
    const names = s.items.map(x => sources[x.source]?.name || x.source);
    if (!first && !dryRun) {
      try {
        await send(cfg.ntfyTopic, { title: `${s.items.length} kaynak verdi`, message: `${i.title}\n${names.slice(0, 4).join(", ")}${names.length > 4 ? " ve diğerleri" : ""}`, click: i.url, tags: ["newspaper"], priority: 3 });
        sent.push("haber: " + i.title);
      } catch (e) { sent.push("HATA " + e.message); continue; }
    }
    state.urls.push({ at: new Date().toISOString(), list: s.items.map(x => x.url) });
  }

  const shakes = (quakes.items || [])
    .filter(q => q.mag >= cfg.minQuake && now - new Date(q.date) < 2 * 3600e3 && !seenQuakes.has(q.id))
    .slice(0, 2);
  for (const q of shakes) {
    if (!first && !dryRun) {
      const t = new Date(q.date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
      try {
        await send(cfg.ntfyTopic, { title: `${q.mag.toLocaleString("tr-TR")} büyüklüğünde deprem`, message: `${q.place}${q.near ? " (" + q.near + " yakını)" : ""}, saat ${t}, derinlik ${q.depth.toLocaleString("tr-TR")} km (AFAD)`, click: quakes.sourceUrl, tags: ["warning"], priority: q.mag >= 6 ? 5 : 4 });
        sent.push("deprem: " + q.place);
      } catch (e) { sent.push("HATA " + e.message); continue; }
    }
    state.quakes.push({ at: new Date().toISOString(), id: q.id });
  }
  return { state, sent, first };
}
