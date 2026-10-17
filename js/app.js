(() => {
  const MENU = window.MENU;
  const I18N = window.I18N;
  const hasGsap = typeof window.gsap !== "undefined";
  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionOK = () => hasGsap && !reduceQuery.matches;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const tabsEl = $("#tabs");
  const listEl = $("#menuList");
  const noteEl = $("#menuNote");
  const panelEl = $("#menuPanel");

  const state = {
    lang: readLang(),
    category: MENU[0].id,
  };
  let switchTween = null;

  function readLang() {
    try {
      const saved = localStorage.getItem("rabad-lang");
      if (saved === "ar" || saved === "en") return saved;
    } catch (e) { /* storage unavailable */ }
    return "ar";
  }

  function saveLang(lang) {
    try { localStorage.setItem("rabad-lang", lang); } catch (e) { /* storage unavailable */ }
  }

  function t(key) {
    return I18N[state.lang][key];
  }

  function formatPrice(value) {
    if (state.lang === "ar") {
      const n = value.toLocaleString("ar-JO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${n} ${t("currency")}`;
    }
    return `${t("currency")} ${value.toFixed(2)}`;
  }

  // ---------- Language ----------
  function applyLang(lang) {
    state.lang = lang;
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = t("title");
    $$("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    $$("[data-i18n-alt]").forEach((el) => {
      el.alt = t(el.dataset.i18nAlt);
    });
    $("#langToggle").setAttribute("aria-label", t("langToggleLabel"));
    renderTabs();
    renderItems();
    if (hasGsap && window.ScrollTrigger) window.ScrollTrigger.refresh();
  }

  // ---------- Tabs ----------
  function renderTabs() {
    tabsEl.innerHTML = "";
    MENU.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab";
      btn.id = `tab-${cat.id}`;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-controls", "menuPanel");
      btn.dataset.id = cat.id;
      btn.textContent = cat[state.lang];
      const selected = cat.id === state.category;
      btn.setAttribute("aria-selected", String(selected));
      btn.tabIndex = selected ? 0 : -1;
      if (selected) btn.appendChild(makeIndicator());
      tabsEl.appendChild(btn);
    });
    panelEl.setAttribute("aria-labelledby", `tab-${state.category}`);
  }

  function makeIndicator() {
    const span = document.createElement("span");
    span.className = "tab-indicator";
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  function selectCategory(id, { focus = false } = {}) {
    if (id === state.category) return;
    state.category = id;

    const nextTab = $(`#tab-${id}`);
    const indicator = $(".tab-indicator", tabsEl);

    $$(".tab", tabsEl).forEach((tab) => {
      const selected = tab === nextTab;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panelEl.setAttribute("aria-labelledby", nextTab.id);
    if (focus) nextTab.focus();
    nextTab.scrollIntoView({ block: "nearest", inline: "center", behavior: motionOK() ? "smooth" : "auto" });

    // المؤشر ينزلق من التبويب القديم للجديد
    if (motionOK() && window.Flip && indicator) {
      const flipState = window.Flip.getState(indicator);
      nextTab.appendChild(indicator);
      window.Flip.from(flipState, { duration: 0.5, ease: "power3.inOut" });
    } else if (indicator) {
      nextTab.appendChild(indicator);
    } else {
      nextTab.appendChild(makeIndicator());
    }

    if (!motionOK()) {
      renderItems();
      return;
    }

    if (switchTween) switchTween.kill();
    const old = $$(".menu-item", listEl);
    switchTween = gsap.to([noteEl, ...old], {
      opacity: 0,
      y: -10,
      duration: 0.18,
      stagger: 0.015,
      ease: "power1.in",
      onComplete: () => {
        renderItems();
        animateItemsIn();
      },
    });
  }

  tabsEl.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) selectCategory(tab.dataset.id);
  });

  tabsEl.addEventListener("keydown", (e) => {
    const ids = MENU.map((c) => c.id);
    const i = ids.indexOf(state.category);
    const rtl = state.lang === "ar";
    let next = null;
    if (e.key === (rtl ? "ArrowLeft" : "ArrowRight")) next = ids[(i + 1) % ids.length];
    else if (e.key === (rtl ? "ArrowRight" : "ArrowLeft")) next = ids[(i - 1 + ids.length) % ids.length];
    else if (e.key === "Home") next = ids[0];
    else if (e.key === "End") next = ids[ids.length - 1];
    if (next) {
      e.preventDefault();
      selectCategory(next, { focus: true });
    }
  });

  // ---------- Items ----------
  function renderItems() {
    const cat = MENU.find((c) => c.id === state.category);
    const ar = state.lang === "ar";
    noteEl.textContent = ar ? cat.noteAr : cat.noteEn;
    listEl.innerHTML = cat.items
      .map(
        (item) => `
        <li class="menu-item">
          <div class="menu-item-head">
            <h3 class="menu-item-name">${ar ? item.ar : item.en}</h3>
            <span class="menu-item-leader" aria-hidden="true"></span>
            <span class="menu-item-price">${formatPrice(item.price)}</span>
          </div>
          <p class="menu-item-desc">${ar ? item.descAr : item.descEn}</p>
        </li>`
      )
      .join("");
    if (hasGsap) gsap.set(noteEl, { clearProps: "opacity,transform" });
  }

  function animateItemsIn() {
    if (!motionOK()) return;
    gsap.from(noteEl, { opacity: 0, y: 10, duration: 0.35, ease: "power2.out" });
    gsap.from($$(".menu-item", listEl), {
      opacity: 0,
      y: 18,
      scale: 0.97,
      duration: 0.45,
      stagger: { each: 0.06, grid: "auto" },
      ease: "back.out(1.4)",
      clearProps: "opacity,transform",
    });
  }

  // ---------- Header ----------
  const header = $(".site-header");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 24);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  $("#langToggle").addEventListener("click", () => {
    const next = state.lang === "ar" ? "en" : "ar";
    saveLang(next);
    applyLang(next);
  });

  applyLang(state.lang);


  // ---------- Hero scene ----------
  // مواقع الأضواء بالبكسل على الصورة الأصلية (1408×768)
  const IMG_W = 1408;
  const IMG_H = 768;
  const BULBS = [
    [620, 410], [708, 410], [746, 408], [781, 406], [816, 401], [849, 396], [878, 389],
    [910, 381], [915, 369], [922, 380], [928, 391], [935, 402], [943, 415], [950, 424],
  ];
  const LAMPS = [
    [188, 345], [485, 595], [742, 553], [820, 555], [1015, 490], [1035, 633], [1153, 597], [702, 705], [579, 752],
  ];

  const glowsEl = $("#heroGlows");
  const makeGlow = ([x, y], kind) => {
    const el = document.createElement("span");
    el.className = `glow glow-${kind}`;
    el.style.left = `${(x / IMG_W) * 100}%`;
    el.style.top = `${(y / IMG_H) * 100}%`;
    glowsEl.appendChild(el);
    return el;
  };
  const bulbs = BULBS.map((p) => makeGlow(p, "bulb"));
  const lamps = LAMPS.map((p) => makeGlow(p, "lamp"));

  // ---------- Motion ----------
  if (!hasGsap) return;
  gsap.registerPlugin(window.ScrollTrigger, window.Flip);

  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    const frame = $("#heroFrame");

    // تقسيم العنوان لكلمات (مش لحروف، عشان الحروف العربية تضل موصولة)
    const title = $(".hero-title");
    title.innerHTML = title.textContent
      .trim()
      .split(/\s+/)
      .map((w) => `<span class="word" style="display:inline-block">${w}</span>`)
      .join(" ");

    // مشهد الافتتاح: الصورة بتطلع من العتمة والكاميرا بتقرّب، بعدين الأضواء بتشتعل وحدة ورا الثانية
    const intro = gsap.timeline({ id: "intro", defaults: { ease: "power3.out" } });
    intro
      .fromTo(".hero-dusk", { opacity: 1 }, { opacity: 0, duration: 2.4, ease: "power2.inOut" }, 0)
      .fromTo(frame, { scale: 1.22 }, { scale: 1.06, duration: 3.6, ease: "power2.out" }, 0)
      .from(".sun-glow", { opacity: 0, duration: 2.4 }, 0.6)
      .from(bulbs, { opacity: 0, scale: 0.3, duration: 0.5, stagger: 0.08, ease: "back.out(2)" }, 1.5)
      .from(lamps, { opacity: 0, duration: 0.9, stagger: 0.12, ease: "power1.out" }, 1.8)
      .from(".site-header > *", { opacity: 0, y: -12, duration: 0.7, stagger: 0.08 }, 1.6)
      .from(".hero-title .word", { opacity: 0, y: 42, rotateX: -55, transformOrigin: "50% 100%", duration: 1, stagger: 0.12 }, 1.9)
      .from(".hero-lead", { opacity: 0, y: 20, duration: 0.9 }, 2.4)
      .from(".hero-cta", { opacity: 0, y: 20, duration: 0.9 }, 2.6);

    // حركة مستمرة هادية بعد الافتتاح، زي لقطة فيديو ما بتخلص
    gsap.to(frame, { scale: 1.13, xPercent: -1.6, yPercent: -0.8, duration: 24, ease: "sine.inOut", repeat: -1, yoyo: true, delay: 3.6 });
    gsap.to(".sun-glow", { opacity: 0.55, scale: 0.92, duration: 7, ease: "sine.inOut", repeat: -1, yoyo: true, delay: 3 });
    gsap.fromTo(".mist-a", { xPercent: -8 }, { xPercent: 10, duration: 30, ease: "sine.inOut", repeat: -1, yoyo: true });
    gsap.fromTo(".mist-b", { xPercent: 10, opacity: 0.4 }, { xPercent: -10, opacity: 0.75, duration: 38, ease: "sine.inOut", repeat: -1, yoyo: true });

    bulbs.forEach((b) => {
      gsap.to(b, {
        opacity: () => gsap.utils.random(0.55, 1),
        duration: () => gsap.utils.random(0.08, 0.35),
        repeat: -1,
        yoyo: true,
        repeatRefresh: true,
        repeatDelay: () => gsap.utils.random(0.4, 3.2),
        delay: 2.6 + Math.random() * 2,
      });
    });
    lamps.forEach((l) => {
      gsap.to(l, {
        opacity: () => gsap.utils.random(0.7, 1),
        scale: () => gsap.utils.random(0.9, 1.08),
        duration: () => gsap.utils.random(0.35, 0.9),
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
        repeatRefresh: true,
        delay: 2.8 + Math.random(),
      });
    });

    // بخار طالع من الفناجين
    $$(".steam path").forEach((p, i) => {
      gsap.timeline({ repeat: -1, delay: 2 + i * 0.9, repeatDelay: 0.4 })
        .fromTo(p, { y: 6, opacity: 0, scaleX: 0.7, transformOrigin: "50% 100%" }, { y: -10, opacity: 0.7, scaleX: 1, duration: 1.4, ease: "sine.out" })
        .to(p, { y: -26, opacity: 0, scaleX: 1.3, duration: 1.6, ease: "sine.in" });
    });

    // طيور بتقطع السما فوق الوادي
    const flights = [
      { y: 150, dy: -22, dur: 30, delay: 2.5 },
      { y: 176, dy: 10, dur: 27, delay: 4 },
      { y: 138, dy: -12, dur: 34, delay: 9 },
    ];
    $$(".bird").forEach((bird, i) => {
      const f = flights[i];
      gsap.fromTo(bird, { x: 660, y: f.y }, { x: 1460, y: f.y + f.dy, duration: f.dur, ease: "none", repeat: -1, delay: f.delay });
      gsap.to($("path", bird), { scaleY: 0.25, transformOrigin: "50% 50%", duration: 0.22, ease: "sine.inOut", repeat: -1, yoyo: true, delay: i * 0.1 });
    });

    // السكرول: الكاميرا بتنزل أبطأ من الصفحة والنص بيطلع ويختفي، فالواجهة بتذوب بالمنيو
    const heroScroll = { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.6 };
    gsap.to(".hero-media", { yPercent: 18, scale: 1.06, ease: "none", scrollTrigger: heroScroll });
    gsap.to(".hero-copy", { y: -80, opacity: 0, ease: "none", scrollTrigger: { ...heroScroll, end: "55% top" } });

    $$(".section-title").forEach((el) => {
      gsap.from(el, {
        opacity: 0,
        y: 28,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    });

    window.ScrollTrigger.create({
      trigger: listEl,
      start: "top 90%",
      once: true,
      onEnter: animateItemsIn,
    });

    // غصن الزيتون يرتسم مع السكرول
    const strokes = $$(".branch-stem, .branch .leaf");
    strokes.forEach((p) => {
      const l = p.getTotalLength();
      gsap.set(p, { strokeDasharray: l, strokeDashoffset: l });
    });
    gsap.timeline({
      scrollTrigger: { trigger: ".about", start: "top 80%", end: "center 55%", scrub: 0.8 },
    })
      .to(".branch-stem", { strokeDashoffset: 0, ease: "none", duration: 1 })
      .to(".branch .leaf", { strokeDashoffset: 0, ease: "none", duration: 0.6, stagger: 0.12 }, 0.2)
      .from(".branch .olive", { scale: 0, transformOrigin: "50% 50%", ease: "back.out(2)", duration: 0.3, stagger: 0.1 }, 0.8);
  });
})();
