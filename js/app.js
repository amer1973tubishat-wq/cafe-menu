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
    $$("[data-i18n-label]").forEach((el) => {
      el.setAttribute("aria-label", t(el.dataset.i18nLabel));
    });
    $("#langToggle").setAttribute("aria-label", t("langToggleLabel"));
    renderTabs();
    renderItems();
    document.dispatchEvent(new CustomEvent("rabad:lang", { detail: { lang } }));
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
  // الهيدر بيضل شفاف فوق القصة، وبيصير صلب لما تخلص
  const story = $(".cinema");
  const onScroll = () => {
    const end = story ? story.getBoundingClientRect().bottom - header.offsetHeight : -1;
    header.classList.toggle("is-scrolled", end <= 0);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  $("#langToggle").addEventListener("click", () => {
    const next = state.lang === "ar" ? "en" : "ar";
    saveLang(next);
    applyLang(next);
  });

  window.Rabad = {
    t,
    getLang: () => state.lang,
    openCategory(id) {
      if (id !== state.category) selectCategory(id);
      $("#menu").scrollIntoView({ behavior: motionOK() ? "smooth" : "auto" });
    },
  };

  applyLang(state.lang);


  // ---------- Motion ----------
  if (!hasGsap) return;
  gsap.registerPlugin(window.ScrollTrigger, window.Flip);

  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    // افتتاح واحد: المشهد بيطلع من العتمة والكاميرا بتستقر، وبعدها الاسم والنص.
    // حركة السكرول نفسها بـ js/cinema.js، فهون بنحرّك عناصر داخلية بس.
    const title = $(".hero-title span");
    gsap.timeline({ defaults: { ease: "power3.out" } })
      .fromTo(".dusk", { opacity: 1 }, { opacity: 0, duration: 2.2, ease: "power2.inOut" }, 0)
      .fromTo("#world", { scale: 1.14 }, { scale: 1, duration: 3, ease: "power2.out" }, 0)
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
