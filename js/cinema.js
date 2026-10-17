// قصة السكرول: مسرح ثابت (sticky) بتتحرك فيه طبقات الصورة حسب مسافة السكرول.
// كل القيم بتنكتب كمتغيرات CSS على <html>، والـ CSS بيركّب منها الحركة.
(() => {
  const section = document.querySelector(".cinema");
  if (!section) return;

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const track = document.querySelector("#sightsTrack");
  const sights = document.querySelector(".sights");
  const prevBtn = document.querySelector(".sight-prev");
  const nextBtn = document.querySelector(".sight-next");

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
  const getScrollDistance = () =>
    clamp(-section.getBoundingClientRect().top, 0, section.offsetHeight - window.innerHeight);

  let targetMouseX = 0;
  let targetMouseY = 0;
  let mouseX = 0;
  let mouseY = 0;
  let targetScroll = 0;
  let smoothScroll = 0;
  let initialized = false;
  let rafPending = false;

  const set = (name, value) => root.style.setProperty(name, value);

  function update() {
    rafPending = false;
    targetScroll = getScrollDistance();
    if (!initialized || reduceMotion.matches) {
      smoothScroll = targetScroll;
      initialized = true;
    } else {
      smoothScroll = lerp(smoothScroll, targetScroll, 0.14);
    }
    if (Math.abs(smoothScroll - targetScroll) < 0.08) smoothScroll = targetScroll;

    const still = reduceMotion.matches;
    mouseX = still ? 0 : lerp(mouseX, targetMouseX, 0.12);
    mouseY = still ? 0 : lerp(mouseY, targetMouseY, 0.12);

    const s = smoothScroll;
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

    set("--mx", mouseX.toFixed(4));
    set("--my", mouseY.toFixed(4));

    set("--sky-scale", (1.02 + progress * 0.06).toFixed(4));
    set("--sky-blur", `${(haze * 12).toFixed(2)}px`);

    set("--hill-x", `${(mouseX * -12).toFixed(2)}px`);
    set("--hill-y", `${(mouseY * -6 + sharedY * 0.5).toFixed(2)}px`);
    set("--hill-scale", (1.02 + progress * 0.04 + castleZoom * 0.55).toFixed(4));
    set("--hill-blur", `${(haze * 10).toFixed(2)}px`);
    set("--hill-brightness", (1 - castle.active * 0.06 - haze * 0.28).toFixed(4));
    set("--hill-saturation", (1 + castle.active * 0.12).toFixed(4));

    set("--split-left-x", `calc(${(-open * 46).toFixed(3)}vw + ${(mouseX * 22).toFixed(2)}px)`);
    set("--split-right-x", `calc(${(open * 46).toFixed(3)}vw + ${(mouseX * 22).toFixed(2)}px)`);
    set("--split-y", `${(mouseY * 10 + sharedY - open * 140).toFixed(2)}px`);
    set("--split-scale", (1.02 + progress * 0.08 + open * 0.6).toFixed(4));
    set("--split-blur", `${(haze * 10).toFixed(2)}px`);
    set("--split-brightness", (1 - haze * 0.28).toFixed(4));

    set("--title-y", `${(introExit * -210).toFixed(2)}px`);
    set("--title-scale", (1 - introExit * 0.08).toFixed(4));
    set("--title-opacity", (1 - introExit).toFixed(4));

    set("--intro-y", `${(introExit * 90).toFixed(2)}px`);
    set("--intro-opacity", (1 - introExit).toFixed(4));

    set("--shade-top", (castle.active * 0.15 + haze * 0.5).toFixed(4));
    set("--shade-mid", (castle.active * 0.25 + haze * 0.42).toFixed(4));
    set("--shade-bottom", (castle.active * 0.82 + haze * 0.6).toFixed(4));

    set("--panel-castle-opacity", castle.active.toFixed(4));
    set("--panel-castle-y", `${(-castle.exit * 86 + (1 - castle.enter) * 58).toFixed(2)}px`);
    set("--panel-terrace-opacity", terrace.active.toFixed(4));
    set("--panel-terrace-y", `${(-terrace.exit * 86 + (1 - terrace.enter) * 58).toFixed(2)}px`);

    set("--cards-x", `${((1 - cardsEnter) * 120).toFixed(3)}vw`);
    set("--cards-title-opacity", cardsEnter.toFixed(4));
    set("--controls-opacity", controlsEnter.toFixed(4));
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

  document.addEventListener("rabad:lang", renderCards);
  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", () => {
    layoutCards();
    requestTick();
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

  renderCards();
  requestTick();
})();
