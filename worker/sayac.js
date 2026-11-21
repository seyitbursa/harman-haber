// Harman Haber anonim sayaç (Cloudflare Worker + D1).
// Kişisel veri, IP ya da cihaz kimliği saklanmaz; yalnızca "gün + olay adı → sayı" tutulur.
const ORIGINS = ["https://harmanhaber.app", "https://www.harmanhaber.app", "https://seyitbursa.github.io"];
const NAME = /^[a-z0-9çğıöşü:_-]{2,48}$/;
const trDay = (offset = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(Date.now() + offset * 864e5));
function cors(req, extra = {}) {
  const o = req.headers.get("Origin");
  return { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin", ...extra };
}
const json = (req, data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: cors(req, { "Content-Type": "application/json; charset=utf-8", ...extra }) });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });

    // Olay kaydı: {"e": ["oyun:kelime:bitti", ...]} (en fazla 25 olay)
    if (req.method === "POST" && url.pathname === "/e") {
      const o = req.headers.get("Origin");
      if (o && !ORIGINS.includes(o)) return new Response("", { status: 403 });
      let body; try { body = JSON.parse(await req.text()); } catch { return new Response("", { status: 400 }); }
      const evs = [...new Set((body.e || []).slice(0, 25).map(String).filter(x => NAME.test(x)))];
      if (!evs.length) return new Response(null, { status: 204, headers: cors(req) });
      const day = trDay();
      const st = env.DB.prepare("INSERT INTO sayac (gun, olay, n) VALUES (?1, ?2, 1) ON CONFLICT(gun, olay) DO UPDATE SET n = n + 1");
      await env.DB.batch(evs.map(e => st.bind(day, e)));
      return new Response(null, { status: 204, headers: cors(req) });
    }

    // Herkese açık özet: bugünkü oyun sayıları (5 dakika önbellek)
    if (req.method === "GET" && url.pathname === "/public") {
      const { results } = await env.DB.prepare("SELECT olay, n FROM sayac WHERE gun = ?1 AND (olay LIKE 'oyun:%' OR olay = 'ziyaret:oyunlar')").bind(trDay()).all();
      return json(req, { gun: trDay(), sayac: Object.fromEntries(results.map(r => [r.olay, r.n])) }, 200, { "Cache-Control": "public, max-age=300" });
    }

    // Yönetici istatistikleri: son N gün, anahtar gerekir
    if (req.method === "GET" && url.pathname === "/stats") {
      if (!env.ADMIN_KEY || url.searchParams.get("key") !== env.ADMIN_KEY) return json(req, { hata: "yetkisiz" }, 401);
      const days = Math.min(90, Math.max(1, +url.searchParams.get("gun") || 30));
      const { results } = await env.DB.prepare("SELECT gun, olay, n FROM sayac WHERE gun >= ?1 ORDER BY gun").bind(trDay(-days + 1)).all();
      return json(req, { bugun: trDay(), satirlar: results }, 200, { "Cache-Control": "no-store" });
    }
    // ---- Doğrulama onayları (editör): Teyit analizi ↔ haber ----
    if (req.method === "GET" && url.pathname === "/onaylar") {
      const { results } = await env.DB.prepare("SELECT teyit, haber, iddia, sonuc, baslik, at FROM onay ORDER BY at DESC LIMIT 200").all();
      return json(req, { onaylar: results }, 200, { "Cache-Control": "public, max-age=120" });
    }
    if (req.method === "POST" && (url.pathname === "/onay" || url.pathname === "/onay-sil")) {
      let b; try { b = JSON.parse(await req.text()); } catch { return json(req, { hata: "geçersiz" }, 400); }
      if (!env.ADMIN_KEY || b.key !== env.ADMIN_KEY) return json(req, { hata: "yetkisiz" }, 401);
      const ok = u => typeof u === "string" && /^https:\/\//.test(u) && u.length < 600;
      if (!ok(b.teyit) || !ok(b.haber)) return json(req, { hata: "adres" }, 400);
      if (url.pathname === "/onay-sil") { await env.DB.prepare("DELETE FROM onay WHERE teyit = ?1 AND haber = ?2").bind(b.teyit, b.haber).run(); return json(req, { tamam: true }); }
      const clip = (x, n) => String(x || "").slice(0, n);
      await env.DB.prepare("INSERT OR REPLACE INTO onay (teyit, haber, iddia, sonuc, baslik, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(b.teyit, b.haber, clip(b.iddia, 200), clip(b.sonuc, 40), clip(b.baslik, 200), new Date().toISOString()).run();
      return json(req, { tamam: true });
    }
    return new Response("Harman Haber sayaç", { status: 404 });
  }
};
