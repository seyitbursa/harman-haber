// Sosyal medyaya otomatik paylaşım (isteğe bağlı): Telegram kanalı ve Bluesky.
// İlgili gizli değişkenler (secrets) tanımlı değilse hiçbir şey yapmaz.
//  - Her sabah 08.00’den sonra bir kez: günün gündemi (günlük sayfaya bağlantıyla)
//  - Gün içinde: 5 ve daha fazla kaynağın verdiği olaylar (günde en fazla 4)
const SITE = "https://harmanhaber.app";
const trToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const trHour = () => +new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23" }).format(new Date());

async function telegram(text) {
  const { TELEGRAM_BOT_TOKEN: tok, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!tok || !chat) return false;
  const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: false }) });
  if (!r.ok) throw new Error("Telegram " + r.status);
  return true;
}

let bskySession = null;
async function bluesky(text, link, title, desc) {
  const { BSKY_HANDLE: h, BSKY_APP_PASSWORD: pw } = process.env;
  if (!h || !pw) return false;
  if (!bskySession) {
    const r = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: h, password: pw }) });
    if (!r.ok) throw new Error("Bluesky oturum " + r.status);
    bskySession = await r.json();
  }
  const t = text.length > 290 ? text.slice(0, 287) + "…" : text;
  const record = { $type: "app.bsky.feed.post", text: t, createdAt: new Date().toISOString(), langs: ["tr"],
    embed: { $type: "app.bsky.embed.external", external: { uri: link, title: title.slice(0, 300), description: (desc || "").slice(0, 300) } } };
  const r = await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + bskySession.accessJwt },
    body: JSON.stringify({ repo: bskySession.did, collection: "app.bsky.feed.post", record }) });
  if (!r.ok) throw new Error("Bluesky gönderi " + r.status);
  return true;
}

export async function socialPost({ stories, topics, sources, prev, dry }) {
  const state = { ...(prev || {}) };
  const today = trToday();
  if (state.day !== today) { state.day = today; state.count = 0; state.urls = []; }
  const enabled = (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) || (process.env.BSKY_HANDLE && process.env.BSKY_APP_PASSWORD);
  if (!enabled || dry) return { state, sent: [] };
  const sent = [];
  const post = async (text, link, title, desc) => {
    for (const [name, fn] of [["telegram", () => telegram(text + "\n" + link)], ["bluesky", () => bluesky(text, link, title, desc)]]) {
      try { if (await fn()) sent.push(name); } catch (e) { sent.push(name + " HATA " + e.message); }
    }
  };
  // Sabah gündemi
  if (state.digest !== today && trHour() >= 8) {
    const top = stories.filter(s => Date.now() - new Date(s.date) < 24 * 3600e3).sort((a, b) => b.items.length - a.items.length).slice(0, 4);
    if (top.length) {
      const lines = top.map(s => "• " + s.items[0].title);
      const day = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" });
      await post(`☀️ ${day} gündemi\n\n${lines.join("\n")}\n\nKim nasıl verdi, yan yana:`, `${SITE}/gundem/${today}/`, `${day} gündemi | Harman Haber`, "Günün en çok kaynağın verdiği haberleri");
      state.digest = today;
    }
  }
  // Büyük olaylar
  const big = stories.filter(s => s.items.length >= 5 && Date.now() - new Date(s.date) < 3 * 3600e3 && !s.items.some(i => state.urls.includes(i.url)))
    .sort((a, b) => b.items.length - a.items.length).slice(0, Math.max(0, 4 - state.count));
  for (const s of big) {
    const i = s.items[0], t = topics.find(x => x.storyIds?.includes(s.id));
    const link = t?.slug ? `${SITE}/konu/${t.slug}/` : `${SITE}/`;
    await post(`📰 ${i.title}\n${i.gist ? "Özü: " + i.gist + "\n" : ""}${s.items.length} kaynak verdi.`, link, i.title, i.gist || "");
    state.urls.push(...s.items.map(x => x.url)); state.count++;
  }
  return { state, sent };
}
