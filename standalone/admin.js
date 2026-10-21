// لوحة التحكم: بتعدّل محتوى الموقع وبتحفظه بقاعدة بيانات الموقع (Cloudflare D1، عن طريق /api بـ worker.js).
// «انشر على الموقع» بيحوّل المحفوظ لنسخة الزبائن، وبتبين بالموقع فوراً.
//
// القاعدة:
//   content/menu   {categories, updatedAt}         الأقسام وأصنافها (نفس شكل window.MENU، والقسم إله icon)
//   content/site   {text, theme, contact, hero, brand, updatedAt}
//   media/<id>     {url: data URL, at}             صورة مضغوطة لكل مستند
//   meta/publish   حالة آخر نشر
//
// الدخول بكلمة سر، والسيرفر هو اللي بيتحقق منها وبيرفض أي كتابة بدونها.
(() => {
  "use strict";

  const PUBLISH_STALE = 15 * 60 * 1000;

  const DOC_MENU = "content/menu";
  const DOC_SITE = "content/site";
  const MENU_FIELDS = ["categories"];
  const SITE_FIELDS = ["text", "theme", "contact", "hero", "brand"];
  const FIELDS = MENU_FIELDS.concat(SITE_FIELDS);
  const DOC_LIMIT = 240000;
  const IMG_MAX_CHARS = 190000;

  const ICON_KEYS = ["arabic", "specialty", "cold", "tea", "breakfast", "sweets"];
  const DEFAULT_THEME = {
    oak: "#17302a", oakRaised: "#1d3a33", oakDeep: "#10231e", stone: "#c8b48f",
    olive: "#7a8450", pomegranate: "#a3333d", ivory: "#f2ece0",
  };
  const THEME_LABELS = {
    oak: ["الخلفية", "لون الصفحة الأساسي"],
    oakRaised: ["البطاقات الغامقة", "بطاقات العجلة واللوح"],
    oakDeep: ["الغامق", "المنيو والفوتر والنص على البطاقات الفاتحة"],
    stone: ["الحجر", "العناوين الصغيرة والخطوط"],
    olive: ["الزيتوني", "تفاصيل صغيرة وبطاقات"],
    pomegranate: ["الرمّاني", "الأزرار المهمة"],
    ivory: ["العاجي", "النص والبطاقات الفاتحة"],
  };
  const DEFAULT_CONTACT = {
    whatsapp: "962700000000",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=Ajloun+Castle",
    phone: "",
    instagram: "",
    facebook: "",
  };

  // النصوص اللي بتتعدّل، مقسّمة حسب مكانها بالموقع
  const TEXT_GROUPS = {
    cafe: [
      ["brand", "اسم الكافيه (فوق بالموقع)"],
      ["title", "عنوان الصفحة (بالتبويب وبجوجل)"],
      ["footer", "السطر بآخر الصفحة"],
    ],
    hero: [
      ["heroTitle", "العنوان الكبير"],
      ["heroLead", "السطر تحت العنوان", true],
      ["heroCta", "زر المنيو"],
      ["heroAlt", "وصف الصورة (للي ما بيشوفوا)"],
    ],
    texts: [
      ["القوائم", [
        ["navMenu", "رابط المنيو"],
        ["navAbout", "رابط عن المكان"],
        ["navVisit", "رابط زورونا"],
      ]],
      ["المنيو", [
        ["menuTitle", "عنوان المنيو"],
        ["menuLead", "السطر تحت عنوان المنيو"],
        ["currency", "العملة"],
        ["wheelHint", "التلميح على العجلة"],
        ["wheelMore", "زر التفاصيل"],
        ["wheelClose", "زر الإغلاق"],
      ]],
      ["عن المكان", [
        ["aboutTitle", "العنوان"],
        ["aboutP1", "الفقرة الأولى", true],
        ["aboutP2", "الفقرة الثانية", true],
      ]],
    ],
    visit: [
      ["visitTitle", "عنوان القسم"],
      ["hoursLabel", "عنوان الدوام"],
      ["hoursWeek", "الأيام (١)"],
      ["hoursWeekTime", "الساعات (١)"],
      ["hoursFri", "الأيام (٢)"],
      ["hoursFriTime", "الساعات (٢)"],
      ["addressLabel", "عنوان العنوان"],
      ["address", "العنوان"],
      ["mapCta", "زر الخريطة"],
      ["whatsappCta", "زر الواتساب"],
      ["phoneCta", "رابط الاتصال"],
    ],
  };

  // ---------- أدوات ----------
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  // القاعدة بترجّع المفاتيح بترتيب ثاني، فالمقارنة بعد ترتيبها
  const canon = (v) => {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  };
  const same = (a, b) => canon(a) === canon(b);
  const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  const I18N = window.I18N;
  const fmtPrice = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : "0.00");

  function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    let o = obj;
    for (const k of keys) {
      if (o[k] == null || typeof o[k] !== "object") o[k] = {};
      o = o[k];
    }
    if (value === undefined) delete o[last];
    else o[last] = value;
  }

  // ---------- الحالة ----------
  let dbState = "connecting"; // connecting | none | ready
  let canEdit = false;
  let draft = null;
  let baseline = null;
  let MEDIA = {};
  let pendingMedia = {};
  let tab = "cafe";
  let catFilter = 0;
  const openKeys = new Set();
  let saving = false;
  let saveTimer = 0;
  let pausedUntil = 0;
  let lastError = "";
  let storeMoved = false;
  let savedOnce = false;

  function defaults() {
    return {
      categories: clone(window.MENU).map((c) => ({
        id: c.id,
        icon: ICON_KEYS.includes(c.id) ? c.id : "specialty",
        ar: c.ar || "",
        en: c.en || "",
        noteAr: c.noteAr || "",
        noteEn: c.noteEn || "",
        items: (c.items || []).map(normItem),
      })),
      text: { ar: {}, en: {} },
      theme: Object.assign({}, DEFAULT_THEME),
      contact: Object.assign({}, DEFAULT_CONTACT),
      hero: { image: "" },
      brand: { logo: "" },
    };
  }
  function normItem(it) {
    return {
      ar: it.ar || "",
      en: it.en || "",
      descAr: it.descAr || "",
      descEn: it.descEn || "",
      longAr: it.longAr || "",
      longEn: it.longEn || "",
      tagsAr: Array.isArray(it.tagsAr) ? it.tagsAr.slice() : [],
      tagsEn: Array.isArray(it.tagsEn) ? it.tagsEn.slice() : [],
      image: it.image || "",
      ...(it.imageEdit && typeof it.imageEdit === "object" ? { imageEdit: clone(it.imageEdit) } : {}),
      price: Number(it.price) || 0,
    };
  }
  // المستند المحفوظ، بعد ما نكمّل الناقص من القيم الافتراضية
  function fromStore(menuData, siteData) {
    const base = defaults();
    const m = menuData || {};
    const s = siteData || {};
    const out = {
      categories: Array.isArray(m.categories) ? clone(m.categories) : base.categories,
      text: s.text && typeof s.text === "object" ? clone(s.text) : base.text,
      theme: s.theme && typeof s.theme === "object" ? clone(s.theme) : base.theme,
      contact: s.contact && typeof s.contact === "object" ? clone(s.contact) : base.contact,
      hero: s.hero && typeof s.hero === "object" ? clone(s.hero) : base.hero,
      brand: s.brand && typeof s.brand === "object" ? clone(s.brand) : base.brand,
    };
    out.text.ar = out.text.ar || {};
    out.text.en = out.text.en || {};
    return out;
  }

  // ---------- الاتصال بالسيرفر ----------
  let authed = false;
  let started = false;

  async function api(method, path, body) {
    let res;
    try {
      res = await fetch("/api/" + path, {
        method,
        credentials: "same-origin",
        headers: body !== undefined ? { "content-type": "application/json" } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw { code: "network" };
    }
    const out = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.status === 401 && path !== "login" && authed) {
      authed = false;
      lockMsg = "انتهت الجلسة. ادخل كمان مرة.";
      render();
    }
    if (!res.ok) throw { code: (out && out.code) || "http_" + res.status, wait: out && out.wait };
    return out;
  }

  // نفس الشكل اللي باقي اللوحة بتستعمله: doc(path).get/set/delete/onSnapshot و collection(name).get
  const watchers = [];
  const DB = {
    doc: (path) => ({
      get: () => api("GET", "doc/" + path).then((r) => ({ exists: !!(r && r.exists), data: () => (r ? r.data : undefined) })),
      set: (data) => api("PUT", "doc/" + path, data),
      delete: () => api("DELETE", "doc/" + path),
      // بدل التحديث المباشر: بنسأل السيرفر كل ٢٠ ثانية والصفحة مفتوحة
      onSnapshot(cb, onErr) {
        let last;
        const tick = () => this.get().then((snap) => {
          const key = JSON.stringify(snap.exists ? snap.data() : null);
          if (key === last) return;
          last = key;
          cb(snap);
        }, (e) => { if (e.code !== "unauthorized" && onErr) onErr(e); });
        watchers.push(tick);
        tick();
      },
    }),
    collection: (name) => ({
      get: () => api("GET", "collection/" + name).then((list) => ({ docs: (list || []).map((d) => ({ id: d.id, data: () => d.data })) })),
    }),
  };
  setInterval(() => { if (authed && !document.hidden) watchers.forEach((t) => t()); }, 20000);

  async function connect() {
    try {
      await api("GET", "me");
      authed = true;
    } catch (e) {
      dbState = e.code === "network" ? "none" : "ready";
      render();
      return;
    }
    await start();
  }

  // بعد الدخول: بنحمّل المحتوى والصور، وبنتابع التغييرات من الأجهزة الثانية
  async function start() {
    dbState = "ready";
    canEdit = true;
    await loadDraft();
    if (started) {
      render();
      return;
    }
    started = true;
    DB.collection("media").get().then((snap) => {
      snap.docs.forEach((d) => {
        const v = d.data();
        if (v && typeof v.url === "string") MEDIA[d.id] = v.url;
      });
      refreshImages();
    }).catch(() => {});
    [DOC_MENU, DOC_SITE].forEach((path) => {
      DB.doc(path).onSnapshot((snap) => {
        const at = snap.exists ? Number((snap.data() || {}).updatedAt) : 0;
        if (Number.isFinite(at) && at > contentChangedAt) contentChangedAt = at;
        onStoreChange();
        renderPublish();
      }, () => showError("انقطع الاتصال بالسيرفر. حمّل الصفحة من جديد."));
    });
    DB.doc("meta/publish").onSnapshot((snap) => {
      if (!publishBusy) publishState = snap.exists ? clone(snap.data()) : null;
      renderPublish();
    }, () => {});
    render();
  }

  async function loadDraft() {
    try {
      const [m, s] = await Promise.all([DB.doc(DOC_MENU).get(), DB.doc(DOC_SITE).get()]);
      draft = fromStore(m.exists ? m.data() : null, s.exists ? s.data() : null);
      baseline = clone(draft);
      storeMoved = false;
    } catch (e) {
      draft = null;
      showError("ما قدرنا نقرأ المحتوى المحفوظ. حمّل الصفحة من جديد قبل ما تعدّل.");
    }
  }

  // تعديل من مكان ثاني: إذا ما في شغل مش محفوظ هون، بنحمّله. غير هيك بننبّه بس.
  function onStoreChange() {
    if (!draft || saving) return;
    Promise.all([DB.doc(DOC_MENU).get(), DB.doc(DOC_SITE).get()]).then(([m, s]) => {
      const stored = fromStore(m.exists ? m.data() : null, s.exists ? s.data() : null);
      if (same(stored, baseline)) return;
      const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest("#main");
      if (!hasChanges() && !typing) {
        draft = stored;
        baseline = clone(stored);
        render();
      } else {
        storeMoved = true;
        renderSaveState();
      }
    }).catch(() => {});
  }

  // ---------- الحفظ ----------
  const hasChanges = () => !!draft && (Object.keys(pendingMedia).length > 0 || !same(draft, baseline));

  function scheduleSave(ms) {
    clearTimeout(saveTimer);
    if (!canEdit || !draft) return;
    saveTimer = setTimeout(() => {
      if (Date.now() < pausedUntil) return scheduleSave(pausedUntil - Date.now() + 50);
      runSave();
    }, ms);
  }

  async function runSave() {
    if (saving) {
      scheduleSave(800);
      return;
    }
    if (!hasChanges()) {
      afterSave();
      return;
    }
    saving = true;
    renderSaveState();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      saving = false;
      lastError = "القاعدة ما ردّت خلال ٢٠ ثانية. تعديلاتك لسا هون، جرّب احفظ كمان مرة.";
      publishAfterSave = false;
      renderSaveState();
    }, 20000);
    try {
      await save();
      if (timedOut) return;
      clearTimeout(timer);
      saving = false;
      lastError = "";
      savedOnce = true;
      renderSaveState();
      afterSave();
    } catch (e) {
      if (timedOut) return;
      clearTimeout(timer);
      saving = false;
      publishAfterSave = false;
      pausedUntil = Date.now() + 15000;
      lastError = saveErrorText(e);
      showError(lastError);
      try { console.error("[save]", e); } catch (_) { /* ignore */ }
      renderSaveState();
      renderPublish();
    }
  }

  function afterSave() {
    if (publishAfterSave && !hasChanges()) {
      publishAfterSave = false;
      requestPublish();
    }
  }

  async function save() {
    const ids = Object.keys(pendingMedia);
    // الصور أول: صنف بيشاور على صورة مش محفوظة بيطلع مكسور
    for (const id of ids) await DB.doc("media/" + id).set({ url: pendingMedia[id], at: Date.now() });

    const [m, s] = await Promise.all([DB.doc(DOC_MENU).get(), DB.doc(DOC_SITE).get()]);
    const stored = fromStore(m.exists ? m.data() : null, s.exists ? s.data() : null);
    // الحقل بينكتب إذا انت غيّرته، والقاعدة ما فيها نفس القيمة.
    // إذا ما غيّرته هون بس تغيّر بالقاعدة، هاد تعديل حدا ثاني: منخلّيه.
    const fields = FIELDS.filter((f) => {
      if (same(draft[f], stored[f])) return false;
      if (baseline && same(draft[f], baseline[f])) {
        draft[f] = clone(stored[f]);
        storeMoved = true;
        return false;
      }
      return true;
    });
    if (!fields.length) {
      ids.forEach((id) => delete pendingMedia[id]);
      baseline = clone(draft);
      return;
    }
    const next = Object.assign({}, stored);
    fields.forEach((f) => (next[f] = clone(draft[f])));
    const menuDoc = { categories: next.categories, updatedAt: Date.now() };
    const siteDoc = { text: next.text, theme: next.theme, contact: next.contact, hero: next.hero, brand: next.brand, updatedAt: Date.now() };
    const wantMenu = fields.some((f) => MENU_FIELDS.includes(f));
    const wantSite = fields.some((f) => SITE_FIELDS.includes(f));
    if ((wantMenu && JSON.stringify(menuDoc).length > DOC_LIMIT) || (wantSite && JSON.stringify(siteDoc).length > DOC_LIMIT)) {
      throw { kind: "toobig" };
    }
    if (wantMenu) await DB.doc(DOC_MENU).set(menuDoc);
    if (wantSite) await DB.doc(DOC_SITE).set(siteDoc);

    // بنقرأ اللي انحفظ ونقارن، عشان نقدر نقول «انحفظ» بثقة
    const [m2, s2] = await Promise.all([DB.doc(DOC_MENU).get(), DB.doc(DOC_SITE).get()]);
    const after = fromStore(m2.exists ? m2.data() : null, s2.exists ? s2.data() : null);
    const bad = fields.filter((f) => !same(draft[f], after[f]));
    if (bad.length) throw { kind: "verify", fields: bad };
    ids.forEach((id) => delete pendingMedia[id]);
    baseline = clone(draft);
    storeMoved = false;
    pruneMedia(after);
  }

  function saveErrorText(e) {
    const code = e && (e.code || e.kind);
    if (code === "toobig") return "المحتوى صار أكبر من اللي بتقبله القاعدة. احذف صورة أو قصّر نص طويل، وبعدين احفظ.";
    if (code === "verify") return "القاعدة ما حفظت كل التعديلات. جرّب احفظ كمان مرة.";
    if (code === "unauthorized") return "انتهت الجلسة. ادخل كمان مرة، وتعديلاتك لسا هون.";
    return "ما قدرنا نوصل للسيرفر. تعديلاتك لسا هون، جرّب احفظ كمان مرة.";
  }

  // ---------- الصور ----------
  // كل مكان بالموقع إله مقاس ثابت، فالصورة بتنقص هون على نفس المقاس: بتطلع بالموقع زي ما شفتها بالمحرّر بالزبط.
  // الأصل بينحفظ كمان (<path>Edit.src) مع مكان القص، عشان «ظبّط المقاس» يرجع للصورة كاملة بأي وقت.
  const SHAPES = {
    item: { w: 1100, h: 759, src: 1400, label: "بطاقة الصنف ولوح التفاصيل" },
    hero: { w: 1408, h: 768, src: 1800, label: "صورة الواجهة" },
    logo: { w: 400, h: 400, src: 1100, label: "الشعار جنب الاسم" },
  };
  const shapeOf = (path) => (path === "hero.image" ? "hero" : path === "brand.logo" ? "logo" : "item");
  const editPath = (path) => path + "Edit";
  const MEDIA_RE = /^m[a-z0-9]{4,30}$/;
  const newMediaId = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const MAX_ZOOM = 5;
  // على الجوال الطولي الواجهة بتبين شريحة من الصورة حوالين --fx (css/styles.css)
  const PHONE_ASPECT = 9 / 19.5;
  const PHONE_FX = 0.33;

  // نفس طريقة لوحة المطعم: فك الصورة من object URL، وتصغيرها، و WebP أو JPEG (سفاري ما بيكتب WebP)
  function readImage(file, maxSide) {
    return new Promise((resolve, reject) => {
      if (!file) return reject("ما اخترت ملف");
      if (file.type && !/^image\//i.test(file.type)) return reject("هاد الملف مش صورة");
      let url;
      try { url = URL.createObjectURL(file); } catch (e) { return reject("ما قدرنا نقرأ الملف"); }
      const img = new Image();
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject("المتصفح ما بيفتح هاي الصيغة. اختار صورة JPG أو PNG. على الآيفون: الإعدادات ← الكاميرا ← التنسيقات ← «الأكثر توافقاً».");
      };
      img.onload = () => {
        URL.revokeObjectURL(url);
        const out = shrinkImage(img, maxSide);
        out ? resolve(out) : reject("الصورة كبيرة كثير حتى بعد الضغط");
      };
      img.src = url;
    });
  }
  let webpOk = null;
  function encode(c) {
    for (const q of [0.78, 0.66, 0.54, 0.42]) {
      let out = "";
      if (webpOk !== false) {
        out = c.toDataURL("image/webp", q);
        webpOk = out.indexOf("data:image/webp") === 0;
      }
      if (!webpOk) out = c.toDataURL("image/jpeg", q);
      if (out.length < IMG_MAX_CHARS) return out;
    }
    return "";
  }
  function shrinkImage(img, maxSide) {
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) return "";
    const sizes = [maxSide || 1100, 1100, 900, 760, 620, 480].filter((s, i, a) => s <= (maxSide || 1100) && a.indexOf(s) === i);
    for (const size of sizes) {
      const r = Math.min(1, size / w0, size / h0);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w0 * r));
      c.height = Math.max(1, Math.round(h0 * r));
      const g = c.getContext("2d");
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      const out = encode(c);
      if (out) return out;
    }
    return "";
  }
  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject("ما قدرنا نفتح الصورة");
      img.src = src;
    });
  }
  function imgSrc(v) {
    if (!v) return "";
    if (MEDIA_RE.test(v)) return MEDIA[v] || "";
    if (/^assets\/[\w\-./]+$/.test(v)) return v;
    return "";
  }
  function refreshImages() {
    $$("img[data-src-key]").forEach((img) => {
      const src = imgSrc(img.dataset.srcKey);
      if (src && img.getAttribute("src") !== src) img.src = src;
    });
  }

  // ---------- القص ----------
  // p = {zoom, ox, oy, rot, bg}. zoom = 1 يعني الصورة مالية الإطار؛ ox و oy إزاحة مركزها بنسبة عرض وارتفاع الإطار.
  // كل الأرقام نسب، فنفس p بترسم نفس القصة على المعاينة الصغيرة وعلى الملف الكبير.
  function cropGeom(img, p, W, H) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const turned = p.rot % 180 !== 0;
    const rw = turned ? ih : iw;
    const rh = turned ? iw : ih;
    const cover = Math.max(W / rw, H / rh);
    return { iw, ih, rw, rh, cover, minZoom: Math.min(W / rw, H / rh) / cover };
  }
  // الصورة الكبيرة ما بتترك فراغ بالإطار، والصغيرة ما بتطلع برّاه
  function clampCrop(img, p, W, H) {
    const gm = cropGeom(img, p, W, H);
    p.zoom = Math.min(MAX_ZOOM, Math.max(gm.minZoom, p.zoom));
    const s = gm.cover * p.zoom;
    const mx = Math.abs(gm.rw * s - W) / 2 / W;
    const my = Math.abs(gm.rh * s - H) / 2 / H;
    p.ox = Math.min(mx, Math.max(-mx, p.ox));
    p.oy = Math.min(my, Math.max(-my, p.oy));
  }
  function drawCrop(g, W, H, img, p) {
    const gm = cropGeom(img, p, W, H);
    const s = gm.cover * p.zoom;
    g.fillStyle = p.bg;
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(W / 2 + p.ox * W, H / 2 + p.oy * H);
    g.rotate((p.rot * Math.PI) / 180);
    g.imageSmoothingQuality = "high";
    g.drawImage(img, (-gm.iw * s) / 2, (-gm.ih * s) / 2, gm.iw * s, gm.ih * s);
    g.restore();
  }
  function exportCrop(img, p, shape) {
    for (const k of [1, 0.85, 0.7, 0.55]) {
      const c = document.createElement("canvas");
      c.width = Math.round(shape.w * k);
      c.height = Math.round(shape.h * k);
      drawCrop(c.getContext("2d"), c.width, c.height, img, p);
      const out = encode(c);
      if (out) return out;
    }
    return "";
  }
  const freshCrop = () => ({ zoom: 1, ox: 0, oy: 0, rot: 0, bg: isHex(draft.theme.oakRaised) ? draft.theme.oakRaised : DEFAULT_THEME.oakRaised });
  function savedCrop(info) {
    const n = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    return {
      zoom: n(info.zoom, 1),
      ox: n(info.ox, 0),
      oy: n(info.oy, 0),
      rot: [0, 90, 180, 270].includes(info.rot) ? info.rot : 0,
      bg: isHex(info.bg) ? info.bg : freshCrop().bg,
    };
  }

  let editor = null;

  // srcUrl: صورة جديدة لسا مش محفوظة. srcId: الأصل المحفوظ بالقاعدة.
  function openEditor(path, img, p, src) {
    const kind = shapeOf(path);
    const shape = SHAPES[kind];
    const box = document.createElement("div");
    box.className = "crop";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "cropTitle");
    box.innerHTML = `
      <div class="crop-box">
        <h2 id="cropTitle">ظبّط الصورة</h2>
        <p class="hint">${esc(shape.label)}. اسحب الصورة لتحرّكها، وكبّر أو صغّر بالشريط أو بإصبعين. اللي جوّا الإطار هو اللي بيطلع بالموقع.</p>
        <div class="crop-stage ${kind}" style="aspect-ratio:${shape.w} / ${shape.h}"><canvas aria-label="الصورة جوّا الإطار"></canvas></div>
        ${kind === "hero" ? `<p class="hint">المستطيل المنقّط هو اللي بيبين على شاشة الجوال. على الكمبيوتر بتبين الصورة كلها تقريباً.</p>` : ""}
        <label class="crop-zoom"><span>تكبير</span><input type="range" step="0.001" data-crop="zoom"></label>
        <div class="crop-tools">
          <button class="mini" type="button" data-crop="cover">املأ الإطار</button>
          <button class="mini" type="button" data-crop="fit">الصورة كاملة</button>
          <button class="mini" type="button" data-crop="rot">لفّ ↻</button>
          <button class="mini" type="button" data-crop="reset">رجّع</button>
          <label class="crop-bg">لون الفراغ<input type="color" data-crop="bg" value="${esc(p.bg)}"></label>
        </div>
        <div class="crop-foot">
          <button class="btn" type="button" data-crop="cancel">إلغاء</button>
          <button class="btn btn-accent" type="button" data-crop="ok">اعتمد</button>
        </div>
      </div>`;
    $("#app").appendChild(box);
    document.documentElement.classList.add("crop-open");
    const canvas = box.querySelector("canvas");
    const zoom = box.querySelector('[data-crop="zoom"]');
    const ed = { path, kind, shape, img, p, src, box, canvas, zoom, back: document.activeElement };
    editor = ed;

    const ratio = () => shape.w / shape.h;
    function draw() {
      const cw = canvas.clientWidth || 300;
      const ch = cw / ratio();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(cw * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }
      const W = canvas.width;
      const H = canvas.height;
      clampCrop(img, p, W, H);
      const g = canvas.getContext("2d");
      drawCrop(g, W, H, img, p);
      if (kind === "hero") {
        const f = Math.min(1, PHONE_ASPECT / ratio());
        const x0 = Math.min(1 - f, Math.max(0, PHONE_FX - f / 2)) * W;
        g.save();
        g.fillStyle = "rgba(0, 0, 0, 0.35)";
        g.fillRect(0, 0, x0, H);
        g.fillRect(x0 + f * W, 0, W - x0 - f * W, H);
        g.setLineDash([8 * dpr, 6 * dpr]);
        g.lineWidth = 2 * dpr;
        g.strokeStyle = "#ffffff";
        g.strokeRect(x0 + dpr, dpr, f * W - 2 * dpr, H - 2 * dpr);
        g.restore();
      }
      const gm = cropGeom(img, p, W, H);
      zoom.min = String(gm.minZoom);
      zoom.max = String(MAX_ZOOM);
      zoom.value = String(p.zoom);
    }
    ed.draw = draw;

    // السحب بإصبع (أو ماوس) بيحرّك، وبإصبعين بيكبّر
    const pts = new Map();
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener("pointermove", (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const now = { x: e.clientX, y: e.clientY };
      if (pts.size === 1) {
        p.ox += (now.x - prev.x) / canvas.clientWidth;
        p.oy += (now.y - prev.y) / canvas.clientHeight;
      } else {
        const other = Array.from(pts.entries()).find(([id]) => id !== e.pointerId)[1];
        const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
        const d1 = Math.hypot(now.x - other.x, now.y - other.y);
        if (d0 > 0) p.zoom *= d1 / d0;
      }
      pts.set(e.pointerId, now);
      draw();
    });
    const lift = (e) => pts.delete(e.pointerId);
    canvas.addEventListener("pointerup", lift);
    canvas.addEventListener("pointercancel", lift);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      p.zoom *= Math.exp(-e.deltaY * 0.0015);
      draw();
    }, { passive: false });

    box.addEventListener("input", (e) => {
      const k = e.target.dataset.crop;
      if (k === "zoom") p.zoom = Number(e.target.value);
      else if (k === "bg" && isHex(e.target.value)) p.bg = e.target.value;
      else return;
      draw();
    });
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-crop]");
      if (!b) return;
      const k = b.dataset.crop;
      if (k === "cover") Object.assign(p, { zoom: 1, ox: 0, oy: 0 });
      else if (k === "fit") Object.assign(p, { zoom: 0, ox: 0, oy: 0 });
      else if (k === "rot") Object.assign(p, { rot: (p.rot + 90) % 360, ox: 0, oy: 0 });
      else if (k === "reset") Object.assign(p, freshCrop(), { bg: p.bg });
      else if (k === "cancel") return closeEditor();
      else if (k === "ok") return applyEditor();
      draw();
    });
    box.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeEditor();
      }
    });
    ed.onResize = () => draw();
    window.addEventListener("resize", ed.onResize);
    requestAnimationFrame(draw);
    box.querySelector('[data-crop="ok"]').focus({ preventScroll: true });
  }

  function closeEditor() {
    if (!editor) return;
    const ed = editor;
    editor = null;
    window.removeEventListener("resize", ed.onResize);
    ed.box.remove();
    document.documentElement.classList.remove("crop-open");
    if (ed.back && document.contains(ed.back)) ed.back.focus({ preventScroll: true });
  }

  function applyEditor() {
    const ed = editor;
    if (!ed || !draft) return;
    const out = exportCrop(ed.img, ed.p, ed.shape);
    if (!out) {
      showError("ما قدرنا نجهّز الصورة. جرّب صورة أصغر.");
      return;
    }
    let srcId = ed.src.id;
    if (!srcId) {
      srcId = newMediaId();
      pendingMedia[srcId] = ed.src.url;
      MEDIA[srcId] = ed.src.url;
    }
    const id = newMediaId();
    pendingMedia[id] = out;
    MEDIA[id] = out;
    const r4 = (v) => Math.round(v * 10000) / 10000;
    setPath(draft, ed.path, id);
    setPath(draft, editPath(ed.path), { src: srcId, zoom: r4(ed.p.zoom), ox: r4(ed.p.ox), oy: r4(ed.p.oy), rot: ed.p.rot, bg: ed.p.bg });
    closeEditor();
    lastError = "";
    render();
    changed(400);
  }

  // «ظبّط المقاس» على صورة موجودة: من الأصل إذا انحفظ، وإلا من الصورة نفسها (صور قبل المحرّر)
  function editImage(path) {
    const v = getPath(draft, path) || "";
    const info = getPath(draft, editPath(path));
    const fromSrc = info && typeof info === "object" && MEDIA_RE.test(info.src || "") && MEDIA[info.src];
    const srcId = fromSrc ? info.src : v;
    if (!MEDIA[srcId]) {
      showError("الصورة لسا بتتحمّل. استنى ثانية وجرّب كمان مرة.");
      return;
    }
    loadImg(MEDIA[srcId]).then(
      (img) => openEditor(path, img, fromSrc ? savedCrop(info) : freshCrop(), { id: srcId }),
      (err) => showError(err),
    );
  }

  document.addEventListener("change", (e) => {
    const input = e.target;
    if (!input.matches || !input.matches("input[data-img]")) return;
    const path = input.dataset.img;
    const file = input.files && input.files[0];
    if (!file || !canEdit) return;
    const holder = input.closest(".upload");
    if (holder) holder.classList.add("busy");
    readImage(file, SHAPES[shapeOf(path)].src)
      .then((url) => loadImg(url).then((img) => openEditor(path, img, freshCrop(), { url })))
      .catch((err) => showError("ما قدرنا نستعمل الصورة: " + err))
      .finally(() => {
        if (holder) holder.classList.remove("busy");
        try { input.value = ""; } catch (_) { /* ignore */ }
      });
  });

  // صور ما حدا بيشاور عليها (انبدلت أو انشالت) بتنمسح بعد يوم، عشان القاعدة ما تمتلي بالأصول والنسخ القديمة
  const MEDIA_KEEP = 24 * 3600 * 1000;
  let pruned = false;
  function usedMedia(d) {
    const ids = new Set();
    const add = (v) => { if (typeof v === "string" && MEDIA_RE.test(v)) ids.add(v); };
    const addEdit = (e) => { if (e && typeof e === "object") add(e.src); };
    (d.categories || []).forEach((c) => (c.items || []).forEach((it) => { add(it.image); addEdit(it.imageEdit); }));
    if (d.hero) { add(d.hero.image); addEdit(d.hero.imageEdit); }
    if (d.brand) { add(d.brand.logo); addEdit(d.brand.logoEdit); }
    return ids;
  }
  function pruneMedia(saved) {
    if (pruned) return;
    pruned = true;
    const keep = usedMedia(saved);
    Object.keys(pendingMedia).forEach((id) => keep.add(id));
    DB.collection("media").get().then((snap) => {
      snap.docs.forEach((d) => {
        const at = Number((d.data() || {}).at);
        if (keep.has(d.id) || !Number.isFinite(at) || Date.now() - at < MEDIA_KEEP) return;
        DB.doc("media/" + d.id).delete().then(() => { delete MEDIA[d.id]; }, () => {});
      });
    }).catch(() => {});
  }

  // ---------- الرسم ----------
  const main = $("#main");

  function render() {
    const bar = $("#barActions");
    const tabs = $("#tabs");
    const pub = $("#pubLine");
    const show = (on) => { bar.hidden = !on; tabs.hidden = !on; pub.hidden = !on; };

    if (dbState === "connecting") {
      show(false);
      main.innerHTML = `<div class="notice">بنوصل للسيرفر…</div>`;
      $("#saveState").textContent = "بنوصل للسيرفر…";
      return;
    }
    if (dbState === "none") {
      show(false);
      main.innerHTML = `<div class="notice">ما قدرنا نوصل للسيرفر. تأكد من الإنترنت وحمّل الصفحة من جديد.</div>`;
      $("#saveState").textContent = "ما في اتصال";
      return;
    }
    if (!authed) {
      show(false);
      renderLogin();
      return;
    }
    if (!draft) {
      show(false);
      main.innerHTML = `<div class="notice">ما قدرنا نقرأ المحتوى المحفوظ. حمّل الصفحة من جديد.</div>`;
      return;
    }
    show(true);
    $("#btnLock").hidden = false;
    $$("#tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    const scrollY = window.scrollY;
    main.innerHTML = ({ cafe: tabCafe, items: tabItems, cats: tabCats, hero: tabHero, texts: tabTexts, colors: tabColors, visit: tabVisit, security: tabSecurity })[tab]();
    window.scrollTo(0, scrollY);
    renderSaveState();
    renderPublish();
    measureBar();
  }

  function measureBar() {
    const h = $(".bar").offsetHeight;
    document.documentElement.style.setProperty("--bar-h", h + "px");
  }
  window.addEventListener("resize", measureBar);

  // ---------- عناصر النماذج ----------
  let uid = 0;
  const fid = () => "f" + ++uid;

  function input(path, label, opts = {}) {
    const id = fid();
    const v = opts.value !== undefined ? opts.value : getPath(draft, path);
    const dir = opts.dir ? ` dir="${opts.dir}"` : "";
    const ph = opts.ph ? ` placeholder="${esc(opts.ph)}"` : "";
    const kind = opts.kind ? ` data-kind="${opts.kind}"` : "";
    const ctl = opts.multi
      ? `<textarea id="${id}" rows="${opts.rows || 3}" data-bind="${path}"${kind}${dir}${ph}>${esc(v == null ? "" : v)}</textarea>`
      : `<input id="${id}" type="${opts.type || "text"}" data-bind="${path}"${kind}${dir}${ph}${opts.attrs || ""} value="${esc(v == null ? "" : v)}">`;
    return `<div class="field"><label for="${id}">${esc(label)}</label>${ctl}${opts.hint ? `<p class="hint">${esc(opts.hint)}</p>` : ""}</div>`;
  }
  function pair(base, labelAr, labelEn, opts = {}) {
    // base = "categories.0.items.1.desc" → descAr / descEn
    return `<div class="pair">${input(base + "Ar", labelAr, Object.assign({ dir: "rtl" }, opts))}${input(base + "En", labelEn, Object.assign({ dir: "ltr" }, opts))}</div>`;
  }
  function namePair(base) {
    return `<div class="pair">${input(base + ".ar", "الاسم بالعربي", { dir: "rtl" })}${input(base + ".en", "Name in English", { dir: "ltr" })}</div>`;
  }
  // نص من i18n: الخانة بتبيّن القيمة المعدّلة أو الأصلية، والفاضي بيرجع للأصلي
  function textPair(key, label, multi) {
    const one = (lang) => input(`text.${lang}.${key}`, lang === "ar" ? `${label}` : "English", {
      value: (draft.text[lang] && draft.text[lang][key]) || I18N[lang][key] || "",
      ph: I18N[lang][key] || "",
      dir: lang === "ar" ? "rtl" : "ltr",
      kind: "text",
      multi,
      rows: 4,
    });
    return `<div class="pair">${one("ar")}${one("en")}</div>`;
  }
  function imageCtl(path, opts = {}) {
    const v = getPath(draft, path) || "";
    const fallback = opts.fallback || "";
    const key = v || fallback;
    const src = imgSrc(key);
    const prev = src
      ? `<img data-src-key="${esc(key)}" src="${esc(src)}" alt="">`
      : `<span>${esc(opts.empty || "بدون صورة")}</span>`;
    return `<div class="field"><span class="label">${esc(opts.label || "الصورة")}</span>
      <div class="img-ctl">
        <div class="img-prev${opts.wide ? " wide" : ""}${opts.square ? " square" : ""}">${prev}</div>
        <div class="img-btns">
          <label class="mini upload">${v ? "غيّر الصورة" : "اختار صورة"}<input type="file" accept="image/*" data-img="${path}"></label>
          ${MEDIA_RE.test(v) ? `<button class="mini" type="button" data-act="edit-img" data-path="${path}">ظبّط المقاس</button>` : ""}
          ${v ? `<button class="mini" type="button" data-act="clear-img" data-path="${path}">${esc(opts.clearLabel || "شيل الصورة")}</button>` : ""}
        </div>
      </div>
      ${opts.hint ? `<p class="hint">${esc(opts.hint)}</p>` : ""}</div>`;
  }
  const iconSvg = (key) => `<svg viewBox="0 0 48 56" aria-hidden="true">${window.RABAD_ICONS[key] || window.RABAD_ICONS.specialty}</svg>`;
  const details = (key, summary, body) =>
    `<details class="entry" data-key="${key}"${openKeys.has(key) ? " open" : ""}><summary>${summary}</summary><div class="entry-body">${body}</div></details>`;
  const confirmBtn = (act, data, label) =>
    `<button class="mini danger" type="button" data-act="${act}" ${data} data-label="${esc(label)}">${esc(label)}</button>`;

  // ---------- التبويبات ----------
  function tabItems() {
    const cats = draft.categories;
    if (!cats.length) return `<div class="notice">ما في أقسام. ضيف قسم من تبويب «الأقسام» أول.</div>`;
    if (catFilter >= cats.length) catFilter = 0;
    const ci = catFilter;
    const cat = cats[ci];
    const options = cats.map((c, i) => `<option value="${i}"${i === ci ? " selected" : ""}>${esc(c.ar || c.en || "قسم بدون اسم")} (${c.items.length})</option>`).join("");
    const items = cat.items.map((it, ii) => {
      const p = `categories.${ci}.items.${ii}`;
      const src = imgSrc(it.image);
      const thumb = src ? `<img data-src-key="${esc(it.image)}" src="${esc(src)}" alt="">` : iconSvg(cat.icon || cat.id);
      const summary = `<span class="thumb">${thumb}</span><span class="sum-text"><span class="sum-name" data-sum="${p}.ar">${esc(it.ar || it.en || "صنف بدون اسم")}</span><span class="sum-sub" data-sum="${p}.price">${fmtPrice(it.price)} د.أ</span></span>`;
      const moveOpts = cats.map((c, i) => `<option value="${i}"${i === ci ? " selected" : ""}>${esc(c.ar || c.en)}</option>`).join("");
      const body = `
        ${namePair(p)}
        ${input(p + ".price", "السعر بالدينار", { type: "number", kind: "price", attrs: ' inputmode="decimal" step="0.05" min="0"', dir: "ltr" })}
        ${pair(p + ".desc", "وصف قصير (سطر، بيطلع على العجلة)", "Short description", { multi: true, rows: 2 })}
        ${pair(p + ".long", "الوصف الكامل (بأي طول، بيطلع بالتفاصيل)", "Full description", { multi: true, rows: 5, hint: "اختياري" })}
        <div class="pair">${input(p + ".tagsAr", "كلمات قصيرة", { kind: "tags", dir: "rtl", value: (it.tagsAr || []).join("، "), hint: "افصل بينها بفاصلة، مثل: سخن، بيكفي شخصين" })}${input(p + ".tagsEn", "Tags", { kind: "tags", dir: "ltr", value: (it.tagsEn || []).join(", "), hint: "Comma separated" })}</div>
        ${imageCtl(p + ".image", { hint: "بعد ما تختار الصورة بتفتح نافذة تظبّط فيها شو بيبين منها. «ظبّط المقاس» برجّعك لها بأي وقت." })}
        <div class="row-actions">
          <button class="mini" type="button" data-act="item-up" data-ci="${ci}" data-ii="${ii}"${ii === 0 ? " disabled" : ""} aria-label="لفوق">↑</button>
          <button class="mini" type="button" data-act="item-down" data-ci="${ci}" data-ii="${ii}"${ii === cat.items.length - 1 ? " disabled" : ""} aria-label="لتحت">↓</button>
          <label class="move">انقله لـ<select data-act="item-move" data-ci="${ci}" data-ii="${ii}">${moveOpts}</select></label>
          ${confirmBtn("item-del", `data-ci="${ci}" data-ii="${ii}"`, "احذف الصنف")}
        </div>`;
      return details(`i:${ci}:${ii}`, summary, body);
    }).join("");
    return `
      <p class="lede">كبسة على أي صنف بتفتحه. التعديلات بتنحفظ لحالها، وبتوصل الموقع لما تكبس «انشر على الموقع».</p>
      <div class="toolbar"><div class="field"><label for="catPick">القسم</label><select id="catPick" data-act="cat-filter">${options}</select></div></div>
      ${items || `<div class="notice">ما في أصناف بهاد القسم لسا.</div>`}
      <button class="add" type="button" data-act="item-add" data-ci="${ci}">+ ضيف صنف لـ«${esc(cat.ar || cat.en)}»</button>`;
  }

  function tabCats() {
    const cats = draft.categories;
    const list = cats.map((c, ci) => {
      const p = `categories.${ci}`;
      const summary = `<span class="thumb">${iconSvg(c.icon || c.id)}</span><span class="sum-text"><span class="sum-name" data-sum="${p}.ar">${esc(c.ar || c.en || "قسم بدون اسم")}</span><span class="sum-sub">${c.items.length} أصناف</span></span>`;
      const icons = ICON_KEYS.map((k) => `<label><input type="radio" name="icon${ci}" value="${k}" data-bind="${p}.icon"${(c.icon || c.id) === k ? " checked" : ""} aria-label="${k}">${iconSvg(k)}</label>`).join("");
      const body = `
        ${namePair(p)}
        ${pair(p + ".note", "سطر صغير تحت الاسم", "Small note")}
        <div class="field"><span class="label">الرسمة</span><div class="icons" role="radiogroup">${icons}</div></div>
        <div class="row-actions">
          <button class="mini" type="button" data-act="cat-up" data-ci="${ci}"${ci === 0 ? " disabled" : ""} aria-label="لفوق">↑</button>
          <button class="mini" type="button" data-act="cat-down" data-ci="${ci}"${ci === cats.length - 1 ? " disabled" : ""} aria-label="لتحت">↓</button>
          <button class="mini" type="button" data-act="cat-items" data-ci="${ci}">عدّل أصنافه</button>
          ${cats.length > 1 ? confirmBtn("cat-del", `data-ci="${ci}"`, c.items.length ? "احذف القسم (أصنافه بتنتقل لأول قسم)" : "احذف القسم") : ""}
        </div>`;
      return details(`c:${ci}`, summary, body);
    }).join("");
    return `
      <p class="lede">الأقسام بتطلع بطاقات بقسم المنيو، بنفس الترتيب اللي هون.</p>
      ${list}
      <button class="add" type="button" data-act="cat-add">+ ضيف قسم</button>`;
  }

  function tabCafe() {
    return `
      <p class="lede">اسم الكافيه وشعاره بيطلعوا فوق بكل صفحات الموقع.</p>
      <section class="card"><h2>الاسم</h2>${TEXT_GROUPS.cafe.map(([k, label]) => textPair(k, label)).join("")}</section>
      <section class="card"><h2>الشعار</h2>
        ${imageCtl("brand.logo", { square: true, label: "صورة الشعار", empty: "الشعار الحالي (رسمة القلعة)", clearLabel: "رجّع رسمة القلعة", hint: "بتطلع صغيرة جنب الاسم ومدوّرة الزوايا. بعد ما تختارها بتظبّط شو بيبين منها بالمربع." })}
      </section>`;
  }

  function tabHero() {
    const groups = TEXT_GROUPS.hero.map(([k, label, multi]) => textPair(k, label, multi)).join("");
    return `
      <section class="card"><h2>صورة الواجهة</h2>
        ${imageCtl("hero.image", { wide: true, fallback: "assets/hero.jpg", label: "الصورة", clearLabel: "رجّع الصورة الأصلية", hint: "بعد ما تختارها بتظبّط شو بيبين منها، وبتشوف كمان شو بيبين على الجوال. مع صورة جديدة، أضواء التراس والطيور والبخار بتختفي لأنها مرسومة على الصورة الأصلية. حركة الكاميرا والإضاءة بتضل." })}
      </section>
      <section class="card"><h2>النص على الواجهة</h2>${groups}</section>`;
  }

  function tabTexts() {
    return `<p class="lede">إذا فضّيت أي خانة، بيرجع النص الأصلي.</p>` + TEXT_GROUPS.texts.map(([title, keys]) =>
      `<section class="card"><h2>${esc(title)}</h2>${keys.map(([k, label, multi]) => textPair(k, label, multi)).join("")}</section>`
    ).join("");
  }

  function tabColors() {
    const sw = Object.keys(DEFAULT_THEME).map((k) => {
      const v = isHex(draft.theme[k]) ? draft.theme[k] : DEFAULT_THEME[k];
      const id = fid();
      return `<div class="swatch">
        <input type="color" id="${id}" value="${v}" data-bind="theme.${k}" data-kind="hex" aria-label="${esc(THEME_LABELS[k][0])}">
        ${input("theme." + k, THEME_LABELS[k][0], { value: v, kind: "hex", dir: "ltr", hint: THEME_LABELS[k][1], attrs: ' maxlength="7" spellcheck="false"' })}
      </div>`;
    }).join("");
    return `
      <section class="card"><h2>معاينة</h2>${previewHtml()}</section>
      <section class="card"><h2>الألوان</h2><div class="swatches">${sw}</div>
        <div><button class="mini" type="button" data-act="theme-reset">رجّع الألوان الأصلية</button></div>
      </section>`;
  }
  function previewVars() {
    const t = Object.assign({}, DEFAULT_THEME);
    Object.keys(t).forEach((k) => { if (isHex(draft.theme[k])) t[k] = draft.theme[k]; });
    return `--p-oak:${t.oak};--p-raised:${t.oakRaised};--p-oak-deep:${t.oakDeep};--p-stone:${t.stone};--p-olive:${t.olive};--p-pom:${t.pomegranate};--p-ivory:${t.ivory}`;
  }
  function previewHtml() {
    const ar = draft.text.ar;
    return `<div class="preview" id="preview" style="${previewVars()}">
      <h3>${esc(ar.menuTitle || I18N.ar.menuTitle)}</h3>
      <div class="p-cards">
        <div class="p-card"><b>${esc(draft.categories[0] ? draft.categories[0].ar : "")}</b><span>${draft.categories[0] ? draft.categories[0].items.length : 0} أصناف</span></div>
        <div class="p-card"><b>${esc(draft.categories[1] ? draft.categories[1].ar : "")}</b><span>${draft.categories[1] ? draft.categories[1].items.length : 0} أصناف</span></div>
      </div>
      <div class="p-wheel" aria-hidden="true"><i style="background:var(--p-raised)"></i><i style="background:var(--p-stone)"></i><i style="background:var(--p-pom)"></i><i style="background:color-mix(in srgb, var(--p-olive) 72%, #000)"></i></div>
      <div class="p-btns"><span class="p-btn">${esc(ar.whatsappCta || I18N.ar.whatsappCta)}</span><span class="p-ghost">${esc(ar.mapCta || I18N.ar.mapCta)}</span></div>
    </div>`;
  }

  function tabVisit() {
    return `
      <section class="card"><h2>التواصل</h2>
        <div class="pair">
          ${input("contact.whatsapp", "رقم الواتساب", { type: "tel", dir: "ltr", kind: "digits", ph: "962790000000", hint: "مع رمز الدولة، بدون + أو أصفار بالأول" })}
          ${input("contact.phone", "رقم الهاتف (اختياري)", { type: "tel", dir: "ltr", kind: "digits", ph: "962790000000" })}
        </div>
        ${input("contact.mapUrl", "رابط الخريطة", { type: "url", dir: "ltr", kind: "url", hint: "من Google Maps: مشاركة ← نسخ الرابط" })}
        <div class="pair">
          ${input("contact.instagram", "إنستغرام (اختياري)", { type: "url", dir: "ltr", kind: "url", ph: "https://instagram.com/..." })}
          ${input("contact.facebook", "فيسبوك (اختياري)", { type: "url", dir: "ltr", kind: "url", ph: "https://facebook.com/..." })}
        </div>
      </section>
      <section class="card"><h2>الدوام والعنوان</h2>${TEXT_GROUPS.visit.map(([k, label, multi]) => textPair(k, label, multi)).join("")}</section>`;
  }

  // ---------- الإدخال ----------
  function changed(ms) {
    renderSaveState();
    scheduleSave(ms == null ? 1100 : ms);
  }

  function onInput(e) {
    const el = e.target;
    const path = el.dataset && el.dataset.bind;
    if (!path || !draft) return;
    const kind = el.dataset.kind;
    let v = el.type === "radio" ? (el.checked ? el.value : undefined) : el.value;
    if (v === undefined) return;
    if (kind === "price") {
      const n = parseFloat(String(v).replace(",", "."));
      v = Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : 0;
    } else if (kind === "tags") {
      v = String(v).split(/[,،]/).map((s) => s.trim()).filter(Boolean);
    } else if (kind === "text") {
      const [, lang, key] = path.split(".");
      if (!v.trim() || v === I18N[lang][key]) v = undefined; // فاضي أو نفس الأصلي = النص الأصلي
    } else if (kind === "hex") {
      v = String(v).trim().toLowerCase();
      if (/^[0-9a-f]{6}$/.test(v)) v = "#" + v;
      if (!isHex(v)) return; // لسا بيكتب
      // اللون والخانة جنب بعض: بنحدّث الثاني بمكانه
      $$(`[data-bind="${path}"]`).forEach((o) => { if (o !== el && o.value !== v) o.value = v; });
      setPath(draft, path, v);
      const pv = $("#preview");
      if (pv) pv.setAttribute("style", previewVars());
    } else if (kind === "digits") {
      v = String(v).replace(/[^\d]/g, "");
    } else if (kind === "url") {
      v = String(v).trim();
    }
    setPath(draft, path, v);
    // ملخص الصنف أو القسم بيتحدّث وانت بتكتب
    const sum = $(`[data-sum="${path}"]`);
    if (sum) sum.textContent = kind === "price" ? `${fmtPrice(v)} د.أ` : (v || "بدون اسم");
    if (el.getAttribute("aria-invalid") === "true") validate(el);
    changed(e.type === "change" ? 300 : 1100);
  }
  main.addEventListener("input", onInput);
  // صورة من الموقع (assets/...) مش موجودة جنب اللوحة: بنكتب مكانها بدل الصورة المكسورة
  main.addEventListener("error", (e) => {
    const img = e.target;
    if (img.tagName !== "IMG") return;
    const box = img.parentElement;
    if (box && box.classList.contains("img-prev")) box.textContent = "الصورة على الموقع";
    else img.remove();
  }, true);
  main.addEventListener("change", (e) => {
    if (e.target.matches("[data-bind]")) onInput(e);
  });
  main.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.matches && d.matches("details.entry")) d.open ? openKeys.add(d.dataset.key) : openKeys.delete(d.dataset.key);
  }, true);
  main.addEventListener("focusout", (e) => {
    if (e.target.matches && e.target.matches("[data-kind]")) validate(e.target);
    if (hasChanges()) scheduleSave(400);
  });

  // خطأ تحت الخانة نفسها، بعد ما تطلع منها
  function fieldError(el) {
    const v = String(el.value || "").trim();
    const kind = el.dataset.kind;
    if (!v) return "";
    if (kind === "url" && !/^https:\/\/[^\s"'<>]{3,}$/i.test(v)) return "الرابط لازم يبلّش بـ https://";
    if (kind === "digits" && v.replace(/[^\d]/g, "").length < 8) return "الرقم قصير. اكتبه مع رمز الدولة، مثل 962791234567";
    if (kind === "hex" && el.type === "text" && !/^#?[0-9a-f]{6}$/i.test(v)) return "اكتب اللون بالشكل ‎#a3333d";
    return "";
  }
  function validate(el) {
    const msg = fieldError(el);
    const field = el.closest(".field");
    if (!field) return;
    let p = field.querySelector(".err");
    if (!msg) {
      el.removeAttribute("aria-invalid");
      if (p) p.remove();
      return;
    }
    if (!p) {
      p = document.createElement("p");
      p.className = "err";
      p.id = el.id + "-err";
      field.appendChild(p);
    }
    p.textContent = msg;
    el.setAttribute("aria-invalid", "true");
    el.setAttribute("aria-describedby", p.id);
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden && hasChanges()) runSave(); });
  window.addEventListener("pagehide", () => { if (hasChanges()) runSave(); });
  window.addEventListener("beforeunload", (e) => {
    if (canEdit && hasChanges()) { e.preventDefault(); e.returnValue = ""; }
  });

  // زر الحذف بيطلب كبسة ثانية للتأكيد
  function armed(btn) {
    if (btn.classList.contains("armed")) return true;
    btn.classList.add("armed");
    btn.textContent = "متأكد؟ اكبس كمان مرة";
    setTimeout(() => {
      if (!btn.isConnected) return;
      btn.classList.remove("armed");
      btn.textContent = btn.dataset.label;
    }, 4000);
    return false;
  }

  // الحذف بينحفظ لحاله، فبنعطي فرصة تراجع لثمان ثواني
  let undoSnap = null;
  let undoTimer = 0;
  function offerUndo(text, snap) {
    undoSnap = snap;
    $("#undoText").textContent = text;
    $("#undoBar").hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { $("#undoBar").hidden = true; undoSnap = null; }, 8000);
  }
  $("#undoBtn").addEventListener("click", () => {
    if (!undoSnap || !draft) return;
    draft.categories = undoSnap;
    undoSnap = null;
    $("#undoBar").hidden = true;
    render();
    changed(300);
  });

  const move = (arr, i, j) => {
    if (j < 0 || j >= arr.length) return;
    const [x] = arr.splice(i, 1);
    arr.splice(j, 0, x);
  };

  function onAction(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn || !draft || btn.tagName === "SELECT" && e.type === "click") return;
    const act = btn.dataset.act;
    const ci = Number(btn.dataset.ci);
    const ii = Number(btn.dataset.ii);
    const cats = draft.categories;
    switch (act) {
      case "item-add": {
        cats[ci].items.push(normItem({ ar: "صنف جديد", en: "New item", price: 0 }));
        openKeys.add(`i:${ci}:${cats[ci].items.length - 1}`);
        break;
      }
      case "item-up": move(cats[ci].items, ii, ii - 1); openKeys.clear(); openKeys.add(`i:${ci}:${ii - 1}`); break;
      case "item-down": move(cats[ci].items, ii, ii + 1); openKeys.clear(); openKeys.add(`i:${ci}:${ii + 1}`); break;
      case "item-del":
        if (!armed(btn)) return;
        offerUndo(`انحذف «${cats[ci].items[ii].ar || cats[ci].items[ii].en || "الصنف"}»`, clone(cats));
        cats[ci].items.splice(ii, 1);
        openKeys.clear();
        break;
      case "cat-add": {
        cats.push({ id: "c" + Date.now().toString(36), icon: "specialty", ar: "قسم جديد", en: "New section", noteAr: "", noteEn: "", items: [] });
        openKeys.add(`c:${cats.length - 1}`);
        break;
      }
      case "cat-up": move(cats, ci, ci - 1); openKeys.clear(); break;
      case "cat-down": move(cats, ci, ci + 1); openKeys.clear(); break;
      case "cat-items": catFilter = ci; tab = "items"; openKeys.clear(); render(); window.scrollTo(0, 0); return;
      case "cat-del": {
        if (cats.length < 2 || !armed(btn)) return;
        offerUndo(`انحذف قسم «${cats[ci].ar || cats[ci].en || ""}»`, clone(cats));
        const [gone] = cats.splice(ci, 1);
        cats[0].items.push(...gone.items);
        catFilter = 0;
        openKeys.clear();
        break;
      }
      case "clear-img":
        setPath(draft, btn.dataset.path, "");
        setPath(draft, editPath(btn.dataset.path), undefined);
        break;
      case "edit-img": editImage(btn.dataset.path); return;
      case "theme-reset": draft.theme = Object.assign({}, DEFAULT_THEME); break;
      case "pw-set": case "pw-change": case "pw-remove": passwordAction(act); return;
      default: return;
    }
    render();
    changed(300);
  }
  main.addEventListener("click", onAction);
  main.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.act === "cat-filter") {
      catFilter = Number(el.value);
      openKeys.clear();
      render();
    } else if (el.dataset.act === "item-move") {
      const ci = Number(el.dataset.ci);
      const ii = Number(el.dataset.ii);
      const to = Number(el.value);
      if (to === ci) return;
      const [it] = draft.categories[ci].items.splice(ii, 1);
      draft.categories[to].items.push(it);
      openKeys.clear();
      render();
      changed(300);
    }
  });

  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b || b.dataset.tab === tab) return;
    if (hasChanges()) scheduleSave(0);
    tab = b.dataset.tab;
    openKeys.clear();
    lockMsg = "";
    render();
    window.scrollTo(0, 0);
  });
  $("#btnSave").addEventListener("click", () => { pausedUntil = 0; runSave(); });
  $("#btnPublish").addEventListener("click", requestPublish);
  $("#btnLock").addEventListener("click", logout);

  // ---------- الحالة فوق ----------
  function renderSaveState() {
    const el = $("#saveState");
    const dirty = hasChanges();
    $("#saveDot").hidden = !dirty;
    $("#btnSave").disabled = saving || !dirty;
    let text;
    if (lastError) text = lastError;
    else if (saving) text = "بيحفظ…";
    else if (dirty) text = "في تعديلات مش محفوظة";
    else if (storeMoved) text = "في تعديلات من جهاز ثاني. حمّل الصفحة لتشوفها.";
    else text = savedOnce ? "انحفظ وتأكدنا منه بالقاعدة" : "كل إشي محفوظ";
    el.textContent = text;
    el.classList.toggle("bad", !!lastError);
  }
  function showError(text) {
    const line = $("#errorLine");
    line.textContent = text;
    line.hidden = false;
    clearTimeout(showError.t);
    showError.t = setTimeout(() => (line.hidden = true), 9000);
  }

  // ---------- النشر ----------
  // السيرفر بيحوّل المحفوظ لنسخة الزبائن بنفس الطلب، فالنشر بياخد ثانية
  let publishState = null;
  let contentChangedAt = 0;
  let publishBusy = false;
  let publishAfterSave = false;

  const hasUnpublished = () => {
    const st = publishState || {};
    if (!contentChangedAt) return false;
    if (st.status !== "live" || typeof st.at !== "number") return true;
    return contentChangedAt > st.at;
  };

  function publishLabel() {
    const st = publishState || {};
    let when = "";
    try {
      if (typeof st.at === "number") when = new Date(st.at).toLocaleString("ar", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
    } catch (_) { /* ignore */ }
    if (publishBusy) return ["بينشر…", ""];
    if (publishAfterSave) return ["بيحفظ أول، وبعدين بينشر…", ""];
    if (st.status === "live" && hasUnpublished()) return ["في تعديلات محفوظة ما وصلت الموقع لسا", "due"];
    if (st.status === "live") return ["الموقع محدّث · " + when, "ok"];
    if (st.status === "failed") return ["ما زبط النشر: " + String(st.error || "").slice(0, 160), "bad"];
    return ["ما انتشر لسا", "due"];
  }
  function renderPublish() {
    const [text, cls] = publishLabel();
    const el = $("#pubState");
    el.textContent = text;
    el.className = "pub-state" + (cls ? " " + cls : "");
    $("#btnPublish").disabled = !authed || publishBusy || publishAfterSave;
  }
  setInterval(renderPublish, 30000);

  async function requestPublish() {
    if (!authed || publishBusy) return;
    // اللي بينتشر هو المحفوظ، فالمش محفوظ بينحفظ أول
    if (saving || hasChanges()) {
      publishAfterSave = true;
      renderPublish();
      if (!saving) { pausedUntil = 0; runSave(); }
      return;
    }
    publishBusy = true;
    renderPublish();
    try {
      publishState = await api("POST", "publish", {});
    } catch (e) {
      const why = e && e.code === "network" ? "ما قدرنا نوصل للسيرفر. اكبس انشر كمان مرة." : "صار خطأ بالسيرفر. اكبس انشر كمان مرة.";
      publishState = { status: "failed", at: Date.now(), error: why };
    }
    publishBusy = false;
    renderPublish();
  }

  // ---------- الدخول وكلمة السر ----------
  // كلمة السر بتتحقق بالسيرفر، وبعدها بيعطي المتصفح جلسة لأسبوع
  const PW_MIN = 8;
  let lockMsg = "";
  let lockMsgOk = false;
  let lockBusy = false;

  function renderLogin() {
    main.innerHTML = `<div class="lock"><form id="loginForm" autocomplete="on">
      <h2>ادخل على اللوحة</h2>
      <p>اكتب كلمة السر.</p>
      <div class="field"><label for="pw">كلمة السر</label><input type="password" id="pw" autocomplete="current-password" maxlength="200" required${lockBusy ? " disabled" : ""}></div>
      <p class="msg${lockMsg ? " bad" : ""}" role="alert">${esc(lockMsg)}</p>
      <button class="btn btn-accent" type="submit"${lockBusy ? " disabled" : ""}>${lockBusy ? "بنتأكد…" : "ادخل"}</button>
    </form></div>`;
    $("#saveState").textContent = "لازم تدخل أول";
    const pw = $("#pw");
    if (pw && !pw.disabled) try { pw.focus(); } catch (_) { /* ignore */ }
  }
  function loginErrorText(e) {
    const code = e && e.code;
    if (code === "wrong") return "كلمة السر غلط.";
    if (code === "too_many") return `محاولات كثير. استنى ${Math.max(1, Math.ceil((Number(e.wait) || 60) / 60))} دقيقة وجرّب.`;
    if (code === "no_password") return "ما في كلمة سر مضبوطة للوحة لسا.";
    if (code === "network") return "ما قدرنا نوصل للسيرفر. تأكد من الإنترنت.";
    return "ما زبط الدخول. جرّب كمان مرة.";
  }
  main.addEventListener("submit", async (e) => {
    if (e.target.id !== "loginForm") return;
    e.preventDefault();
    if (lockBusy) return;
    const pw = $("#pw").value;
    if (!pw) return;
    lockBusy = true;
    lockMsg = "";
    render();
    try {
      await api("POST", "login", { password: pw });
      authed = true;
      lockBusy = false;
      await start();
    } catch (err) {
      lockBusy = false;
      lockMsg = loginErrorText(err);
      render();
    }
  });
  async function logout() {
    if (hasChanges()) await runSave();
    await api("POST", "logout", {}).catch(() => {});
    authed = false;
    lockMsg = "";
    render();
  }

  function tabSecurity() {
    const pw = (id, label, ac) => `<div class="field"><label for="${id}">${label}</label><input type="password" id="${id}" autocomplete="${ac}" maxlength="200"></div>`;
    return `<section class="card"><h2>كلمة سر اللوحة</h2>
      <p class="lede">كلمة السر بتحمي اللوحة: بدونها ما حدا بيقدر يفتحها أو يعدّل الموقع. اختار وحدة طويلة (${PW_MIN} أحرف أو أكثر) وما تشاركها. لما تغيّرها، كل الأجهزة الثانية الداخلة على اللوحة بتطلع.</p>
      <div class="pair">${pw("pwCur", "كلمة السر الحالية", "current-password")}${pw("pwNew", "كلمة السر الجديدة", "new-password")}${pw("pwNew2", "اكتبها كمان مرة", "new-password")}</div>
      <p class="msg${lockMsg ? (lockMsgOk ? " ok" : " bad") : ""}" role="alert">${esc(lockMsg)}</p>
      <div class="row-actions"><button class="btn btn-accent" type="button" data-act="pw-change">غيّر كلمة السر</button></div>
    </section>`;
  }

  async function passwordAction() {
    if (!authed || lockBusy) return;
    const val = (id) => ($("#" + id) ? $("#" + id).value : "");
    const cur = val("pwCur");
    const next = val("pwNew");
    const again = val("pwNew2");
    const say = (text, ok) => { lockMsg = text; lockMsgOk = !!ok; render(); };
    if (next.length < PW_MIN) return say(`كلمة السر قصيرة. لازم ${PW_MIN} أحرف أو أكثر.`);
    if (next !== again) return say("الكلمتين مش متطابقات.");
    lockBusy = true;
    try {
      await api("POST", "password", { current: cur, next });
      lockBusy = false;
      say("انغيّرت كلمة السر.", true);
    } catch (e) {
      lockBusy = false;
      say(e && e.code === "wrong" ? "كلمة السر الحالية غلط." : "ما قدرنا نغيّرها. جرّب كمان مرة.");
    }
  }

  render();
  connect();
})();
