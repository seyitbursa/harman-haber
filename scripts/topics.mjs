// En çok kaynağın bahsettiği konuları (özel isimler ve iki kelimelik ifadeler) bulur.
const GENERIC = new Set(("Son Dakika Flaş Bakan Bakanı Bakanlığı Başkanı Başkan Cumhurbaşkanı Cumhurbaşkanlığı Türkiye Türk Türkiye'de İşte Yeni Genel Müdür " +
  "Milli Ulusal Devlet Dünya Avrupa ABD Bugün Yarın Ocak Şubat Mart Nisan Mayıs Haziran Temmuz Ağustos Eylül Ekim Kasım Aralık " +
  "Pazartesi Salı Çarşamba Perşembe Cuma Cumartesi Pazar Video Foto Galeri Canlı Resmi Merkez Büyükşehir Belediye Belediyesi Valilik Valiliği " +
  "Kurulu Komisyonu Meclis Meclisi Üniversitesi Kupası Ligi Lig Parti Partisi Grubu Hakkında Nedir Kimdir Nerede Neden Nasıl Ne Kaç Hangi Bu Bir Ve İle").split(" "));
// İl adları tek başına konu sayılmaz (şehir haberleri "Şehrim" sekmesinde)
for (const n of ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"]) GENERIC.add(n);
const clean = w => w.replace(/['’‘`].*$/u, "").replace(/[^\p{L}\p{N}.\-]/gu, "");
const isCap = w => /^[\p{Lu}]/u.test(w) && !(w.length > 5 && w === w.toLocaleUpperCase("tr") && /\p{L}{6,}/u.test(w));

const LOWSTOP = new Set(("ve ile için bir bu da de ki mi mu mı mü ne o şu en çok daha gibi kadar sonra önce olarak olan oldu " +
  "etti yaptı dedi açıkladı açıklama son dakika yeni ilk iki üç yüzde bin milyon milyar çıktı ortaya karar belli günü bugün " +
  "olay oldu var yok büyük önemli geldi gelen gibi her tüm kişi yıl ay gün saat hafta haber haberi").split(" "));

// Aday ifadeler: (1) cümle ortasında büyük harfle başlayan özel isim dizileri, (2) iki anlamlı kelimelik ifadeler
function phrases(title) {
  const words = title.split(/\s+/);
  const out = new Set();
  let run = [];
  const flush = () => {
    for (let n = Math.min(3, run.length); n >= 1; n--)
      for (let i = 0; i + n <= run.length; i++) {
        const p = run.slice(i, i + n);
        if (p.every(w => GENERIC.has(w))) continue;
        if (n === 1 && (GENERIC.has(p[0]) || p[0].length < 3)) continue;
        out.add(p.join(" "));
      }
    run = [];
  };
  words.forEach((raw, idx) => {
    const w = clean(raw);
    const breakAfter = /[:,;!?."”)]$|['’]/.test(raw);
    // Başlığın ilk kelimesi her zaman büyük harfle yazıldığı için, ardından küçük harfli kelime geliyorsa özel isim sayılmaz
    const sentenceStart = idx === 0 && !isCap(clean(words[1] || ""));
    if (w && isCap(w) && !sentenceStart) run.push(w); else flush();
    if (breakAfter) flush();
  });
  flush();
  // İki kelimelik ifadeler (ör. "fon soruşturması", "kurultay davası")
  // Yüzey biçimi: kısaltmalar (CHP, GTA) ve cümle ortasındaki özel isimler korunur, gerisi küçük harfe çevrilir
  const surface = words.map((raw, idx) => {
    const w = clean(raw);
    if (/^[\p{Lu}\d]{2,5}$/u.test(w)) return w;
    if (isCap(w) && idx > 0) return w;
    return w.toLocaleLowerCase("tr");
  });
  for (let i = 0; i + 1 < surface.length; i++) {
    const [a, b] = [surface[i], surface[i + 1]];
    const [la, lb] = [a.toLocaleLowerCase("tr"), b.toLocaleLowerCase("tr")];
    if (!a || !b || a.length < 3 || b.length < 4 || LOWSTOP.has(la) || LOWSTOP.has(lb) || /^\d/.test(a) || /^\d/.test(b)) continue;
    if (/[:,;!?.]$/.test(words[i]) || BLOCK.has(la + " " + lb)) continue;
    out.add(a + " " + b);
  }
  return out;
}
const BLOCK = new Set(["hayatını kaybetti", "hapis cezası", "gözaltına alındı", "tutuklandı", "açıklama yaptı", "kabul edildi", "ortaya çıktı", "karar verdi"]);
const titleCase = p => p.split(" ").map(w => w === w.toLocaleLowerCase("tr") ? w.charAt(0).toLocaleUpperCase("tr") + w.slice(1) : w).join(" ");

export function trendingTopics(stories, { hours = 12, minSources = 3, max = 8 } = {}) {
  const since = Date.now() - hours * 3600e3;
  const bySources = new Map();
  for (const s of stories) {
    if (new Date(s.date).getTime() < since || s.category === "oyun") continue;   // oyun haberleri genel gündemi bastırmasın
    for (const it of s.items) for (const p of phrases(it.title)) {
      const k = p.toLocaleLowerCase("tr").split(" ").map(w => w.slice(0, 6)).join(" ");
      if (!bySources.has(k)) bySources.set(k, { label: p, forms: new Map(), sources: new Set(), stories: new Set() });
      const e = bySources.get(k);
      e.forms.set(p, (e.forms.get(p) || 0) + 1);       // en sık yazılış biçimi etiket olur
      e.sources.add(it.source); e.stories.add(s.id);
    }
  }
  for (const e of bySources.values()) e.label = [...e.forms].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
  let list = [...bySources.values()].filter(e => e.sources.size >= minSources && e.stories.size >= 2)
    .map(e => ({ label: e.label, sources: e.sources.size, stories: e.stories.size, words: e.label.split(" ").length }));
  // Uzun ifade aynı kapsama sahipse kısasını ele: "Mustafa Yazıcı" varken "Yazıcı" gösterilmez
  list = list.filter(a => !list.some(b => b !== a && b.words > a.words &&
    b.label.toLocaleLowerCase("tr").split(" ").includes(a.label.toLocaleLowerCase("tr")) && b.sources >= a.sources - 1));
  list.sort((a, b) => b.sources - a.sources || b.stories - a.stories || b.words - a.words);
  // Aynı kelimeyi paylaşan ifadelerden yalnızca öndekini tut ("CHP kurultay" ve "kurultay davası" gibi)
  const stems = l => new Set(l.toLocaleLowerCase("tr").split(" ").map(w => w.slice(0, 6)));
  const kept = [];
  for (const t of list) { const st = stems(t.label); if (!kept.some(k => [...stems(k.label)].some(w => st.has(w)))) kept.push(t); }
  list = kept;
  return list.slice(0, max).map(({ label, sources, stories }) => ({ label: label === label.toLocaleLowerCase("tr") ? label.charAt(0).toLocaleUpperCase("tr") + label.slice(1) : label, sources, stories }));
}
