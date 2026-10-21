#!/usr/bin/env node
// بناء نسخة Cloudflare Workers: الموقع ولوحة التحكم ← dist/site/، وبينشرهم worker.js.
//
//   node standalone/build.js
//
// الفرق عن scripts/build.js public: المحتوى ما بينحط جوّا الصفحة، بيجي من /content-data.js وقت الفتح
// (السيرفر بيقرأه من القاعدة)، فالنشر من اللوحة ما بيحتاج بناء جديد.
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const r = (...p) => path.join(ROOT, ...p);
const read = (p) => fs.readFileSync(r(p), "utf8");
const fail = (msg) => {
  console.error("build: " + msg);
  process.exit(1);
};
const script = (f) => "<script>\n" + read(f).replace(/<\/script/gi, "<\\/script") + "\n</script>";

const OUT = r("dist", "site");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });

// ---------- الموقع ----------
let site = read("index.html");
if (!site.includes('<script src="js/content-data.js"></script>')) fail("index.html: content-data.js script tag not found");
site = site.replace('<script src="js/content-data.js"></script>', '<script src="/content-data.js"></script>');
site = site.replace('<link rel="stylesheet" href="css/styles.css">', () => "<style>\n" + read("css/styles.css") + "\n</style>");
site = site.replace(/<script src="(js\/[\w-]+\.js)"><\/script>/g, (_, f) => script(f));
if (/href="css\/|src="js\//.test(site)) fail("site: a stylesheet or script was not inlined");
if (/admin-root|\/api\//.test(site)) fail("the public page contains dashboard code");
fs.writeFileSync(path.join(OUT, "index.html"), site);
for (const f of ["assets/hero.webp", "assets/hero.jpg"]) fs.copyFileSync(r(f), path.join(OUT, f));

// صور مكتوبة بـ js/menu-data.js (المنيو الافتراضي)
const IMG = /\bimage:\s*"(assets\/[\w\-./]+\.(?:webp|jpe?g|png))"/g;
for (const m of read("js/menu-data.js").matchAll(IMG)) {
  if (!fs.existsSync(r(m[1]))) fail(`missing image ${m[1]}`);
  fs.mkdirSync(path.dirname(path.join(OUT, m[1])), { recursive: true });
  fs.copyFileSync(r(m[1]), path.join(OUT, m[1]));
}

// ---------- لوحة التحكم ← /admin/ ----------
let admin = read("standalone/admin.html");
admin = admin.replace('<link rel="stylesheet" href="../admin/admin.css">', () => "<style>\n" + read("admin/admin.css") + "\n</style>");
admin = admin.replace(/<script src="\.\.\/(js\/[\w-]+\.js)"><\/script>/g, (_, f) => script(f));
admin = admin.replace('<script src="admin.js"></script>', () => script("standalone/admin.js"));
if (/src="\.\.\/|href="\.\.\/|src="admin\.js"/.test(admin)) fail("admin: something was not inlined");
fs.mkdirSync(path.join(OUT, "admin", "assets"), { recursive: true });
fs.writeFileSync(path.join(OUT, "admin", "index.html"), admin);
// معاينة صورة الواجهة الأصلية باللوحة
fs.copyFileSync(r("assets/hero.jpg"), path.join(OUT, "admin", "assets", "hero.jpg"));

console.log("site: dist/site/index.html + dist/site/admin/index.html");
