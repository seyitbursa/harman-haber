// Piyasa verileri: önce Truncgil Finans, olmazsa Yahoo Finance (yalnızca dolar, euro, BIST).
const UA = { "User-Agent": "Mozilla/5.0", "Accept": "application/json" };

async function getJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

const LIST = [
  { key: "USD",         label: "Dolar",        yahoo: "USDTRY=X", unit: "₺" },
  { key: "EUR",         label: "Euro",         yahoo: "EURTRY=X", unit: "₺" },
  { key: "GRA",         label: "Gram altın",   unit: "₺" },
  { key: "CEYREKALTIN", label: "Çeyrek altın", unit: "₺" },
  { key: "XU100",       label: "BIST 100",     yahoo: "XU100.IS", unit: "" }
];

async function fromTruncgil() {
  const d = await getJSON("https://finans.truncgil.com/v4/today.json");
  const out = LIST.map(m => {
    const v = d[m.key];
    const value = v && (v.Selling || v.Buying);
    return value ? { key: m.key, label: m.label, unit: m.unit, value, change: Number(v.Change) || 0 } : null;
  }).filter(Boolean);
  if (out.length < 3) throw new Error("eksik veri");
  return out;
}

async function fromYahoo() {
  const out = [];
  for (const m of LIST.filter(m => m.yahoo)) {
    try {
      const d = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(m.yahoo)}?range=1d&interval=1h`);
      const meta = d.chart.result[0].meta;
      const prev = meta.chartPreviousClose || meta.previousClose;
      out.push({ key: m.key, label: m.label, unit: m.unit, value: meta.regularMarketPrice,
        change: prev ? +(((meta.regularMarketPrice - prev) / prev) * 100).toFixed(2) : 0 });
    } catch {}
  }
  if (!out.length) throw new Error("Yahoo verisi yok");
  return out;
}

export async function getMarkets() {
  try { return { source: "Truncgil Finans", at: new Date().toISOString(), items: await fromTruncgil() }; }
  catch (e1) {
    try { return { source: "Yahoo Finance", at: new Date().toISOString(), items: await fromYahoo() }; }
    catch (e2) { return { source: null, items: [], error: `${e1.message} / ${e2.message}` }; }
  }
}
