#!/usr/bin/env node
// بناء الموقع ولوحة التحكم. Node بس، بدون مكتبات.
//
//   node scripts/build.js content <dump>   محتوى اللوحة (من ArtifactData) ← js/content-data.js و assets/media/*
//   node scripts/build.js public           الموقع بصفحة وحدة ← dist/public/ (للرابط على Claude)
//   node scripts/build.js admin            لوحة التحكم بصفحة وحدة ← dist/admin/index.html
//
// المحتوى بييجي من قاعدة بيانات صفحة اللوحة: بنعامله كبيانات بس، وبنفحص كل قيمة قبل ما نكتبها.
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

// ---------- content ----------

// ArtifactData بيحفظ كل مستند بملف JSON. بنقبل الجسم نفسه، أو غلاف فيه data.
function readDoc(file) {
  if (!fs.existsSync(file)) return null;
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    fail(`${file} is not valid JSON`);
  }
  if (obj && typeof obj === "object" && obj.data && typeof obj.data === "object" && ("version" in obj || "id" in obj || "doc_id" in obj)) {
    return obj.data;
  }
  return obj;
}

const isStr = (v) => typeof v === "string";
const str = (v, max = 4000) => (isStr(v) ? v.slice(0, max) : "");
const hex = (v) => (isStr(v) && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : "");
const https = (v) => (isStr(v) && /^https:\/\/[^\s"'<>]{3,500}$/i.test(v) ? v : "");
const digits = (v) => (isStr(v) ? v.replace(/[^\d]/g, "").slice(0, 20) : "");
const MEDIA_ID = /^m[a-z0-9]{4,30}$/;
const ICONS = ["arabic", "specialty", "cold", "tea", "breakfast", "sweets"];
const THEME_KEYS = ["oak", "oakRaised", "oakDeep", "stone", "olive", "pomegranate", "ivory"];

// صورة من اللوحة: media id بيصير ملف، أو مسار موجود أصلاً بالمستودع
function imagePath(v, media, used) {
  if (!isStr(v) || !v) return "";
  if (MEDIA_ID.test(v)) {
    const file = media[v];
    if (!file) return "";
    used.add(file);
    return file;
  }
  if (/^assets\/[\w\-./]+\.(webp|jpe?g|png)$/i.test(v) && !v.includes("..") && fs.existsSync(r(v))) return v;
  return "";
}

function buildContent(dumpDir) {
  if (!dumpDir) fail("usage: build.js content <dump-dir>");
  const dump = path.resolve(dumpDir);
  // قبل أول تعديل على المنيو ما في menu.json: المنيو بيضل من js/menu-data.js
  const menuDoc = readDoc(path.join(dump, "content", "menu.json"));
  const siteDoc = readDoc(path.join(dump, "content", "site.json")) || {};
  if (!menuDoc && !fs.existsSync(path.join(dump, "content", "site.json"))) fail(`${dump}/content has neither menu.json nor site.json`);

  // الصور: data URL ← ملف بـ assets/media
  const media = {};
  const mediaDir = path.join(dump, "media");
  const outMedia = r("assets", "media");
  fs.mkdirSync(outMedia, { recursive: true });
  if (fs.existsSync(mediaDir)) {
    for (const f of fs.readdirSync(mediaDir)) {
      const id = f.replace(/\.json$/, "");
      if (!MEDIA_ID.test(id)) continue;
      const d = readDoc(path.join(mediaDir, f)) || {};
      const m = isStr(d.url) && d.url.match(/^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
      if (!m) continue;
      const ext = m[1] === "jpeg" ? "jpg" : m[1];
      const buf = Buffer.from(m[2], "base64");
      if (buf.length > 400000) continue;
      const rel = `assets/media/${id}.${ext}`;
      fs.writeFileSync(r(rel), buf);
      media[id] = rel;
    }
  }
  const used = new Set();

  const cats = menuDoc && Array.isArray(menuDoc.categories) ? menuDoc.categories : [];
  const seen = new Set();
  const menu = cats
    .filter((c) => c && typeof c === "object")
    .slice(0, 40)
    .map((c, i) => {
      let id = isStr(c.id) && /^[\w-]{1,40}$/.test(c.id) ? c.id : `cat${i}`;
      while (seen.has(id)) id += "x";
      seen.add(id);
      return {
        id,
        icon: ICONS.includes(c.icon) ? c.icon : "specialty",
        ar: str(c.ar, 120),
        en: str(c.en, 120),
        noteAr: str(c.noteAr, 300),
        noteEn: str(c.noteEn, 300),
        items: (Array.isArray(c.items) ? c.items : [])
          .filter((it) => it && typeof it === "object")
          .slice(0, 200)
          .map((it) => {
            const price = Number(it.price);
            const item = {
              ar: str(it.ar, 120),
              en: str(it.en, 120),
              descAr: str(it.descAr, 400),
              descEn: str(it.descEn, 400),
              price: Number.isFinite(price) && price >= 0 && price < 10000 ? Math.round(price * 1000) / 1000 : 0,
            };
            if (str(it.longAr)) item.longAr = str(it.longAr);
            if (str(it.longEn)) item.longEn = str(it.longEn);
            const tags = (v) => (Array.isArray(v) ? v.filter(isStr).map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 8) : []);
            if (tags(it.tagsAr).length) item.tagsAr = tags(it.tagsAr);
            if (tags(it.tagsEn).length) item.tagsEn = tags(it.tagsEn);
            const img = imagePath(it.image, media, used);
            if (img) item.image = img;
            return item;
          }),
      };
    });
  if (menuDoc && !menu.length) fail("the menu has no categories");

  // النصوص: بس المفاتيح الموجودة بـ i18n.js
  const sandbox = { window: {} };
  new Function("window", read("js/i18n.js"))(sandbox.window);
  const I18N = sandbox.window.I18N;
  const text = { ar: {}, en: {} };
  const srcText = siteDoc.text && typeof siteDoc.text === "object" ? siteDoc.text : {};
  for (const lang of ["ar", "en"]) {
    const src = srcText[lang] || {};
    for (const k of Object.keys(src)) {
      if (isStr(I18N[lang][k]) && isStr(src[k]) && src[k].trim()) text[lang][k] = str(src[k], 2000);
    }
  }

  const theme = {};
  const srcTheme = siteDoc.theme || {};
  for (const k of THEME_KEYS) if (hex(srcTheme[k])) theme[k] = hex(srcTheme[k]);

  const c = siteDoc.contact || {};
  const contact = {};
  if (digits(c.whatsapp).length >= 8) contact.whatsapp = digits(c.whatsapp);
  if (digits(c.phone).length >= 6) contact.phone = digits(c.phone);
  for (const k of ["mapUrl", "instagram", "facebook"]) if (https(c[k])) contact[k] = https(c[k]);

  const out = { text, theme, contact };
  if (menu.length) out.menu = menu;
  const heroImg = imagePath(siteDoc.hero && siteDoc.hero.image, media, used);
  if (heroImg) out.hero = { image: heroImg };
  const logo = imagePath(siteDoc.brand && siteDoc.brand.logo, media, used);
  if (logo) out.brand = { logo };

  // الصور اللي ما حدا بيستعملها ما بتنحفظ
  for (const f of fs.readdirSync(outMedia)) {
    const rel = `assets/media/${f}`;
    if (f !== ".gitkeep" && !used.has(rel)) fs.unlinkSync(r(rel));
  }

  const js =
    "// بيكتبه scripts/build.js وقت النشر من لوحة التحكم. فاضي = المحتوى الافتراضي.\n" +
    "window.RABAD_CONTENT = " + JSON.stringify(out, null, 1).replace(/</g, "\\u003c") + ";\n";
  fs.writeFileSync(r("js/content-data.js"), js);
  console.log(`content: ${menuDoc ? "" : "default menu, "}${menu.length} categories, ${menu.reduce((n, x) => n + x.items.length, 0)} items, ${used.size} images`);
}

// ---------- public ----------

// السكربتات بترتيبها بـ index.html، بتنحط جوّا الصفحة
function inline(html) {
  html = html.replace('<link rel="stylesheet" href="css/styles.css">', () => "<style>\n" + read("css/styles.css") + "\n</style>");
  html = html.replace(/<script src="(js\/[\w-]+\.js)"><\/script>/g, (_, f) =>
    "<script>\n" + read(f).replace(/<\/script/gi, "<\\/script") + "\n</script>");
  if (/href="css\/|src="js\//.test(html)) fail("a stylesheet or script was not inlined");
  return html;
}

function buildPublic() {
  const outDir = r("dist", "public");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const html = inline(read("index.html"));
  if (/claude\.use|admin-root|ADMIN_/.test(html)) fail("the public page contains dashboard code");
  fs.writeFileSync(path.join(outDir, "index.html"), html);

  // الصور اللي الصفحة بتطلبها: الواجهة، وكل صورة بالمحتوى
  const files = ["assets/hero.webp", "assets/hero.jpg"];
  const IMG = /(?:"image"|\bimage):\s*"(assets\/[\w\-./]+\.(?:webp|jpe?g|png))"/gi;
  for (const f of ["js/content-data.js", "js/menu-data.js"]) {
    for (const m of read(f).matchAll(IMG)) files.push(m[1]);
  }
  const copied = [];
  for (const f of new Set(files)) {
    if (!fs.existsSync(r(f))) fail(`missing image ${f}`);
    fs.mkdirSync(path.dirname(path.join(outDir, f)), { recursive: true });
    fs.copyFileSync(r(f), path.join(outDir, f));
    copied.push(f);
  }
  fs.writeFileSync(path.join(outDir, "files.json"), JSON.stringify(copied, null, 1));
  console.log(`public: dist/public/index.html + ${copied.length} images (list in dist/public/files.json)`);
}

// ---------- admin ----------

function buildAdmin() {
  const outDir = r("dist", "admin");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  let html = read("admin/admin.html");
  html = html.replace('<link rel="stylesheet" href="admin.css">', () => "<style>\n" + read("admin/admin.css") + "\n</style>");
  html = html.replace(/<script src="\.\.\/(js\/[\w-]+\.js)"><\/script>/g, (_, f) =>
    "<script>\n" + read(f).replace(/<\/script/gi, "<\\/script") + "\n</script>");
  html = html.replace('<script src="admin.js"></script>', () =>
    "<script>\n" + read("admin/admin.js").replace(/<\/script/gi, "<\\/script") + "\n</script>");
  if (/src="\.\.\/|href="admin\.css"|src="admin\.js"/.test(html)) fail("admin: something was not inlined");
  fs.writeFileSync(path.join(outDir, "index.html"), html);
  fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });
  fs.copyFileSync(r("assets/hero.jpg"), path.join(outDir, "assets/hero.jpg"));
  console.log("admin: dist/admin/index.html");
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "content") buildContent(arg);
else if (cmd === "public") buildPublic();
else if (cmd === "admin") buildAdmin();
else fail("usage: build.js content <dump> | public | admin");
