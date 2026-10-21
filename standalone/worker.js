// سيرفر موقع الكافيه على Cloudflare Workers: بيعرض الموقع ولوحة التحكم، وبيحفظ المحتوى والصور بقاعدة D1.
//
//   /                      الموقع (ملفات ثابتة من dist/site)
//   /content-data.js       المحتوى المنشور من اللوحة (window.RABAD_CONTENT)
//   /assets/media/<id>.*   صور اللوحة
//   /admin/                لوحة التحكم
//   /api/*                 واجهة اللوحة، بكلمة سر
//
// القاعدة جدول واحد docs(path, data, updated). المسارات:
//   content/menu، content/site، media/<id>   مسودّة اللوحة
//   published/site                           اللي بيشوفه الزبائن (بيتكتب لما تكبس «انشر»)
//   meta/publish                             حالة آخر نشر
//   secure/auth، secure/fails/<ip>           كلمة السر ومحاولات الدخول الغلط (ما بتطلع من /api/doc)
"use strict";

const MEDIA_ID = /^m[a-z0-9]{4,30}$/;
// اللي اللوحة بتقدر تقرأه وتكتبه
const DOC_PATH = /^(content\/(menu|site)|media\/m[a-z0-9]{4,30}|meta\/publish)$/;
const DOC_MAX = 400000;
const SESSION_DAYS = 7;
const PBKDF2_ITER = 100000; // أعلى رقم بيقبله Workers
const FAIL_MAX = 8;
const FAIL_WINDOW = 15 * 60 * 1000;

let tableReady = false;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (!tableReady) {
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, data TEXT NOT NULL, updated INTEGER NOT NULL)").run();
        tableReady = true;
      }
      if (p.startsWith("/api/")) return await api(req, env, url);
      if (p === "/content-data.js") return await contentScript(env);
      const m = p.match(/^\/assets\/media\/(m[a-z0-9]{4,30})\.(webp|jpg|png)$/);
      if (m) return await mediaFile(env, m[1]);
      const res = await env.ASSETS.fetch(req);
      if (p === "/admin" || p.startsWith("/admin/")) return guarded(res);
      return res;
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return json({ code: "server_error" }, 500);
    }
  },
};

// ---------- القاعدة ----------
async function getDoc(env, path) {
  const row = await env.DB.prepare("SELECT data FROM docs WHERE path = ?").bind(path).first();
  return row ? JSON.parse(row.data) : null;
}
async function setDoc(env, path, data) {
  await env.DB.prepare(
    "INSERT INTO docs (path, data, updated) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET data = excluded.data, updated = excluded.updated",
  ).bind(path, JSON.stringify(data), Date.now()).run();
}
async function deleteDoc(env, path) {
  await env.DB.prepare("DELETE FROM docs WHERE path = ?").bind(path).run();
}

// ---------- ردود ----------
function json(body, status = 200, headers = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status: body === null ? 204 : status,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, headers),
  });
}
// صفحة اللوحة: ما بتنعرض جوّا مواقع ثانية، وما بتظهر بمحركات البحث
function guarded(res) {
  const out = new Response(res.body, res);
  out.headers.set("x-frame-options", "DENY");
  out.headers.set("x-robots-tag", "noindex, nofollow");
  out.headers.set("referrer-policy", "same-origin");
  out.headers.set("cache-control", "no-store");
  return out;
}

// ---------- الموقع ----------
async function contentScript(env) {
  const published = (await getDoc(env, "published/site")) || {};
  const js = "window.RABAD_CONTENT = " + JSON.stringify(published).replace(/</g, "\\u003c") + ";\n";
  return new Response(js, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache" },
  });
}

