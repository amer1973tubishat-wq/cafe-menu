// قصة السكرول: مسرح ثابت (sticky)، والسكرول جوّاه بيحرّك طبقات الصورة.
// الطبقات بتنرسم على canvas بحجم الشاشة، فما في صور ضخمة ولا فلاتر blur على كرت الشاشة،
// وهذا اللي بيخليها تمشي ناعمة على الموبايل. الغباش = صورة مغبّشة جاهزة بتظهر بالتدريج.
(() => {
  const section = document.querySelector(".cinema");
  if (!section) return;

  const stage = section.querySelector(".stage");
  const back = document.querySelector("#sceneBack");
  const front = document.querySelector("#sceneFront");
  const bctx = back.getContext("2d");
  const fctx = front.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = window.matchMedia("(pointer: coarse)");
  const narrow = window.matchMedia("(max-width: 760px)");
  const track = document.querySelector("#sightsTrack");
  const sights = document.querySelector(".sights");
  const prevBtn = document.querySelector(".sight-prev");
  const nextBtn = document.querySelector(".sight-next");

  const IMG_RATIO = 1408 / 768;
  const STORY = 3400; // كل التوقيتات تحت محسوبة على 3400px، وبتتمدد على طول القسم الفعلي

  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const smoothstep = (e0, e1, v) => {
    const x = clamp((v - e0) / (e1 - e0));
    return x * x * (3 - 2 * x);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const segmentInOut = (s, a, b, c, d) => {
    const enter = smoothstep(a, b, s);
    const exit = smoothstep(c, d, s);
    return { enter, exit, active: enter * (1 - exit) };
  };
  const scrollRange = () => Math.max(1, section.offsetHeight - stage.offsetHeight);
  const getScrollDistance = () => clamp(-section.getBoundingClientRect().top, 0, scrollRange());

  // ---------- الصور ----------
  const imgs = {};
  document.querySelectorAll(".scene-sources img").forEach((img) => {
    imgs[img.dataset.layer] = img;
  });
  const ready = () =>
    Object.values(imgs).every((img) => img.complete && img.naturalWidth > 0);

  // ---------- حجم الـ canvas ----------
  let W = 0;
  let H = 0;
  let dpr = 1;
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    // الموبايل: نسقف الدقة على 2 عشان الذاكرة
    const ratio = Math.min(window.devicePixelRatio || 1, coarse.matches ? 2 : 2.5);
    if (w === W && h === H && ratio === dpr) return;
    W = w;
    H = h;
    dpr = ratio;
    for (const c of [back, front]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
  }

  // نفس حساب object-fit: cover مع نقطة تركيز بين القلعة والتراس
  function frameBox() {
    const fw = Math.max(W, H * IMG_RATIO);
    const fh = fw / IMG_RATIO;
    const fx = W / H < 0.8 ? 0.33 : 0.4;
    const fy = 0.4;
    return {
      x: clamp(W / 2 - fw * fx, W - fw, 0),
      y: clamp(H / 2 - fh * fy, H - fh, 0),
      w: fw,
      h: fh,
    };
  }

  // يرسم طبقة بحجم الإطار، مع إزاحة وتكبير حوالين نقطة (ox, oy) نسبةً للإطار
  function drawLayer(ctx, img, f, { tx = 0, ty = 0, scale = 1, ox = 0.5, oy = 0.5, alpha = 1 }) {
    if (alpha <= 0.001) return;
    const w = f.w * scale;
    const h = f.h * scale;
    const x = f.x + f.w * ox * (1 - scale) + tx;
    const y = f.y + f.h * oy * (1 - scale) + ty;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x * dpr, y * dpr, w * dpr, h * dpr);
    ctx.globalAlpha = 1;
  }

  // غباش تدريجي من فوق لتحت: نصغّر الإطار المرسوم كثير ونرجع نكبّره (ناعم وخفيف، وبيشتغل على Safari)،
  // وبعدين نخفيه فوق بتدرّج عشان القلعة تضل واضحة والكلام تحت يقعد على خلفية ضبابية.
  const mid = document.createElement("canvas");
  const tiny = document.createElement("canvas");
  const mctx = mid.getContext("2d");
  const tctx = tiny.getContext("2d");
  function progressiveBlur(amount, from, to) {
    const mw = Math.max(1, Math.round(front.width / 4));
    const mh = Math.max(1, Math.round(front.height / 4));
    const tw = Math.max(1, Math.round(front.width / 18));
    const th = Math.max(1, Math.round(front.height / 18));
    if (mid.width !== mw || mid.height !== mh) { mid.width = mw; mid.height = mh; }
    if (tiny.width !== tw || tiny.height !== th) { tiny.width = tw; tiny.height = th; }
    for (const c of [mctx, tctx]) { c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high"; }
    mctx.globalCompositeOperation = "copy";
    mctx.drawImage(front, 0, 0, mw, mh);
    tctx.globalCompositeOperation = "copy";
    tctx.drawImage(mid, 0, 0, tw, th);
    mctx.drawImage(tiny, 0, 0, mw, mh);
    // قناع: شفاف فوق، كامل تحت
    mctx.globalCompositeOperation = "destination-in";
    const g = mctx.createLinearGradient(0, 0, 0, mh);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(from, "rgba(0,0,0,0)");
    g.addColorStop(to, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    mctx.fillStyle = g;
    mctx.fillRect(0, 0, mw, mh);
    mctx.globalCompositeOperation = "source-over";
    fctx.globalAlpha = amount;
    fctx.imageSmoothingQuality = "high";
    fctx.drawImage(mid, 0, 0, front.width, front.height);
    fctx.globalAlpha = 1;
  }

  // ---------- الحالة ----------
  let targetMouseX = 0;
  let targetMouseY = 0;
  let mouseX = 0;
  let mouseY = 0;
  let targetScroll = 0;
  let smoothScroll = 0;
  let initialized = false;
  let rafPending = false;

  const set = (name, value) => stage.style.setProperty(name, value);

  function update() {
    rafPending = false;
    targetScroll = getScrollDistance();
    // على اللمس منتبع السكرول مباشرة: التنعيم فوق الـ momentum scroll بيحسس إنها معلّقة
    if (!initialized || reduceMotion.matches || coarse.matches) {
      smoothScroll = targetScroll;
      initialized = true;
    } else {
      smoothScroll = lerp(smoothScroll, targetScroll, 0.14);
    }
    if (Math.abs(smoothScroll - targetScroll) < 0.08) smoothScroll = targetScroll;

    const still = reduceMotion.matches || coarse.matches;
    mouseX = still ? 0 : lerp(mouseX, targetMouseX, 0.12);
    mouseY = still ? 0 : lerp(mouseY, targetMouseY, 0.12);

    const s = (smoothScroll / scrollRange()) * STORY;
    const phone = narrow.matches;
    // 1) الافتتاح: الاسم بيطلع لفوق والنص بينزل
    const introExit = smoothstep(80, 600, s);
    // 2) التراس بينفتح نصّين والكاميرا بتطير للقلعة
    const castle = segmentInOut(s, 450, 950, 1350, 1700);
    // 3) رجعة للتراس، مغبّش، عشان الكلام والمنيو
    const terrace = segmentInOut(s, 1750, 2150, 2450, 2650);
    // 4) بطاقات أقسام المنيو بتدخل من الجنب
    const cardsEnter = Math.pow(smoothstep(2650, 3250, s), 1.55);
    const controlsEnter = smoothstep(3050, 3350, s);
    const progress = clamp(s / 2650);

    const open = Math.pow(castle.enter, 1.5) * (1 - terrace.enter);
    const castleZoom = castle.enter * (1 - terrace.enter);
    const haze = terrace.enter; // بعد ما يرجع للتراس بيضل مغبّش لآخر القصة
    const sharedY = progress * -40;
    // على الموبايل الإطار ضيق، فالنصّين لازم يبعدوا أكثر عشان تبين القلعة
    const splitVw = phone ? 85 : 46;

    // ---------- الرسم ----------
    if (W && ready() && section.getBoundingClientRect().bottom > 0) {
      const f = frameBox();
      bctx.clearRect(0, 0, back.width, back.height);
      drawLayer(bctx, imgs.sky, f, { scale: 1.02 + progress * 0.06 });

      fctx.clearRect(0, 0, front.width, front.height);
      drawLayer(fctx, imgs.hill, f, {
        tx: mouseX * -12,
        ty: mouseY * -6 + sharedY * 0.5,
        scale: 1.02 + progress * 0.04 + castleZoom * 0.55,
        ox: 0.33,
        oy: 0.22,
      });
      const splitScale = 1.02 + progress * 0.08 + open * 0.6;
      const splitY = mouseY * 10 + sharedY - open * 140;
      // على الموبايل التكبير من الشق نفسه (44% من الصورة)، عشان كل نص يطلع لبرّا مش لجوّا الشاشة
      const seam = 620 / 1408;
      // النصّين بيختفوا وهم بيبعدوا، عشان ما يضلوا حيطان على الجنبين ويعملوا مستطيل بالنص
      const splitAlpha = 1 - smoothstep(0.25, 0.9, open);
      drawLayer(fctx, imgs.left, f, {
        tx: (-open * splitVw * W) / 100 + mouseX * 22, ty: splitY, scale: splitScale, ox: phone ? seam : 0.21, oy: 0.7, alpha: splitAlpha,
      });
      drawLayer(fctx, imgs.right, f, {
        tx: (open * splitVw * W) / 100 + mouseX * 22, ty: splitY, scale: splitScale, ox: phone ? seam : 0.79, oy: 0.7, alpha: splitAlpha,
      });
      // مرحلة القلعة: ورا الكلام الخلفية بتتغبّش بالتدريج
      if (castle.active > 0.01) progressiveBlur(castle.active, phone ? 0.2 : 0.24, phone ? 0.46 : 0.52);
      // الغباش: نفس المشهد مغبّش مسبقاً، فوق الطبقات
      drawLayer(fctx, imgs.blur, f, { scale: 1.06, ox: 0.33, oy: 0.4, alpha: haze });

      // تظليل أخضر غامق: تحت للقلعة، وكامل للتراس والبطاقات
      const top = castle.active * 0.15 + haze * 0.5;
      const mid = castle.active * 0.25 + haze * 0.45;
      const bottom = castle.active * 0.82 + haze * 0.6;
      if (top + mid + bottom > 0.002) {
        const g = fctx.createLinearGradient(0, 0, 0, front.height);
        g.addColorStop(0, `rgba(16, 35, 30, ${top})`);
        g.addColorStop(0.48, `rgba(16, 35, 30, ${mid})`);
        g.addColorStop(1, `rgba(16, 35, 30, ${bottom})`);
        fctx.fillStyle = g;
        fctx.fillRect(0, 0, front.width, front.height);
      }
      if (!stage.classList.contains("is-drawn")) stage.classList.add("is-drawn");
    }

    // ---------- النصوص (CSS) ----------
    set("--title-y", `${(introExit * -210).toFixed(1)}px`);
    set("--title-scale", (1 - introExit * 0.08).toFixed(3));
    set("--title-opacity", (1 - introExit).toFixed(3));
    set("--intro-y", `${(introExit * 90).toFixed(1)}px`);
    set("--intro-opacity", (1 - introExit).toFixed(3));
    set("--panel-castle-opacity", castle.active.toFixed(3));
    set("--panel-castle-y", `${(-castle.exit * 86 + (1 - castle.enter) * 58).toFixed(1)}px`);
    set("--panel-terrace-opacity", terrace.active.toFixed(3));
    set("--panel-terrace-y", `${(-terrace.exit * 86 + (1 - terrace.enter) * 58).toFixed(1)}px`);
    set("--cards-x", `${((1 - cardsEnter) * 120).toFixed(2)}vw`);
    set("--cards-title-opacity", cardsEnter.toFixed(3));
    set("--controls-opacity", controlsEnter.toFixed(3));
    sights.classList.toggle("is-visible", cardsEnter > 0.01);
    sights.classList.toggle("is-ready", controlsEnter > 0.98);

    if (
      Math.abs(smoothScroll - targetScroll) > 0.08 ||
      Math.abs(mouseX - targetMouseX) > 0.001 ||
      Math.abs(mouseY - targetMouseY) > 0.001
    ) {
      requestTick();
    }
  }

  function requestTick() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(update);
  }

  // ---------- بطاقات أقسام المنيو (سلايدر لا نهائي) ----------
  const ICONS = {
    arabic: '<path d="M22 18c-6 0-9 5-9 12v14h18V30c0-7-3-12-9-12Z"/><path d="M13 32H8l-4-6"/><path d="M31 26c5 0 8 3 8 7s-3 7-8 7"/><path d="M19 18c0-3 1-5 3-5s3 2 3 5"/><path d="M10 48h26"/>',
    specialty: '<path d="M10 24h26v8a13 13 0 0 1-13 13 13 13 0 0 1-13-13Z"/><path d="M36 27h3a5 5 0 0 1 0 10h-4"/><path d="M8 50h32"/><path d="M18 18c-2-3 2-5 0-8M26 18c-2-3 2-5 0-8"/>',
    cold: '<path d="M13 12h22l-3 36H16Z"/><path d="M14 22h20"/><rect x="18" y="27" width="6" height="6" rx="1"/><rect x="25" y="33" width="5" height="5" rx="1"/><path d="M27 12l5-8"/>',
    tea: '<path d="M10 22h26v10a13 13 0 0 1-26 0Z"/><path d="M36 25h3a5 5 0 0 1 0 10h-4"/><path d="M23 22c-6-6-2-14 6-14 0 8-2 11-6 14Z"/><path d="M8 50h32"/>',
    breakfast: '<circle cx="24" cy="28" r="17"/><circle cx="18" cy="24" r="1.6"/><circle cx="27" cy="21" r="1.6"/><circle cx="30" cy="31" r="1.6"/><circle cx="20" cy="33" r="1.6"/><circle cx="24" cy="28" r="1.6"/>',
    sweets: '<path d="M6 34l18-16 18 16Z"/><path d="M6 34v6h36v-6"/><path d="M14 28l3 2M24 22v3M33 28l-3 2"/>',
  };

  let cards = [];
  let originalCount = 0;
  let active = 0;

  function renderCards() {
    const { t, getLang } = window.Rabad;
    const lang = getLang();
    const dir = lang === "ar" ? "rtl" : "ltr";
    const one = window.MENU.map((cat) => {
      const name = cat[lang];
      return `
        <article class="sight-card" tabindex="0" role="button" data-id="${cat.id}"
                 aria-label="${t("cardOpen")(name)}">
          <span class="sight-kicker">${t("cardCount")(cat.items.length)}</span>
          <svg class="sight-pin" viewBox="0 0 48 56" aria-hidden="true">${ICONS[cat.id] || ""}</svg>
          <h3>${name}</h3>
          <p>${lang === "ar" ? cat.noteAr : cat.noteEn}</p>
        </article>`;
    }).join("");
    originalCount = window.MENU.length;
    track.dir = dir;
    // ٣ نسخ متطابقة، ونبدأ من النسخة النص عشان اللف يكون بلا نهاية
    track.innerHTML = one + one + one;
    cards = Array.from(track.children);
    cards.forEach((card, i) => {
      card.dataset.index = i;
      card.addEventListener("click", () => window.Rabad.openCategory(card.dataset.id));
      card.addEventListener("focus", () => {
        const i = Number(card.dataset.index);
        if (i !== active) move(i - active);
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.Rabad.openCategory(card.dataset.id);
        }
      });
    });
    jump(originalCount + ((active % originalCount) + originalCount) % originalCount);
  }

  function layoutCards() {
    if (!cards.length) return;
    const w = cards[0].offsetWidth;
    const gap = parseFloat(getComputedStyle(track).columnGap || "0");
    track.style.setProperty("--shift", `${-(w + gap) * active}px`);
    cards.forEach((c, i) => {
      const inSet = i >= originalCount && i < originalCount * 2;
      // نخلي بس النسخة النص قابلة للتنقل بالكيبورد
      c.tabIndex = inSet ? 0 : -1;
      c.setAttribute("aria-hidden", String(!inSet));
    });
  }

  function move(dir) {
    active += dir;
    layoutCards();
  }

  function jump(i) {
    track.classList.add("is-jumping");
    active = i;
    layoutCards();
    requestAnimationFrame(() => requestAnimationFrame(() => track.classList.remove("is-jumping")));
  }

  function normalize() {
    if (active >= originalCount * 2) jump(active - originalCount);
    else if (active < originalCount) jump(active + originalCount);
  }

  track.addEventListener("transitionend", (e) => {
    if (e.target === track) normalize();
  });
  prevBtn.addEventListener("click", () => move(-1));
  nextBtn.addEventListener("click", () => move(1));

  // سحب البطاقات بالإصبع
  let touchX = null;
  let touchY = null;
  track.addEventListener("touchstart", (e) => {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  track.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    touchX = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    const rtl = track.dir === "rtl";
    // سحب لليسار = البطاقة الجاية بالإنجليزي، والسابقة بالعربي
    move((dx < 0) !== rtl ? 1 : -1);
  }, { passive: true });

  document.addEventListener("rabad:lang", renderCards);
  window.addEventListener("scroll", requestTick, { passive: true });
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      layoutCards();
      requestTick();
    }, 120);
  });
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      targetMouseX = e.clientX / window.innerWidth - 0.5;
      targetMouseY = e.clientY / window.innerHeight - 0.5;
      requestTick();
    },
    { passive: true }
  );
  Object.values(imgs).forEach((img) => {
    if (!img.complete) img.addEventListener("load", requestTick, { once: true });
  });

  resize();
  renderCards();
  requestTick();
})();
