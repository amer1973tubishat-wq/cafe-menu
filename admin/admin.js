// لوحة قهوة الربض: بتعدّل محتوى الموقع وبتحفظه بقاعدة بيانات الصفحة (capability "db").
// زر النشر بيشغّل مهمة مجدولة على Claude Code Remote: بتقرأ القاعدة، بتبني الموقع، بتنشره على رابط المنيو وعلى GitHub.
//
// القاعدة:
//   content/menu   {categories, updatedAt}         الأقسام وأصنافها (نفس شكل window.MENU، والقسم إله icon)
//   content/site   {text, theme, contact, hero, updatedAt}
//   media/<id>     {url: data URL, at}             صورة مضغوطة لكل مستند
//   secure/lock    بصمة كلمة السر (PBKDF2)، بيقرأها الأدمن بس
//   meta/publish   حالة النشر، بتكتبها المهمة المجدولة
//
// الحماية الحقيقية هي قواعد القاعدة: الكتابة لأصحاب صلاحية التعديل بس. كلمة السر قفل إضافي على الجهاز.
(() => {
  "use strict";

  // بيتعبّوا بعد ما تنعمل المهمة المجدولة (شوف README)
  const PUBLISH = {
    trigger: "trig_01AaQULcNTojQBUib4Z33bTM",
    menuUrl: "https://claude.ai/artifact/R7ACEADPPD8tPUvyWZ7mJT",
  };
  const PUBLISH_SERVER = "Claude Code Remote";
  const PUBLISH_STALE = 15 * 60 * 1000;

  const DOC_MENU = "content/menu";
  const DOC_SITE = "content/site";
  const MENU_FIELDS = ["categories"];
  const SITE_FIELDS = ["text", "theme", "contact", "hero"];
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
    hero: [
      ["heroTitle", "العنوان الكبير"],
      ["heroLead", "السطر تحت العنوان", true],
      ["heroCta", "زر المنيو"],
      ["heroAlt", "وصف الصورة (للي ما بيشوفوا)"],
    ],
    texts: [
      ["الاسم والقوائم", [
        ["brand", "اسم الكافيه"],
        ["title", "عنوان الصفحة (بالتبويب وبجوجل)"],
        ["navMenu", "رابط المنيو"],
        ["navAbout", "رابط عن المكان"],
        ["navVisit", "رابط زورونا"],
        ["footer", "السطر بآخر الصفحة"],
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
  let DB = null;
  let dbState = "connecting"; // connecting | none | ready
  let canEdit = false;
  let probeDone = false;
  let draft = null;
  let baseline = null;
  let MEDIA = {};
  let pendingMedia = {};
  let tab = "items";
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
    };
    out.text.ar = out.text.ar || {};
    out.text.en = out.text.en || {};
    return out;
  }

  // ---------- الاتصال بالقاعدة ----------
  const claudeUse = (name) =>
    window.claude && typeof window.claude.use === "function"
      ? Promise.resolve(window.claude.use(name)).catch(() => null)
      : Promise.resolve(null);

  async function connect() {
    DB = await claudeUse("db");
    if (!DB) {
      dbState = "none";
      render();
      return;
    }
    dbState = "ready";
    await loadDraft();
    probeAccess(0);
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
      }, (e) => showError(e && e.code === "revoked" ? "انسحبت صلاحية الوصول للقاعدة. حمّل الصفحة من جديد." : "انقطع الاتصال المباشر بالقاعدة. حمّل الصفحة من جديد."));
    });
    DB.doc(LOCK_DOC).onSnapshot((snap) => {
      const was = lockActive();
      lockDoc = snap.exists ? clone(snap.data()) : null;
      if (lockActive() && !was && !justSetLock) unlocked = false;
      justSetLock = false;
      render();
    }, () => {
      if (lockDoc === undefined) {
        lockDoc = { broken: true };
        render();
      }
    });
    DB.doc("meta/publish").onSnapshot((snap) => {
      publishState = snap.exists ? clone(snap.data()) : null;
      renderPublish();
    }, () => {});
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

  // الطريقة الوحيدة الأكيدة نعرف إذا الحساب بيقدر يكتب: نجرّب
  function probeAccess(tries) {
    DB.doc("meta/access-probe").set({ at: Date.now() })
      .then(() => { canEdit = true; probeDone = true; render(); })
      .catch((e) => {
        canEdit = false;
        const code = e && e.code;
        const again = code !== "invalid_argument" && code !== "revoked" && tries < 4;
        if (again) setTimeout(() => probeAccess(tries + 1), 1500 * (tries + 1));
        else probeDone = true;
        render();
      });
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
      if (e && e.code === "invalid_argument") probeAccess(3);
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
    const siteDoc = { text: next.text, theme: next.theme, contact: next.contact, hero: next.hero, updatedAt: Date.now() };
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
  }

  function saveErrorText(e) {
    const code = e && (e.code || e.kind);
    if (code === "toobig") return "المحتوى صار أكبر من اللي بتقبله القاعدة. احذف صورة أو قصّر نص طويل، وبعدين احفظ.";
    if (code === "verify") return "القاعدة ما حفظت كل التعديلات. جرّب احفظ كمان مرة.";
    if (code === "invalid_argument") return "القاعدة رفضت الحفظ. بنتأكد من صلاحيتك…";
    if (code === "revoked") return "انسحبت صلاحية الوصول. حمّل الصفحة من جديد.";
    if (code === "quota_exceeded") return "القاعدة امتلت. احذف صور مش مستعملة وجرّب كمان مرة.";
    if (code === "resource_exhausted") return "كتابات كثير ورا بعض. استنى لحظة وجرّب.";
    return "ما قدرنا نوصل للقاعدة. تعديلاتك لسا هون، جرّب احفظ كمان مرة.";
  }

  // ---------- الصور ----------
  // نفس طريقة لوحة المطعم: فك الصورة من object URL، وتصغيرها، و WebP أو JPEG (سفاري ما بيكتب WebP)
  function readImage(file) {
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
        const out = shrinkImage(img);
        out ? resolve(out) : reject("الصورة كبيرة كثير حتى بعد الضغط");
      };
      img.src = url;
    });
  }
  function shrinkImage(img) {
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) return "";
    let webp = null;
    for (const size of [1100, 900, 760, 620, 480]) {
      const r = Math.min(1, size / w0, size / h0);
      const w = Math.max(1, Math.round(w0 * r));
      const h = Math.max(1, Math.round(h0 * r));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      for (const q of [0.78, 0.66, 0.54, 0.42]) {
        let out = "";
        if (webp !== false) {
          out = c.toDataURL("image/webp", q);
          webp = out.indexOf("data:image/webp") === 0;
        }
        if (!webp) out = c.toDataURL("image/jpeg", q);
        if (out.length < IMG_MAX_CHARS) return out;
      }
    }
    return "";
  }
  function imgSrc(v) {
    if (!v) return "";
    if (/^m[a-z0-9]{4,30}$/.test(v)) return MEDIA[v] || "";
    if (/^assets\/[\w\-./]+$/.test(v)) return v;
    return "";
  }
  function refreshImages() {
    $$("img[data-src-key]").forEach((img) => {
      const src = imgSrc(img.dataset.srcKey);
      if (src && img.getAttribute("src") !== src) img.src = src;
    });
  }

  document.addEventListener("change", (e) => {
    const input = e.target;
    if (!input.matches || !input.matches("input[data-img]")) return;
    const path = input.dataset.img;
    const file = input.files && input.files[0];
    if (!file || !canEdit) return;
    const holder = input.closest(".upload");
    if (holder) holder.classList.add("busy");
    readImage(file).then((dataUrl) => {
      const id = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      pendingMedia[id] = dataUrl;
      MEDIA[id] = dataUrl;
      setPath(draft, path, id);
      lastError = "";
      render();
      changed(400);
    }, (err) => {
      showError("ما قدرنا نستعمل الصورة: " + err);
    }).finally(() => {
      if (holder) holder.classList.remove("busy");
      try { input.value = ""; } catch (_) { /* ignore */ }
    });
  });

  // ---------- الرسم ----------
  const main = $("#main");

  function render() {
    const bar = $("#barActions");
    const tabs = $("#tabs");
    const pub = $("#pubLine");
    const show = (on) => { bar.hidden = !on; tabs.hidden = !on; pub.hidden = !on; };

    if (dbState === "connecting" || (dbState === "ready" && (!probeDone || lockDoc === undefined))) {
      show(false);
      main.innerHTML = `<div class="notice">بنوصل لقاعدة البيانات…</div>`;
      $("#saveState").textContent = "بنوصل لقاعدة البيانات…";
      return;
    }
    if (dbState === "none") {
      show(false);
      main.innerHTML = `<div class="notice">اللوحة بتشتغل بس لما تفتحها من claude.ai وإنت مسجّل دخول بحسابك.</div>`;
      $("#saveState").textContent = "ما في اتصال بالقاعدة";
      return;
    }
    if (!canEdit) {
      show(false);
      main.innerHTML = `<div class="notice">حسابك ما إله صلاحية تعديل على هاي اللوحة. بس صاحب الكافيه، أو اللي أعطاه صلاحية «تعديل»، بيقدر يفتحها.</div>`;
      $("#saveState").textContent = "للقراءة بس";
      return;
    }
    if (!draft) {
      show(false);
      main.innerHTML = `<div class="notice">ما قدرنا نقرأ المحتوى المحفوظ. حمّل الصفحة من جديد.</div>`;
      return;
    }
    if (isLocked()) {
      show(false);
      renderLogin();
      return;
    }
    show(true);
    $("#btnLock").hidden = !lockActive();
    $$("#tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    const scrollY = window.scrollY;
    main.innerHTML = ({ items: tabItems, cats: tabCats, hero: tabHero, texts: tabTexts, colors: tabColors, visit: tabVisit, security: tabSecurity })[tab]();
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
        <div class="img-prev${opts.wide ? " wide" : ""}">${prev}</div>
        <div class="img-btns">
          <label class="mini upload">${v ? "غيّر الصورة" : "اختار صورة"}<input type="file" accept="image/*" data-img="${path}"></label>
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
        ${imageCtl(p + ".image", { hint: "صورة بالعرض، والصنف بالنص. بتنضغط لحالها." })}
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

  function tabHero() {
    const groups = TEXT_GROUPS.hero.map(([k, label, multi]) => textPair(k, label, multi)).join("");
    return `
      <section class="card"><h2>صورة الواجهة</h2>
        ${imageCtl("hero.image", { wide: true, fallback: "assets/hero.jpg", label: "الصورة", clearLabel: "رجّع الصورة الأصلية", hint: "صورة بالعرض. مع صورة جديدة، أضواء التراس والطيور والبخار بتختفي لأنها مرسومة على الصورة الأصلية. حركة الكاميرا والإضاءة بتضل." })}
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

  // زر الحذف بيطلب كبسة ثانية للتأكيد (confirm() ما بيشتغل على claude.ai)
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
      case "clear-img": setPath(draft, btn.dataset.path, ""); break;
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
  $("#btnLock").addEventListener("click", lockNow);
  $("#btnPerms").addEventListener("click", openPermissions);
  $("#menuLink").href = PUBLISH.menuUrl;

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
  let publishState = null;
  let contentChangedAt = 0;
  let publishBusy = false;
  let publishAfterSave = false;

  const publishRunning = () => {
    const st = publishState || {};
    return (st.status === "requested" || st.status === "building") && typeof st.at === "number" && Date.now() - st.at < PUBLISH_STALE;
  };
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
    if (!PUBLISH.trigger) return ["النشر لسا مش مربوط", "bad"];
    if (publishBusy) return ["بيبلّش النشر…", ""];
    if (publishAfterSave) return ["بيحفظ أول، وبعدين بينشر…", ""];
    if (st.status === "requested" && publishRunning()) return ["بلّش النشر، بياخد كم دقيقة", ""];
    if (st.status === "building" && publishRunning()) return ["بيحدّث الموقع…", ""];
    if (st.status === "requested" || st.status === "building") return ["النشر أخد أكثر من العادة. جرّب انشر كمان مرة.", "bad"];
    if (st.status === "live" && hasUnpublished()) return ["في تعديلات محفوظة ما وصلت الموقع لسا", "due"];
    if (st.status === "live") return ["الموقع محدّث · " + when + (st.warning ? " · " + String(st.warning).slice(0, 120) : ""), "ok"];
    if (st.status === "failed") return ["ما زبط النشر: " + String(st.error || "").slice(0, 160), "bad"];
    return ["ما انتشر لسا", "due"];
  }
  function renderPublish() {
    const [text, cls] = publishLabel();
    const el = $("#pubState");
    el.textContent = text;
    el.className = "pub-state" + (cls ? " " + cls : "");
    $("#btnPublish").disabled = !PUBLISH.trigger || publishBusy || publishAfterSave || publishRunning();
    const c = (publishState || {}).code;
    $("#btnPerms").hidden = !((publishState || {}).status === "failed" && (c === "denied" || c === "not_in_manifest" || c === "consent_required"));
  }
  setInterval(renderPublish, 30000);

  function publishErrorText(code, e) {
    if (code === "save_request") return "ما قدرنا نسجّل طلب النشر بالقاعدة.";
    if (["unavailable", "not_granted", "capability_disabled", "capability_removed"].includes(code)) return "النشر بيشتغل بس لما تفتح اللوحة على claude.ai.";
    if (["server_not_connected", "server_not_found", "selection_required"].includes(code)) return "ضيف Claude Code Remote من إعدادات claude.ai ← Connectors، وبعدين انشر.";
    if (code === "needs_reauth") return "اربط Claude Code Remote من جديد من إعدادات claude.ai ← Connectors.";
    if (["not_in_manifest", "consent_required", "denied"].includes(code)) return "اسمح للوحة تستعمل Claude Code Remote (زر «افتح الأذونات»)، وبعدين انشر.";
    if (["blocked_by_policy", "approval_required"].includes(code)) return "إعدادات المؤسسة منعت النشر.";
    if (code === "tool_error") return "مهمة النشر ما بلّشت: " + String((e && e.message) || "").slice(0, 100);
    if (code === "cancelled") return "انلغى النشر. اكبس انشر كمان مرة.";
    if (["upstream_error", "server_unavailable", "rate_limited"].includes(code)) return "خدمة النشر ما ردّت. اكبس انشر كمان مرة بعد دقيقة.";
    return "ما قدرنا نبلّش النشر. اكبس انشر كمان مرة. (" + code + ")";
  }

  async function askPermission() {
    const name = "mcp:" + PUBLISH_SERVER;
    const perm = await claudeUse("permissions");
    if (!perm) return;
    let st = await Promise.resolve(perm.state(name)).catch(() => "unavailable");
    if (st === "prompt") {
      const r = await Promise.resolve(perm.request([name])).catch(() => ({}));
      st = (r && r[name]) || "unavailable";
    }
    if (st === "denied") throw { code: "denied" };
  }
  // خطأ الربط المؤقت قبل ما يوصل الطلب، مسموح نعيده مرة وحدة بس
  function fire(mcp, mayRetry) {
    return mcp.callTool(PUBLISH_SERVER, "fire_trigger", { trigger_id: PUBLISH.trigger }).catch((e) => {
      if (!mayRetry || !e || e.retryable !== true || e.code !== "upstream_error") throw e;
      const wait = Math.min(Math.max(Number(e.retryAfterMs) || 2000, 1000), 20000) + Math.floor(Math.random() * 800);
      return new Promise((r) => setTimeout(r, wait)).then(() => fire(mcp, false));
    });
  }

  async function requestPublish() {
    if (!PUBLISH.trigger || !DB || !canEdit || publishBusy || publishRunning()) return;
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
      try {
        await DB.doc("meta/publish").set({ status: "requested", at: Date.now() });
      } catch (e) {
        throw { code: "save_request" };
      }
      const mcp = await claudeUse("mcp");
      if (!mcp) throw { code: "unavailable" };
      await askPermission();
      await fire(mcp, true);
      publishBusy = false;
      renderPublish();
    } catch (e) {
      publishBusy = false;
      const code = (e && typeof e.code === "string" && e.code) || "unknown";
      try { console.error("[publish]", code, e); } catch (_) { /* ignore */ }
      publishState = { status: "failed", at: Date.now(), error: publishErrorText(code, e), code };
      if (code !== "save_request") DB.doc("meta/publish").set(publishState).catch(() => {});
      renderPublish();
    }
  }

  function openPermissions() {
    claudeUse("permissions").then((perm) => {
      if (!perm) throw new Error("no");
      return perm.manage();
    }).catch(() => {
      $("#pubState").textContent = "افتح قائمة الأذونات (Permissions) للصفحة واسمح بـ Claude Code Remote.";
    });
  }

  // ---------- كلمة السر ----------
  // كلمة السر ما بتنحفظ: بنحفظ ملح عشوائي وبصمة PBKDF2-SHA256 بـ secure/lock، واللي بيقرأه الأدمن بس.
  const LOCK_DOC = "secure/lock";
  const LOCK_ITER = 310000;
  const LOCK_MIN = 6;
  const LOCK_IDLE = 30 * 60 * 1000;
  let lockDoc; // undefined: لسا ما انقرأ، null: ما في كلمة سر
  let unlocked = false;
  let justSetLock = false;
  let lockFails = 0;
  let lockUntil = 0;
  let lockBusy = false;
  let lockMsg = "";
  let lockMsgOk = false;
  let lastActive = Date.now();

  const lockActive = () => !!(lockDoc && typeof lockDoc.salt === "string" && lockDoc.salt && typeof lockDoc.hash === "string" && lockDoc.hash);
  // سجل موجود بس خربان بيقفل كمان: الأحسن من إنه يفتح بدون كلمة سر
  const isLocked = () => !!lockDoc && !unlocked;

  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function deriveHash(password, salt, iter) {
    if (!(window.crypto && crypto.subtle)) throw new Error("no-crypto");
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
  }
  async function checkPassword(password) {
    if (!lockActive()) return false;
    const iter = Number(lockDoc.iter);
    if (!Number.isFinite(iter) || iter < 100000 || iter > 5000000) return false;
    let salt;
    try { salt = unb64(lockDoc.salt); } catch (e) { return false; }
    const a = await deriveHash(password, salt, iter);
    const b = String(lockDoc.hash);
    let diff = a.length ^ b.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }
  async function makeLock(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return { alg: "PBKDF2-SHA256", iter: LOCK_ITER, salt: b64(salt), hash: await deriveHash(password, salt, LOCK_ITER), setAt: Date.now() };
  }

  function renderLogin() {
    const waiting = Date.now() < lockUntil;
    const msg = lockMsg || (!lockActive() ? "سجل كلمة السر خربان. اطلب من Claude يرجّعها." : "");
    main.innerHTML = `<div class="lock"><form id="loginForm" autocomplete="on">
      <h2>ادخل على اللوحة</h2>
      <p>اكتب كلمة السر.</p>
      <div class="field"><label for="pw">كلمة السر</label><input type="password" id="pw" autocomplete="current-password" maxlength="200" required${waiting || lockBusy ? " disabled" : ""}></div>
      <p class="msg${msg ? " bad" : ""}" role="alert">${esc(msg)}</p>
      <button class="btn btn-accent" type="submit"${waiting || lockBusy ? " disabled" : ""}>${lockBusy ? "بنتأكد…" : "ادخل"}</button>
      <p>نسيتها؟ اطلب من Claude يمسح كلمة سر اللوحة. بس حسابك بيقدر.</p>
    </form></div>`;
    const pw = $("#pw");
    if (pw && !pw.disabled) try { pw.focus(); } catch (_) { /* ignore */ }
    if (waiting) setTimeout(() => { if (Date.now() >= lockUntil) { lockMsg = ""; render(); } }, lockUntil - Date.now() + 50);
  }
  main.addEventListener("submit", async (e) => {
    if (e.target.id !== "loginForm") return;
    e.preventDefault();
    if (lockBusy || Date.now() < lockUntil) return;
    const pw = $("#pw").value;
    if (!pw) return;
    lockBusy = true;
    lockMsg = "";
    render();
    try {
      if (await checkPassword(pw)) {
        unlocked = true;
        lockFails = 0;
        lastActive = Date.now();
      } else {
        lockFails++;
        lockMsg = lockActive() ? "كلمة السر غلط." : "سجل كلمة السر خربان. اطلب من Claude يرجّعها.";
        if (lockFails >= 5) {
          lockUntil = Date.now() + Math.min(30000 * Math.pow(2, lockFails - 5), 5 * 60 * 1000);
          lockMsg = "محاولات كثير. استنى شوي وجرّب.";
        }
      }
    } catch (err) {
      lockMsg = err && err.message === "no-crypto" ? "هاد المتصفح ما بيقدر يتحقق من كلمة السر بأمان." : "كلمة السر غلط.";
    }
    lockBusy = false;
    render();
  });
  function lockNow() {
    if (!lockActive()) return;
    if (hasChanges()) runSave();
    unlocked = false;
    lockMsg = "";
    render();
  }
  ["pointerdown", "keydown", "input", "wheel", "touchstart"].forEach((ev) =>
    document.addEventListener(ev, () => (lastActive = Date.now()), { passive: true, capture: true }));
  setInterval(() => { if (lockActive() && unlocked && Date.now() - lastActive > LOCK_IDLE) lockNow(); }, 20000);

  function tabSecurity() {
    const has = lockActive();
    const pw = (id, label, ac) => `<div class="field"><label for="${id}">${label}</label><input type="password" id="${id}" autocomplete="${ac}" maxlength="200"></div>`;
    return `<section class="card"><h2>كلمة سر اللوحة</h2>
      <p class="lede">${has
        ? "اللوحة محمية بكلمة سر. بتنطلب كل ما تفتحها، وبتنقفل لحالها بعد نص ساعة بدون استعمال."
        : `ما في كلمة سر لسا. اختار وحدة (${LOCK_MIN} أحرف أو أكثر)، وبتنطلب كل ما تفتح اللوحة.`}
        القفل الأساسي هو حسابك على claude.ai: ما حدا غيرك بيقدر يفتح هاي الصفحة أو يحفظ فيها.</p>
      <div class="pair">${has ? pw("pwCur", "كلمة السر الحالية", "current-password") : ""}${pw("pwNew", "كلمة السر الجديدة", "new-password")}${pw("pwNew2", "اكتبها كمان مرة", "new-password")}</div>
      <p class="msg${lockMsg ? (lockMsgOk ? " ok" : " bad") : ""}" role="alert">${esc(lockMsg)}</p>
      <div class="row-actions">${has
        ? `<button class="btn btn-accent" type="button" data-act="pw-change">غيّر كلمة السر</button><button class="mini danger" type="button" data-act="pw-remove">شيل كلمة السر</button>`
        : `<button class="btn btn-accent" type="button" data-act="pw-set">احفظ كلمة السر</button>`}</div>
      <p class="lede">نسيتها؟ اطلب من Claude يمسح كلمة سر اللوحة. بس حسابك بيقدر.</p>
    </section>`;
  }

  async function passwordAction(which) {
    if (!DB || !canEdit || lockBusy) return;
    const val = (id) => ($("#" + id) ? $("#" + id).value : "");
    const cur = val("pwCur");
    const next = val("pwNew");
    const again = val("pwNew2");
    const say = (text, ok) => { lockMsg = text; lockMsgOk = !!ok; render(); };
    if (which !== "pw-remove") {
      if (next.length < LOCK_MIN) return say(`كلمة السر قصيرة. لازم ${LOCK_MIN} أحرف أو أكثر.`);
      if (next !== again) return say("الكلمتين مش متطابقات.");
    }
    lockBusy = true;
    try {
      const ok = which === "pw-set" ? !lockActive() : await checkPassword(cur);
      if (!ok) throw { mine: "كلمة السر الحالية غلط." };
      if (which === "pw-remove") {
        await DB.doc(LOCK_DOC).delete();
        lockDoc = null;
      } else {
        const doc = await makeLock(next);
        justSetLock = true;
        await DB.doc(LOCK_DOC).set(doc);
        lockDoc = doc;
      }
      unlocked = true;
      lastActive = Date.now();
      lockBusy = false;
      say(which === "pw-remove" ? "انشالت كلمة السر." : "انحفظت كلمة السر. بتنطلب المرة الجاية اللي بتفتح فيها اللوحة.", true);
    } catch (e) {
      lockBusy = false;
      justSetLock = false;
      say(e && e.mine ? e.mine : e && e.message === "no-crypto" ? "هاد المتصفح ما بيقدر يتحقق من كلمة السر بأمان." : "ما قدرنا نحفظ: " + ((e && (e.code || e.message)) || "خطأ"));
    }
  }

  render();
  connect();
})();