async function mediaFile(env, id) {
  const doc = await getDoc(env, "media/" + id);
  const m = doc && typeof doc.url === "string" && doc.url.match(/^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // كل صورة إلها id جديد، فبنقدر نخلّي المتصفح يحفظها للأبد
  return new Response(bytes, {
    headers: { "content-type": "image/" + m[1], "cache-control": "public, max-age=31536000, immutable" },
  });
}

// ---------- الواجهة ----------
async function api(req, env, url) {
  const route = url.pathname.slice(5);
  const method = req.method;
  // الكتابة بس من نفس الموقع، و JSON بس (نموذج من موقع ثاني ما بيقدر يبعث JSON بدون إذن)
  if (method !== "GET") {
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin) return json({ code: "forbidden" }, 403);
    if (!(req.headers.get("content-type") || "").startsWith("application/json")) return json({ code: "bad_request" }, 400);
  }
  if (route === "login" && method === "POST") return login(req, env, url);
  if (route === "logout" && method === "POST") {
    return json({ ok: true }, 200, { "set-cookie": cookie(url, "", 0) });
  }

  if (!(await sessionOk(req, env))) return json({ code: "unauthorized" }, 401);

  if (route === "me" && method === "GET") return json({ ok: true });

  if (route.startsWith("doc/")) {
    const path = route.slice(4);
    if (!DOC_PATH.test(path)) return json({ code: "not_found" }, 404);
    if (method === "GET") {
      const data = await getDoc(env, path);
      return json({ exists: data !== null, data });
    }
    if (method === "PUT") {
      const text = await req.text();
      if (text.length > DOC_MAX) return json({ code: "toobig" }, 413);
      let data;
      try { data = JSON.parse(text); } catch (e) { return json({ code: "bad_request" }, 400); }
      if (!data || typeof data !== "object" || Array.isArray(data)) return json({ code: "bad_request" }, 400);
      await setDoc(env, path, data);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      await deleteDoc(env, path);
      return json({ ok: true });
    }
  }

  if (route === "collection/media" && method === "GET") {
    const { results } = await env.DB.prepare("SELECT path, data FROM docs WHERE path LIKE 'media/%'").all();
    return json(results.map((r) => ({ id: r.path.slice(6), data: JSON.parse(r.data) })));
  }

  if (route === "publish" && method === "POST") {
    const site = await compile(env);
    await setDoc(env, "published/site", site);
    const state = { status: "live", at: Date.now() };
    await setDoc(env, "meta/publish", state);
    return json(state);
  }

  if (route === "password" && method === "POST") return changePassword(req, env, url);

  return json({ code: "not_found" }, 404);
}

// ---------- النشر ----------
// نفس فحص scripts/build.js content: كل قيمة من اللوحة بتنفحص قبل ما توصل الموقع
async function compile(env) {
  const menuDoc = await getDoc(env, "content/menu");
  const siteDoc = (await getDoc(env, "content/site")) || {};

  // نوع كل صورة، من أول الـ data URL بس بدون ما نقرأ الصورة كلها
  const { results } = await env.DB.prepare("SELECT path, substr(data, 1, 80) AS head FROM docs WHERE path LIKE 'media/%'").all();
  const media = {};
  for (const r of results) {
    const t = r.head.match(/data:image\/(webp|jpeg|png);base64,/);
    if (t) media[r.path.slice(6)] = t[1] === "jpeg" ? "jpg" : t[1];
  }

  const isStr = (v) => typeof v === "string";
  const str = (v, max = 4000) => (isStr(v) ? v.slice(0, max) : "");
  const hex = (v) => (isStr(v) && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : "");
  const https = (v) => (isStr(v) && /^https:\/\/[^\s"'<>]{3,500}$/i.test(v) ? v : "");
  const digits = (v) => (isStr(v) ? v.replace(/[^\d]/g, "").slice(0, 20) : "");
  const imagePath = (v) => {
    if (!isStr(v) || !v) return "";
    if (MEDIA_ID.test(v)) return media[v] ? `assets/media/${v}.${media[v]}` : "";
    if (/^assets\/[\w\-./]+\.(webp|jpe?g|png)$/i.test(v) && !v.includes("..")) return v;
    return "";
  };
  const ICONS = ["arabic", "specialty", "cold", "tea", "breakfast", "sweets"];
  const THEME_KEYS = ["oak", "oakRaised", "oakDeep", "stone", "olive", "pomegranate", "ivory"];

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
            const img = imagePath(it.image);
            if (img) item.image = img;
            return item;
          }),
      };
    });

  // النصوص: الموقع بيقبل بس المفاتيح الموجودة بـ js/i18n.js، فهون بنفحص الشكل والطول
  const text = { ar: {}, en: {} };
  const srcText = siteDoc.text && typeof siteDoc.text === "object" ? siteDoc.text : {};
  for (const lang of ["ar", "en"]) {
    const src = srcText[lang] && typeof srcText[lang] === "object" ? srcText[lang] : {};
    for (const k of Object.keys(src).slice(0, 200)) {
      if (/^[A-Za-z]{1,40}$/.test(k) && isStr(src[k]) && src[k].trim()) text[lang][k] = str(src[k], 2000);
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
  const heroImg = imagePath(siteDoc.hero && siteDoc.hero.image);
  if (heroImg) out.hero = { image: heroImg };
  const logo = imagePath(siteDoc.brand && siteDoc.brand.logo);
  if (logo) out.brand = { logo };
  return out;
}

// ---------- كلمة السر والجلسة ----------
// كلمة السر بتنحفظ بصمة PBKDF2 بـ secure/auth. قبل أول تغيير، بتيجي من السر ADMIN_PASSWORD بإعدادات الـ Worker.
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));

