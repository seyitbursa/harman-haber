// Süper Lig puan durumu, haftanın maçları ve Türk takımlarının Avrupa maçları (ESPN’in açık veri adreslerinden).
// Resmi bir API değildir; erişilemezse bölüm sitede gizlenir.
const BASE = "https://site.api.espn.com/apis";
export const TR_NAMES = {
  "Galatasaray": "Galatasaray", "Fenerbahce": "Fenerbahçe", "Besiktas": "Beşiktaş", "Trabzonspor": "Trabzonspor",
  "Istanbul Basaksehir": "Başakşehir", "Basaksehir": "Başakşehir", "Kasimpasa": "Kasımpaşa", "Goztepe": "Göztepe",
  "Caykur Rizespor": "Çaykur Rizespor", "Alanyaspor": "Alanyaspor", "Genclerbirligi": "Gençlerbirliği", "Konyaspor": "Konyaspor",
  "Gaziantep FK": "Gaziantep FK", "Samsunspor": "Samsunspor", "Eyupspor": "Eyüpspor", "Kocaelispor": "Kocaelispor",
  "Çorum FK": "Çorum FK", "Corum FK": "Çorum FK", "Erzurum BB": "Erzurumspor FK", "Amed SFK": "Amed SFK", "Antalyaspor": "Antalyaspor",
  "Kayserispor": "Kayserispor", "Sivasspor": "Sivasspor", "Hatayspor": "Hatayspor", "Adana Demirspor": "Adana Demirspor",
  "Bodrumspor": "Bodrumspor", "Fatih Karagumruk": "Fatih Karagümrük", "Pendikspor": "Pendikspor", "Istanbulspor": "İstanbulspor",
  "Ankaragucu": "Ankaragücü", "Sakaryaspor": "Sakaryaspor", "Manisa FK": "Manisa FK", "Bandirmaspor": "Bandırmaspor", "Igdir FK": "Iğdır FK"
};
const trName = n => TR_NAMES[n] || n;
// Haberlerde takım adının geçtiği biçim (eşleştirme için kısa ad)
const SHORT = { "Çaykur Rizespor": "Rizespor", "Gaziantep FK": "Gaziantep", "Çorum FK": "Çorum", "Erzurumspor FK": "Erzurum", "Amed SFK": "Amed", "Fatih Karagümrük": "Karagümrük", "Manisa FK": "Manisa", "Iğdır FK": "Iğdır" };
const shortName = n => SHORT[n] || n;

async function get(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  try { const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "HarmanHaber/1.0" } }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");

function mapEvent(e, comp) {
  const c = e.competitions[0];
  const side = k => c.competitors.find(x => x.homeAway === k);
  const h = side("home"), a = side("away");
  return {
    id: e.id, comp, date: e.date,
    st: e.status.type.state,                // pre | in | post
    clock: e.status.displayClock || "", detail: e.status.type.shortDetail || "",
    h: { id: h.team.id, n: trName(h.team.displayName), s: e.status.type.state === "pre" ? null : h.score ?? null },
    a: { id: a.team.id, n: trName(a.team.displayName), s: e.status.type.state === "pre" ? null : a.score ?? null }
  };
}

export async function getSports({ stories }) {
  const out = { at: new Date().toISOString(), league: "Süper Lig", standings: [], matches: [], europe: [], errors: [] };
  try {
    const d = await get(`${BASE}/v2/sports/soccer/tur.1/standings`);
    const ch = d.children?.[0];
    out.season = ch?.name || null;
    out.standings = (ch?.standings?.entries || []).map(e => {
      const st = Object.fromEntries(e.stats.map(s => [s.name, s.value]));
      return { id: e.team.id, n: trName(e.team.displayName), ab: e.team.abbreviation, r: st.rank, p: st.points, o: st.gamesPlayed, g: st.wins, b: st.ties, m: st.losses, av: st.pointDifferential, note: e.note ? { d: e.note.description, c: e.note.color } : null };
    }).sort((a, b) => a.r - b.r);
  } catch (e) { out.errors.push("puan durumu: " + e.message); }

  // Lig: son 14 gün ve önümüzdeki 6 gün (milli maç arası olsa da son hafta görünsün); Avrupa: -3/+4 gün
  const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(ymd(new Date(Date.now() + i * 864e5))); return r; };
  const ids = new Set(out.standings.map(t => t.id));
  const comps = [["tur.1", "Süper Lig"], ["uefa.champions", "Şampiyonlar Ligi"], ["uefa.europa", "Avrupa Ligi"], ["uefa.europa.conf", "Konferans Ligi"]];
  const jobs = [];
  for (const [slug, name] of comps) for (const day of (slug === "tur.1" ? range(-14, 6) : range(-3, 4))) jobs.push(get(`${BASE}/site/v2/sports/soccer/${slug}/scoreboard?dates=${day}`).then(d => ({ slug, name, d })).catch(e => ({ slug, name, err: e.message })));
  const res = await Promise.all(jobs);
  const seen = new Set();
  for (const r of res) {
    if (r.err){ if (!out.errors.includes(r.slug)) out.errors.push(r.slug); continue; }
    for (const e of r.d.events || []) {
      if (seen.has(e.id)) continue; seen.add(e.id);
      const m = mapEvent(e, r.name);
      if (r.slug === "tur.1") out.matches.push(m);
      else if (ids.has(m.h.id) || ids.has(m.a.id)) out.europe.push(m);
    }
  }
  out.matches.sort((a, b) => a.date.localeCompare(b.date));
  out.europe.sort((a, b) => a.date.localeCompare(b.date));

  // Maçları haberlerle eşleştir: iki takımın adı da geçen, maçtan en fazla 2 gün önce/sonra yayımlanmış haberler
  const low = s => s.toLocaleLowerCase("tr");
  for (const m of [...out.matches, ...out.europe]) {
    const hn = low(shortName(m.h.n)), an = low(shortName(m.a.n)), t = new Date(m.date).getTime();
    m.news = stories.filter(s => Math.abs(new Date(s.date).getTime() - t) < 2 * 864e5)
      .filter(s => s.items.some(i => { const x = low(i.title + " " + (i.summary || "")); return x.includes(hn) && x.includes(an); }))
      .slice(0, 6).map(s => s.id);
  }
  return out;
}
