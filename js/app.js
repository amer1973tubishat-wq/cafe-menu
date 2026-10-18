(() => {
  const MENU = window.MENU;
  const I18N = window.I18N;
  const hasGsap = typeof window.gsap !== "undefined";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const gridEl = $("#catGrid");

  const state = {
    lang: readLang(),
  };

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
    $$("[data-i18n-label]").forEach((el) => {
      el.setAttribute("aria-label", t(el.dataset.i18nLabel));
    });
    $("#langToggle").setAttribute("aria-label", t("langToggleLabel"));
    renderGrid();
    document.dispatchEvent(new CustomEvent("rabad:lang", { detail: { lang } }));
    if (hasGsap && window.ScrollTrigger) window.ScrollTrigger.refresh();
  }

  // ---------- أقسام المنيو ----------
  // كل قسم بطاقة، والكبسة عليها بتفتح عجلة الأصناف (js/item-wheel.js)
  function renderGrid() {
    const ar = state.lang === "ar";
    const esc = window.RabadEsc;
    gridEl.innerHTML = MENU.map((cat) => {
      const name = esc(cat[state.lang]);
      const preview = esc(cat.items.slice(0, 3).map((item) => (ar ? item.ar : item.en)).join(ar ? "، " : ", "));
      return `
        <button class="cat-card" type="button" data-id="${esc(cat.id)}" aria-label="${t("cardOpen")(name)}">
          <svg class="cat-icon" viewBox="0 0 48 56" aria-hidden="true">${window.RABAD_ICONS[cat.icon || cat.id] || window.RABAD_ICONS.specialty}</svg>
          <span class="cat-count">${t("cardCount")(cat.items.length)}</span>
          <span class="cat-name">${name}</span>
          <span class="cat-preview">${preview}</span>
        </button>`;
    }).join("");
  }

  gridEl.addEventListener("click", (e) => {
    const card = e.target.closest(".cat-card");
    if (card) openCategory(card.dataset.id, card);
  });

  function openCategory(id, opener) {
    if (window.ItemWheel) window.ItemWheel.open(id, opener || document.activeElement);
  }

  // ---------- Header ----------
  const header = $(".site-header");
  // الهيدر بيضل شفاف فوق صورة الواجهة، وبيصير صلب بعدها
  const story = $(".hero");
  // نهاية الواجهة بتنحسب مرة وحدة (وعند تغيير الحجم)، والسكرول بيقارن رقم بس: ما في قراءة layout مع كل حركة
  let storyEnd = 0;
  let headerTick = false;
  const measureStory = () => {
    storyEnd = story ? story.offsetTop + story.offsetHeight - header.offsetHeight : 0;
  };
  const onScroll = () => {
    headerTick = false;
    const solid = window.scrollY >= storyEnd;
    if (solid !== header.classList.contains("is-scrolled")) header.classList.toggle("is-scrolled", solid);
  };
  window.addEventListener("scroll", () => {
    if (headerTick) return;
    headerTick = true;
    requestAnimationFrame(onScroll);
  }, { passive: true });
  for (const ev of ["resize", "load"]) {
    window.addEventListener(ev, () => {
      measureStory();
      onScroll();
    });
  }
  measureStory();
  onScroll();

  $("#langToggle").addEventListener("click", () => {
    const next = state.lang === "ar" ? "en" : "ar";
    saveLang(next);
    applyLang(next);
  });

  window.Rabad = {
    t,
    formatPrice,
    getLang: () => state.lang,
    openCategory,
  };

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
  gsap.registerPlugin(window.ScrollTrigger);

  const phone = window.matchMedia("(max-width: 760px)").matches;
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    const frame = $("#heroFrame");
    const hero = $(".hero");
    if (phone) hero.classList.add("is-css");

    // تقسيم العنوان لكلمات (مش لحروف، عشان الحروف العربية تضل موصولة)
    const title = $(".hero-title");
    title.innerHTML = title.textContent
      .trim()
      .split(/\s+/)
      .map((w) => `<span class="word" style="display:inline-block">${window.RabadEsc(w)}</span>`)
      .join(" ");

    // مشهد الافتتاح: الصورة بتطلع من العتمة والكاميرا بتقرّب، بعدين الأضواء بتشتعل وحدة ورا الثانية
    gsap.timeline({
      defaults: { ease: "power3.out" },
      // بعد الافتتاح: الطيور والبخار بـ CSS (.is-fx)، وعلى الهاتف كل الحركة المستمرة كمان (.is-live)
      onComplete: () => hero.classList.add("is-fx", ...(phone ? ["is-live"] : [])),
    })
      .fromTo(".hero-dusk", { opacity: 1 }, { opacity: 0, duration: 2.4, ease: "power2.inOut" }, 0)
      .fromTo(frame, { scale: 1.22 }, { scale: 1.06, duration: 3.6, ease: "power2.out" }, 0)
      .from(".sun-glow", { opacity: 0, duration: 2.4 }, 0.6)
      .from(bulbs, { opacity: 0, scale: 0.3, duration: 0.5, stagger: 0.08, ease: "back.out(2)" }, 1.5)
      .from(lamps, { opacity: 0, duration: 0.9, stagger: 0.12, ease: "power1.out" }, 1.8)
      .from(".site-header > *", { opacity: 0, y: -12, duration: 0.7, stagger: 0.08 }, 1.6)
      .from(".hero-title .word", { opacity: 0, y: 42, rotateX: -55, transformOrigin: "50% 100%", duration: 1, stagger: 0.12 }, 1.9)
      .from(".hero-lead", { opacity: 0, y: 20, duration: 0.9 }, 2.4)
      .from(".hero-cta", { opacity: 0, y: 20, duration: 0.9 }, 2.6);

    if (phone) {
      // على الهاتف: ولا حركة GSAP مستمرة ولا parallax مع السكرول، فما في JavaScript بيشتغل وإنت بتمرّر.
      // بس بنعطي كل ضو مدة وتأخير مختلفين للـ keyframes، وبعض اللمبات بس بترمش والباقي ثابت مضوي
      const rand = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
      bulbs.forEach((b, i) => {
        if (i % 2 || i > 10) return;
        b.classList.add("is-flicker");
        b.style.setProperty("--d", `${rand(2.6, 5.5)}s`);
        b.style.setProperty("--t", `-${rand(0, 5)}s`);
      });
      lamps.forEach((l) => {
        l.style.setProperty("--d", `${rand(0.9, 1.8)}s`);
        l.style.setProperty("--t", `-${rand(0, 1.8)}s`);
      });

      // برّا الشاشة: الحركات بتوقف والصورة بتطلع من ذاكرة كرت الشاشة
      new IntersectionObserver(([e]) => hero.classList.toggle("is-offscreen", !e.isIntersecting)).observe(hero);
    } else {
      // حركة مستمرة هادية بعد الافتتاح، زي لقطة فيديو ما بتخلص.
      // كلها بتنحفظ هون عشان توقف لما الواجهة تطلع برّا الشاشة: ما في حركة شغّالة وإنت بالمنيو.
      const ambient = [];
      const loop = (tw) => { ambient.push(tw); return tw; };
      loop(gsap.to(frame, { scale: 1.13, xPercent: -1.6, yPercent: -0.8, duration: 24, ease: "sine.inOut", repeat: -1, yoyo: true, delay: 3.6 }));
      loop(gsap.to(".sun-glow", { opacity: 0.55, scale: 0.92, duration: 7, ease: "sine.inOut", repeat: -1, yoyo: true, delay: 3 }));
      loop(gsap.fromTo(".mist-a", { xPercent: -8 }, { xPercent: 10, duration: 30, ease: "sine.inOut", repeat: -1, yoyo: true }));
      loop(gsap.fromTo(".mist-b", { xPercent: 10, opacity: 0.4 }, { xPercent: -10, opacity: 0.75, duration: 38, ease: "sine.inOut", repeat: -1, yoyo: true }));

      bulbs.forEach((b) => {
        loop(gsap.to(b, {
          opacity: () => gsap.utils.random(0.55, 1),
          duration: () => gsap.utils.random(0.08, 0.35),
          repeat: -1,
          yoyo: true,
          repeatRefresh: true,
          repeatDelay: () => gsap.utils.random(0.4, 3.2),
          delay: 2.6 + Math.random() * 2,
        }));
      });
      lamps.forEach((l) => {
        loop(gsap.to(l, {
          opacity: () => gsap.utils.random(0.7, 1),
          scale: () => gsap.utils.random(0.9, 1.08),
          duration: () => gsap.utils.random(0.35, 0.9),
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
          repeatRefresh: true,
          delay: 2.8 + Math.random(),
        }));
      });

      window.ScrollTrigger.create({
        trigger: ".hero",
        start: "top bottom",
        end: "bottom top",
        onToggle: (self) => {
          ambient.forEach((tw) => (self.isActive ? tw.resume() : tw.pause()));
          // برّا الشاشة: الصورة وطبقاتها بتطلع من ذاكرة كرت الشاشة كلياً
          hero.classList.toggle("is-offscreen", !self.isActive);
        },
      });

      // السكرول: الكاميرا بتنزل أبطأ من الصفحة والنص بيطلع ويختفي، فالواجهة بتذوب بالمنيو
      const heroScroll = { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.6 };
      gsap.to(".hero-media", { yPercent: 18, scale: 1.06, ease: "none", scrollTrigger: heroScroll });
      gsap.to(".hero-copy", { y: -80, opacity: 0, ease: "none", scrollTrigger: { ...heroScroll, end: "55% top" } });
    }

    $$(".section-title").forEach((el) => {
      gsap.from(el, {
        opacity: 0,
        y: 28,
        duration: 0.9,
        ease: "power3.out",
        clearProps: "opacity,transform",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    });

    gsap.from(".cat-card", {
      opacity: 0,
      y: 24,
      duration: 0.6,
      stagger: 0.07,
      ease: "power3.out",
      clearProps: "opacity,transform",
      scrollTrigger: { trigger: gridEl, start: "top 88%", once: true },
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