function sameText(a, b) {
  a = String(a);
  b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}
async function authRecord(env) {
  const doc = await getDoc(env, "secure/auth");
  if (doc && doc.salt && doc.hash) return doc;
  if (env.ADMIN_PASSWORD) return { plain: String(env.ADMIN_PASSWORD) };
  return null;
}
async function checkPassword(rec, password) {
  if (!rec || typeof password !== "string" || !password) return false;
  if (rec.plain) return sameText(rec.plain, password);
  const iter = Math.min(Number(rec.iter) || PBKDF2_ITER, PBKDF2_ITER);
  return sameText(await pbkdf2(password, unb64(rec.salt), iter), rec.hash);
}
// مفتاح الجلسة مشتق من كلمة السر: لما تتغيّر، كل الأجهزة اللي كانت داخلة بتطلع
async function sessionKey(rec) {
  const seed = rec.plain ? "plain:" + rec.plain : "hash:" + rec.hash;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode("cafe-session|" + seed));
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function sign(rec, msg) {
  return b64(await crypto.subtle.sign("HMAC", await sessionKey(rec), enc.encode(msg))).replace(/=+$/, "");
}
function cookie(url, value, maxAge) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `s=${value}; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
async function newSession(rec, url) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  return cookie(url, `${exp}.${await sign(rec, String(exp))}`, SESSION_DAYS * 86400);
}
async function sessionOk(req, env) {
  const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)s=(\d{10,16})\.([A-Za-z0-9+/]+)/);
  if (!m || Number(m[1]) < Date.now()) return false;
  const rec = await authRecord(env);
  if (!rec) return false;
  return sameText(await sign(rec, m[1]), m[2]);
}

async function login(req, env, url) {
  const rec = await authRecord(env);
  if (!rec) return json({ code: "no_password" }, 503);
  const ip = (req.headers.get("cf-connecting-ip") || "unknown").replace(/[^\w.:]/g, "").slice(0, 64);
  const failPath = "secure/fails/" + ip;
  const fails = (await getDoc(env, failPath)) || { n: 0, since: Date.now() };
  if (Date.now() - fails.since > FAIL_WINDOW) Object.assign(fails, { n: 0, since: Date.now() });
  if (fails.n >= FAIL_MAX) {
    return json({ code: "too_many", wait: Math.ceil((fails.since + FAIL_WINDOW - Date.now()) / 1000) }, 429);
  }
  let body = {};
  try { body = await req.json(); } catch (e) { /* فاضي */ }
  if (!(await checkPassword(rec, body && body.password))) {
    fails.n++;
    await setDoc(env, failPath, fails);
    return json({ code: "wrong" }, 401);
  }
  if (fails.n) await deleteDoc(env, failPath);
  return json({ ok: true }, 200, { "set-cookie": await newSession(rec, url) });
}

async function changePassword(req, env, url) {
  let body = {};
  try { body = await req.json(); } catch (e) { /* فاضي */ }
  const rec = await authRecord(env);
  if (!(await checkPassword(rec, body.current))) return json({ code: "wrong" }, 400);
  if (typeof body.next !== "string" || body.next.length < 8 || body.next.length > 200) return json({ code: "weak" }, 400);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const next = { alg: "PBKDF2-SHA256", iter: PBKDF2_ITER, salt: b64(salt), hash: await pbkdf2(body.next, salt, PBKDF2_ITER), setAt: Date.now() };
  await setDoc(env, "secure/auth", next);
  return json({ ok: true }, 200, { "set-cookie": await newSession(next, url) });
}
