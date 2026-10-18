// محتوى لوحة التحكم: بيتركّب فوق القيم الافتراضية (menu-data.js و i18n.js والألوان بـ styles.css).
// window.RABAD_CONTENT بييجي من js/content-data.js، واللي بيكتبه scripts/build.js وقت النشر من اللوحة.
// إذا فاضي ({})، الموقع بيضل زي ما هو.
(() => {
  // كل نص من اللوحة بيمر من هون قبل ما ينحط جوّا HTML
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  window.RabadEsc = esc;

  const C = window.RABAD_CONTENT;
  if (!C || typeof C !== "object") return;

  const str = (v) => (typeof v === "string" ? v : "");
  const strs = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []);
  // الصور بتكون ملفات جنب الصفحة بس (assets/...)، مش روابط برّا
  const localPath = (v) => (typeof v === "string" && /^assets\/[\w\-./]+\.(webp|jpe?g|png)$/i.test(v) && !v.includes("..") ? v : "");
  const slug = (v, i) => (typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : `cat${i}`);

  // ---------- المنيو ----------
  if (Array.isArray(C.menu) && C.menu.length) {
    window.MENU = C.menu
      .filter((c) => c && typeof c === "object")
      .map((c, i) => ({
        id: slug(c.id, i),
        icon: str(c.icon),
        ar: str(c.ar),
        en: str(c.en),
        noteAr: str(c.noteAr),
        noteEn: str(c.noteEn),
        items: (Array.isArray(c.items) ? c.items : [])
          .filter((it) => it && typeof it === "object")
          .map((it) => {
            const item = {
              ar: str(it.ar),
              en: str(it.en),
              descAr: str(it.descAr),
              descEn: str(it.descEn),
              price: Number.isFinite(Number(it.price)) ? Number(it.price) : 0,
            };
            if (str(it.longAr)) item.longAr = it.longAr;
            if (str(it.longEn)) item.longEn = it.longEn;
            if (strs(it.tagsAr).length) item.tagsAr = strs(it.tagsAr);
            if (strs(it.tagsEn).length) item.tagsEn = strs(it.tagsEn);
            if (localPath(it.image)) item.image = it.image;
            return item;
          }),
      }));
  }

  // ---------- النصوص ----------
  const text = C.text || {};
  ["ar", "en"].forEach((lang) => {
    const src = text[lang];
    const dst = window.I18N && window.I18N[lang];
    if (!src || !dst) return;
    Object.keys(src).forEach((k) => {
      // بس المفاتيح الموجودة واللي قيمتها نص؛ الدوال (زي cardCount) بتضل
      if (typeof dst[k] === "string" && typeof src[k] === "string" && src[k].trim()) dst[k] = src[k];
    });
  });

  // ---------- الألوان ----------
  const hex = (v) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : "");
  const mix = (a, b, t) => {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
  };
  const theme = C.theme || {};
  const vars = {
    oak: "--oak", oakRaised: "--oak-raised", oakDeep: "--oak-deep", stone: "--stone",
    olive: "--olive", pomegranate: "--pomegranate", ivory: "--ivory",
  };
  const root = document.documentElement;
  Object.keys(vars).forEach((k) => {
    const v = hex(theme[k]);
    if (v) root.style.setProperty(vars[k], v);
  });
  if (hex(theme.pomegranate)) root.style.setProperty("--pomegranate-hover", mix(hex(theme.pomegranate), "#ffffff", 0.12));
  if (hex(theme.ivory)) root.style.setProperty("--ivory-muted", mix(hex(theme.ivory), hex(theme.oak) || "#17302a", 0.22));
  if (hex(theme.stone)) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex(theme.stone).slice(i, i + 2), 16));
    root.style.setProperty("--line", `rgba(${r}, ${g}, ${b}, 0.22)`);
  }
  if (hex(theme.oak)) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = hex(theme.oak);
  }

  // ---------- التواصل وصورة الواجهة (بعد ما الصفحة تنبني) ----------
  const contact = C.contact || {};
  const https = (v) => (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : "");
  const digits = (v) => (typeof v === "string" ? v.replace(/[^\d]/g, "") : "");
  const links = {
    whatsapp: digits(contact.whatsapp).length >= 8 ? `https://wa.me/${digits(contact.whatsapp)}` : "",
    map: https(contact.mapUrl),
    phone: digits(contact.phone).length >= 6 ? `tel:+${digits(contact.phone)}` : "",
    instagram: https(contact.instagram),
    facebook: https(contact.facebook),
  };
  const hero = localPath(C.hero && C.hero.image);

  const applyDom = () => {
    document.querySelectorAll("[data-link]").forEach((a) => {
      const url = links[a.dataset.link];
      // الروابط الاختيارية (هاتف، إنستغرام، فيسبوك) بتختفي إذا ما إلها قيمة
      if (url) a.href = url;
      if (a.hasAttribute("data-optional")) a.hidden = !url;
    });
    if (hero) {
      document.querySelectorAll(".hero picture source").forEach((s) => s.remove());
      const img = document.querySelector(".hero picture img");
      if (img) img.src = hero;
      const pre = document.querySelector('link[rel="preload"][as="image"]');
      if (pre) pre.remove();
      // الأضواء والطيور والبخار مرسومة على مواقع بالصورة الأصلية، فمع صورة جديدة بتختفي
      const h = document.querySelector(".hero");
      if (h) h.classList.add("is-custom");
    }
  };
  // السكربتات آخر الـ body، فالعناصر موجودة هلأ
  if (document.querySelector(".hero")) applyDom();
  else document.addEventListener("DOMContentLoaded", applyDom, { once: true });
})();
