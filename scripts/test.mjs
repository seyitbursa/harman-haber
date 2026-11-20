// Kalıcı regresyon testleri: güncellemeden önce çalışır; biri başarısız olursa yayın yapılmaz.
import assert from "node:assert/strict";
import { wordHit, matchTopic, SENSITIVE } from "./topics.mjs";
import { mergeByGist } from "./cluster.mjs";
let n = 0; const t = (name, fn) => { fn(); n++; console.log("  ✓ " + name); };

t("Kısa kelime yalnızca ekli biçimiyle eşleşir (fon ≠ fonksiyon)", () => {
  assert.equal(wordHit("fon", ["fonksiyonel"]), false);
  assert.equal(wordHit("fon", ["fonu"]), true);
  assert.equal(wordHit("fon", ["fondan"]), true);
});

// Dış incelemede bulunan hata (20 Kasım 2026): bir futbolcunun haberi, başka bir kişinin yakalandığı fon soruşturmasına bağlanmıştı
const spor = { category: "spor", items: [{ title: "Serdar Dursun'dan Osimhen yorumu", gist: "Serdar Dursun, Osimhen'in fonksiyonel bir oyuncu olduğunu, soruşturma sürecini bilmediğini söyledi." }] };
const adli = { category: "gundem", items: [{ title: "Fon soruşturmasında yeni gelişme: Serdar Altınbaş Çekya'da yakalandı", gist: "" }] };
t("Fon soruşturması konusu hassas sayılır", () => assert.ok(SENSITIVE.test("Fon soruşturması")));
t("Spor haberi fon soruşturması konusuna girmez", () => assert.equal(matchTopic("Fon soruşturması", spor, { dominantCat: "gundem", sensitive: true }), false));
t("Asıl soruşturma haberi konuya girer", () => assert.equal(matchTopic("Fon soruşturması", adli, { dominantCat: "gundem", sensitive: true }), true));
t("Ad benzerliği tek başına eşleşme sayılmaz (Serdar Dursun ≠ Serdar Altınbaş)", () => assert.equal(matchTopic("Serdar Altınbaş", spor, { sensitive: true }), false));

t("Aynı açıklamayı farklı başlıklarla veren haberler özete göre birleşir", () => {
  const mk = (id, src, title, gist) => ({ id, category: "dunya", date: "2026-11-20T10:00:00Z", first: "2026-11-20T10:00:00Z", items: [{ source: src, title, gist, url: id }] });
  const filler = Array.from({ length: 40 }, (_, k) => mk("f" + k, "s" + k, "Konu " + k + " hakkında farklı bir gelişme yaşandı", "Bambaşka bir olay " + k + " numaralı şehirde oldu."));
  const st = [
    mk("a", "sozcu", "Trump'tan yurt dışı veri merkezlerine vergi tehdidi", "ABD Başkanı Trump, yurt dışında veri merkezi kuran şirketlere ek vergi uygulanacağını açıkladı."),
    mk("b", "aksam", "Trump yabancı ülkelerdeki veri merkezi yatırımlarını hedef aldı", "ABD Başkanı Trump, yurt dışında veri merkezi kuran şirketlere ek vergi getirileceğini duyurdu."),
    mk("c", "star", "Trump: Veri merkezlerini dışarıda kuranlar vergi ödeyecek", "Trump, yurt dışında veri merkezi kuran şirketlerin ek vergi ödeyeceğini söyledi."),
    mk("d", "ntv", "Trump Çin ziyaretini tamamladı", "ABD Başkanı Trump, Çin'deki temaslarını tamamlayarak ülkesine döndü."),
    mk("g", "trt", "İsrail'in Gazze saldırılarında 7 Filistinli hayatını kaybetti", "İsrail ordusunun Gazze Şeridi'ne düzenlediği saldırılarda 7 kişi hayatını kaybetti, enkaz altında arama sürüyor."),
    mk("k", "bbc", "Kiev'de Rusya'nın saldırısı sonrası enkazda arama", "Rusya'nın Kiev'e düzenlediği saldırılarda 7 kişi hayatını kaybetti, enkaz altında arama sürüyor."),
    ...filler
  ];
  mergeByGist(st);
  const tr = st.filter(s => s.items.some(i => /veri merkez/i.test(i.title)));
  assert.equal(tr.length, 1, "veri merkezi haberleri tek hikâyede olmalı");
  assert.equal(tr[0].items.length, 3);
  assert.ok(st.some(s => s.id === "d"), "ilgisiz Trump haberi ayrı kalmalı");
  assert.ok(st.some(s => s.id === "g") && st.some(s => s.id === "k"), "Gazze ve Kiev saldırıları ayrı kalmalı");
});
import { trendingTopics } from "./topics.mjs";
t("Birden çok kişiyi kapsayan tek ad konu olmaz (Serdar)", () => {
  const now = new Date().toISOString(); let k = 0;
  const mk = (src, title) => ({ id: "s" + (k++), category: "gundem", date: now, items: [{ source: src, title, date: now }] });
  const st = [mk("a","Fon soruşturmasında Serdar Altınbaş yakalandı"), mk("b","Serdar Altınbaş Çekya'da gözaltına alındı"), mk("c","Serdar Altınbaş için iade süreci"),
              mk("d","Serdar Dursun'dan Osimhen yorumu"), mk("e","Serdar Dursun golle döndü"), mk("f","Serdar Dursun milli takıma çağrıldı")];
  const labels = trendingTopics(st, { minSources: 3 }).map(x => x.label);
  assert.ok(!labels.includes("Serdar"), "tek başına 'Serdar' konu olmamalı: " + labels.join(", "));
});
console.log(n + " test geçti.");
