// قصة السكرول: مسرح ثابت (sticky)، والسكرول جوّاه بيحرّك طبقات الصورة.
// كل طبقة div بحجم الشاشة، والحركة تكبير وإزاحة وشفافية بس (transform/opacity)،
// فالمتصفح بيحرّكها على كرت الشاشة بدون ما يعيد رسم إشي.
// الكمبيوتر: سما وتلة ونصّين تراس. الهاتف: طبقة وحدة للمشهد (نص الحمل).
// الغباش صور مغبّشة جاهزة بتظهر بالتدريج، مش فلتر blur ولا mask.
(() => {
  const section = document.querySelector(".cinema");
  if (!section) return;

  const stage = section.querySelector(".stage");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = window.matchMedia("(pointer: coarse)");
  const narrow = window.matchMedia("(max-width: 760px)");
  const haze = stage.querySelector(".haze");
  const title = stage.querySelector(".hero-title");
  const intro = stage.querySelector(".intro-copy");
  const panel = stage.querySelector(".story-panel-castle");

  const L = {};
  stage.querySelectorAll(".bg").forEach((el) => {
    L[el.dataset.layer] = el;
  });

  const IMG_RATIO = 1408 / 768;
  const STORY = 1900; // التوقيتات تحت محسوبة على 1900px، وبتتمدد على طول القسم الفعلي

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
    const origin = (ox, oy) => `${(f.x + f.w * ox).toFixed(1)}px ${(f.y + f.h * oy).toFixed(1)}px`;
    // الكاميرا بتقرّب على القلعة
    for (const k of ["hill", "blurFull", "blurLow", "scene", "sblurFull", "sblurLow"]) {
      L[k].style.transformOrigin = origin(0.33, 0.22);
    }
    L.left.style.transformOrigin = origin(0.21, 0.7);
    L.right.style.transformOrigin = origin(0.79, 0.7);
    last.clear();
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
  // طبقة شفافيتها صفر بتطلع من الرسم كلياً (visibility)، مش بس بتختفي
  function fade(el, value) {
    put(el, "opacity", value.toFixed(3));
    put(el, "visibility", value < 0.004 ? "hidden" : "visible");
  }

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
    // بعد القلعة بيضل المشهد مغبّش لآخر القصة، انتقال ناعم لقسم المنيو
    const progress = clamp(s / 1600);

    const zoom = 1.02 + progress * 0.04 + castle.enter * 0.55;
    const sharedY = progress * -40;
    // الغباش: كامل وقت الانتقال، وبس تحت لما الكاميرا توصل القلعة، ورجع كامل بعدها
    const blur = smoothstep(0, 0.25, castle.enter);
    const settle = smoothstep(0.65, 1, castle.enter) * (1 - castle.exit);

    // ---------- الطبقات ----------
    if (phone) {
      // طبقة وحدة: الكاميرا بتقرّب على القلعة، والغباش الجاهز بيظهر فوقها
      const sceneT = tf(0, sharedY * 0.5, zoom);
      put(L.scene, "transform", sceneT);
      put(L.sblurFull, "transform", sceneT);
      put(L.sblurLow, "transform", sceneT);
      fade(L.sblurFull, blur * (1 - settle));
      fade(L.sblurLow, blur * settle);
    } else {
      const open = Math.pow(castle.enter, 1.5);
      put(L.sky, "transform", `scale(${(1.02 + progress * 0.06).toFixed(4)})`);
      const hillT = tf(mouseX * -12, mouseY * -6 + sharedY * 0.5, zoom);
      put(L.hill, "transform", hillT);
      const splitScale = 1.02 + progress * 0.08 + open * 0.6;
      const splitY = mouseY * 10 + sharedY - open * 140;
      // النصّين بيختفوا وهم بيبعدوا، فما بيضل مستطيل بالنص
      const splitAlpha = 1 - smoothstep(0.25, 0.9, open);
      put(L.left, "transform", tf(-open * 0.46 * W + mouseX * 22, splitY, splitScale));
      put(L.right, "transform", tf(open * 0.46 * W + mouseX * 22, splitY, splitScale));
      fade(L.left, splitAlpha);
      fade(L.right, splitAlpha);
      put(L.blurFull, "transform", hillT);
      put(L.blurLow, "transform", hillT);
      fade(L.blurFull, blur * (1 - settle));
      fade(L.blurLow, blur * settle);
    }
    fade(haze, castle.active * 0.85 + castle.exit * 0.9);

    // ---------- النصوص ----------
    put(title, "transform", `translate3d(0, ${(introExit * -210).toFixed(1)}px, 0) scale(${(1 - introExit * 0.08).toFixed(4)})`);
    put(title, "opacity", (1 - introExit).toFixed(3));
    put(intro, "transform", `translate3d(-50%, ${(introExit * 90).toFixed(1)}px, 0)`);
    put(intro, "opacity", (1 - introExit).toFixed(3));
    put(panel, "opacity", castle.active.toFixed(3));
    put(panel, "transform", `translate3d(-50%, calc(-50% + ${(-castle.exit * 86 + (1 - castle.enter) * 58).toFixed(1)}px), 0)`);

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

  // لما القصة برّا الشاشة: ما في حساب، والطبقات بتطلع من ذاكرة كرت الشاشة، والتنفّس بيوقف
  let onScreen = true;
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    stage.classList.toggle("is-active", onScreen);
    stage.classList.toggle("is-offscreen", !onScreen);
    if (onScreen) requestTick();
  }, { rootMargin: "300px 0px" }).observe(section);

  window.addEventListener("scroll", () => {
    if (onScreen) requestTick();
  }, { passive: true });
  let resizeTimer = 0;
  let layoutPhone = narrow.matches;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const wasPhone = layoutPhone;
      layout();
      layoutPhone = narrow.matches;
      if (wasPhone !== layoutPhone) last.clear();
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
  stage.classList.add("is-active");
  layout();
  requestTick();
})();
