// Yayın öncesi derleme: index.html içindeki stil ve betiği içerik sürümlü ayrı dosyalara taşır,
// oyun kodunu (// @@OYUN{ … // @@OYUN} bölgeleri) ayrı bir dosyaya ayırır. Depodaki index.html kaynak olarak kalır.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const P = f => new URL("../public/" + f, import.meta.url);
const h = s => createHash("sha256").update(s).digest("hex").slice(0, 10);
let html = await readFile(P("index.html"), "utf8");
const sOpen = html.indexOf("<style>"), sClose = html.indexOf("</style>", sOpen);
const css = html.slice(sOpen + 7, sClose);
const jOpen = html.indexOf("<script>"), jClose = html.indexOf("</script>", jOpen);
let js = html.slice(jOpen + 8, jClose);
const games = [...js.matchAll(/\/\/ @@OYUN\{\n([\s\S]*?)\/\/ @@OYUN\}\n/g)].map(m => m[1]).join("\n");
js = js.replace(/\/\/ @@OYUN\{\n[\s\S]*?\/\/ @@OYUN\}\n/g, "");
const gName = `games.${h(games)}.js`;
js = `const GAMES_SRC = "${gName}";\n` + js;
const cName = `app.${h(css)}.css`, jName = `app.${h(js)}.js`;
await writeFile(P(cName), css); await writeFile(P(jName), js); await writeFile(P(gName), games);
html = html.slice(0, sOpen) + `<link rel="stylesheet" href="${cName}">` + html.slice(sClose + 8);
const j2 = html.indexOf("<script>"), j3 = html.indexOf("</script>", j2);
html = html.slice(0, j2) + `<script src="${jName}"></script>` + html.slice(j3 + 9);
await writeFile(P("index.html"), html);
console.log(`Derleme: ${cName} (${(css.length / 1024) | 0} KB), ${jName} (${(js.length / 1024) | 0} KB), ${gName} (${(games.length / 1024) | 0} KB), index.html ${(html.length / 1024) | 0} KB`);
