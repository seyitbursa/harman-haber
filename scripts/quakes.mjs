// Son depremler: AFAD’ın herkese açık deprem servisi (saatler UTC olarak gelir).
const URLS = [
  "https://servisnet.afad.gov.tr/apigateway/deprem/apiv2/event/filter",
  "https://deprem.afad.gov.tr/apiv2/event/filter"
];
const iso = d => d.toISOString().slice(0, 19);

export async function getQuakes({ hours = 48, minMag = 2.5, max = 60 } = {}) {
  const end = new Date(), start = new Date(Date.now() - hours * 3600e3);
  const qs = `?start=${iso(start)}&end=${iso(end)}&minmag=${minMag}&format=json&orderby=timedesc`;
  let lastErr;
  for (const base of URLS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(base + qs, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "GundemKutusu/1.0", "Accept": "application/json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const list = await r.json();
      if (!Array.isArray(list)) throw new Error("beklenmeyen yanıt");
      const items = list.slice(0, max).map(e => {
        // "Van Gölü - [07.74 km] Gevaş (Van)" → yer: "Van Gölü", yakın: "Gevaş (Van)"
        const raw = (e.location || "").trim();
        const m = raw.match(/^(.*?)\s*-\s*\[[\d.,\s]+km\]\s*(.*)$/i);
        return {
        id: String(e.eventID),
        mag: Math.round(parseFloat(e.magnitude) * 10) / 10,
        place: m ? m[1].trim() : raw,
        near: m && m[2] ? m[2].trim() : null,
        province: e.province || null,
        district: e.district || null,
        country: e.country || null,
        lat: parseFloat(e.latitude), lon: parseFloat(e.longitude),
        depth: Math.round(parseFloat(e.depth) * 10) / 10,
        date: new Date(e.date + (/[zZ]|[+-]\d\d:?\d\d$/.test(e.date) ? "" : "Z")).toISOString()
      }; }).filter(e => Number.isFinite(e.mag));
      return { source: "AFAD", sourceUrl: "https://deprem.afad.gov.tr/last-earthquakes", items };
    } catch (e) { lastErr = e; }
    finally { clearTimeout(timer); }
  }
  return { source: "AFAD", sourceUrl: "https://deprem.afad.gov.tr/last-earthquakes", items: [], error: String(lastErr?.message || lastErr) };
}
