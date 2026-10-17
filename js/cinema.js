// قصة السكرول: مسرح ثابت (sticky)، والسكرول جوّاه بيحرّك طبقات الصورة.
// كل طبقة div بحجم الشاشة، والحركة تكبير وإزاحة وشفافية بس (transform/opacity)،
// فالمتصفح بيحرّكها على كرت الشاشة بدون ما يعيد رسم إشي: سريعة على الموبايل.
// الغباش صورة مغبّشة جاهزة بتظهر بالتدريج، مش فلتر blur.
(() => {
  const section = document.querySelector(".cinema");
  if (!section) return;

  const stage = section.querySelector(".stage");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = window.matchMedia("(pointer: coarse)");
  const narrow = window.matchMedia("(max-width: 760px)");
  const track = document.querySelector("#sightsTrack");
  const sights = document.querySelector(".sights");
  const prevBtn = document.querySelector(".sight-prev");
  const nextBtn = document.querySelector(".sight-next");
  const haze = stage.querySelector(".haze");
  const title = stage.querySelector(".hero-title");
  const intro = stage.querySelector(".intro-copy");
  const panel = stage.querySelector(".story-panel-castle");

  const L = {};
  stage.querySelectorAll(".bg").forEach((el) => {
    L[el.dataset.layer] = el;
  });

  const IMG_RATIO = 1408 / 768;
  const STORY = 2600; // التوقيتات تحت محسوبة على 2600px، وبتتمدد على طول القسم الفعلي
  const SEAM = 620 / 1408;

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

  // ---------- مقاس الطبقات ----------
  // نفس حساب object-fit: cover مع نقطة تركيز بين القلعة والتراس، فكل الطبقات بتركب على بعض
  let W = 0;
  let H = 0;
  let f = { x: 0, y: 0, w: 0, h: 0 };
  function layout() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    const fw = Math.max(W, H * IMG_RATIO);
    const fh = fw / IMG_RATIO;
    const fx = W / H < 0.8 ? 0.33 : 0.4;
    f = { x: clamp(W / 2 - fw * fx, W - fw, 0), y: clamp(H / 2 - fh * 0.4, H - fh, 0), w: fw, h: fh };
    for (const el of Object.values(L)) {
      el.style.backgroundSize = `${f.w}px ${f.h}px`;
      el.style.backgroundPosition = `${f.x}px ${f.y}px`;
    }
    const phone = narrow.matches;
    const origin = (ox, oy) => `${(f.x + f.w * ox).toFixed(1)}px ${(f.y + f.h * oy).toFixed(1)}px`;
    L.hill.style.transformOrigin = origin(0.33, 0.22);
    L.blurFull.style.transformOrigin = origin(0.33, 0.22);
    L.blurMask.style.transformOrigin = origin(0.33, 0.22);
    // على الموبايل التكبير من الشق نفسه، عشان كل نص يطلع لبرّا مش لجوّا الشاشة
    L.left.style.transformOrigin = origin(phone ? SEAM : 0.21, 0.7);
    L.right.style.transformOrigin = origin(phone ? SEAM : 0.79, 0.7);
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
  const last = new Map();

  // نكتب بس لما القيمة تتغير، عشان ما نشغّل المتصفح عالفاضي
  function put(el, prop, value) {
    const key = el;
    let m = last.get(key);
    if (!m) last.set(key, (m = {}));
    if (m[prop] === value) return;
    m[prop] = value;
    el.style[prop] = value;
  }
  const tf = (x, y, s) => `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;

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
    const introExit = smoothstep(80, 560, s);
    // 2) التراس بينفتح نصّين والكاميرا بتطير للقلعة، وبتطلع قصتها
    const castle = segmentInOut(s, 420, 900, 1300, 1600);
    // 3) بطاقات أقسام المنيو بتدخل من الجنب فوق المشهد المغبّش
    const cardsEnter = Math.pow(smoothstep(1550, 2150, s), 1.55);
    const controlsEnter = smoothstep(1900, 2250, s);
    const progress = clamp(s / 1600);

    const open = Math.pow(castle.enter, 1.5);
    const zoom = 1.02 + progress * 0.04 + castle.enter * 0.55;
    const sharedY = progress * -40;
    const splitVw = phone ? 85 : 46;

    // ---------- الطبقات ----------
    put(L.sky, "transform", `scale(${(1.02 + progress * 0.06).toFixed(4)})`);
    const hillT = tf(mouseX * -12, mouseY * -6 + sharedY * 0.5, zoom);
    put(L.hill, "transform", hillT);
    const splitScale = 1.02 + progress * 0.08 + open * 0.6;
    const splitY = mouseY * 10 + sharedY - open * 140;
    // النصّين بيختفوا وهم بيبعدوا، فما بيضل مستطيل بالنص
    const splitAlpha = (1 - smoothstep(0.25, 0.9, open)).toFixed(3);
    put(L.left, "transform", tf((-open * splitVw * W) / 100 + mouseX * 22, splitY, splitScale));
    put(L.right, "transform", tf((open * splitVw * W) / 100 + mouseX * 22, splitY, splitScale));
    put(L.left, "opacity", splitAlpha);
    put(L.right, "opacity", splitAlpha);

    // الغباش: كامل وقت الانتقال، وبس تحت لما الكاميرا توصل القلعة، ورجع كامل للبطاقات
    const blur = smoothstep(0, 0.25, castle.enter);
    const settle = smoothstep(0.65, 1, castle.enter) * (1 - castle.exit);
    put(L.blurFull, "transform", hillT);
    put(L.blurMask, "transform", hillT);
    put(L.blurFull, "opacity", (blur * (1 - settle)).toFixed(3));
    put(L.blurMask, "opacity", (blur * settle).toFixed(3));
    put(haze, "opacity", (castle.active * 0.85 + castle.exit * 0.9).toFixed(3));

    // ---------- النصوص ----------
    put(title, "transform", `translate3d(0, ${(introExit * -210).toFixed(1)}px, 0) scale(${(1 - introExit * 0.08).toFixed(4)})`);
    put(title, "opacity", (1 - introExit).toFixed(3));
    put(intro, "transform", `translate3d(-50%, ${(introExit * 90).toFixed(1)}px, 0)`);
    put(intro, "opacity", (1 - introExit).toFixed(3));
    put(panel, "opacity", castle.active.toFixed(3));
    put(panel, "transform", `translate3d(-50%, calc(-50% + ${(-castle.exit * 86 + (1 - castle.enter) * 58).toFixed(1)}px), 0)`);
    put(sights.querySelector(".sights-viewport"), "transform",
      `translate3d(${((1 - cardsEnter) * 120 * (track.dir === "rtl" ? -1 : 1)).toFixed(2)}vw, 0, 0)`);
    put(sights.querySelector(".sights-title"), "opacity", cardsEnter.toFixed(3));
    put(sights.querySelector(".sights-controls"), "opacity", controlsEnter.toFixed(3));
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
      layout();
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
  layout();
  renderCards();
  requestTick();
})();
