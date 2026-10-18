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
    gridEl.innerHTML = MENU.map((cat) => {
      const name = cat[state.lang];
      const preview = cat.items.slice(0, 3).map((item) => (ar ? item.ar : item.en)).join(ar ? "، " : ", ");
      return `
        <button class="cat-card" type="button" data-id="${cat.id}" aria-label="${t("cardOpen")(name)}">
          <svg class="cat-icon" viewBox="0 0 48 56" aria-hidden="true">${window.RABAD_ICONS[cat.id] || ""}</svg>
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
  // الهيدر بيضل شفاف فوق القصة، وبيصير صلب لما تخلص
  const story = $(".cinema");
  // نهاية القصة بتنحسب مرة وحدة (وعند تغيير الحجم)، والسكرول بيقارن رقم بس: ما في قراءة layout مع كل حركة
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


  // ---------- Motion ----------
  if (!hasGsap) return;
  gsap.registerPlugin(window.ScrollTrigger);

  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    // افتتاح واحد: المشهد بيطلع من العتمة والكاميرا بتستقر، وبعدها الاسم والنص.
    // حركة السكرول نفسها بـ js/cinema.js، فهون بنحرّك عناصر داخلية بس.
    const title = $(".hero-title span");
    gsap.timeline({ defaults: { ease: "power3.out" } })
      .fromTo(".dusk", { opacity: 1 }, { opacity: 0, duration: 2.2, ease: "power2.inOut" }, 0)
      // على الهاتف بدون تكبير المشهد كله: التلاشي لحاله كفاية وأخف
      .fromTo("#world", { scale: window.matchMedia("(max-width: 760px)").matches ? 1 : 1.14 }, { scale: 1, duration: 3, ease: "power2.out", clearProps: "transform" }, 0)
      .from(title, { opacity: 0, yPercent: 40, duration: 1.4 }, 0.7)
      .from(".site-header > *", { opacity: 0, y: -12, duration: 0.7, stagger: 0.08 }, 1.2)
      .from(".intro-copy > *", { opacity: 0, y: 24, duration: 0.9, stagger: 0.15 }, 1.4);

    $$(".section-title").forEach((el) => {
      if (el.closest(".cinema")) return;
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
