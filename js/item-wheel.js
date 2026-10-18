// عجلة الأصناف: نسخة JavaScript عادية من مكوّن WorksWheel، بنفس الأرقام ونفس الحساب.
//
// بالبداية بطاقات أصناف القسم بحلقة حوالين اسمه. أول سكرول أو سحب بيفتح الحلقة
// لأسطوانة عمودية: البطاقة اللي قدّام مسطّحة وكاملة، واللي فوقها وتحتها بيلفّوا
// لبعيد. كل إشي رقم واحد اسمه turn: صفر = الحلقة، 1 = الأسطوانة والصنف الأول قدّام،
// وكل رقم صحيح بعدها صنف زيادة. حلقة rAF وحدة بتكتب الـ transforms مباشرة،
// وبتوقف لما العجلة توصل مكانها عشان ما تشغّل الجوال عالفاضي.
(() => {
  const overlay = document.querySelector("#wheelOverlay");
  if (!overlay) return;

  const stage = overlay.querySelector("#wheelStage");
  const drum = overlay.querySelector("#wheelDrum");
  const labelEl = overlay.querySelector("#wheelLabel");
  const front = overlay.querySelector("#wheelFront");
  const frontName = front.querySelector(".wheel-front-name");
  const frontDesc = front.querySelector(".wheel-front-desc");
  const frontPrice = front.querySelector(".wheel-front-price");
  const indexEl = overlay.querySelector("#wheelIndex");
  const countEl = overlay.querySelector("#wheelCount");
  const closeBtn = overlay.querySelector("#wheelClose");
  const moreBtn = overlay.querySelector("#wheelMore");
  const sheet = overlay.querySelector("#itemSheet");
  const sheetPanel = sheet.querySelector("#sheetPanel");
  const sheetMedia = sheet.querySelector("#sheetMedia");
  const sheetName = sheet.querySelector("#sheetName");
  const sheetPrice = sheet.querySelector("#sheetPrice");
  const sheetTags = sheet.querySelector("#sheetTags");
  const sheetDesc = sheet.querySelector("#sheetDesc");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = window.matchMedia("(max-width: 640px)");

  /* الهندسة (نفس قيم المكوّن الأصلي). البطاقة بتنقاس على المسرح، وكل إشي ثاني على البطاقة. */
  const CARD_H = 0.38; // ارتفاع البطاقة اللي قدّام، من المسرح
  const CARD_MAX_W = 0.34; // ...بس مش أعرض من هيك (على الهاتف 0.78)
  const CARD_RATIO = 1.45; // العرض ÷ الارتفاع
  const STEP = 40; // درجات بين البطاقات على الأسطوانة
  const DRUM = 2.22; // نصف قطر الأسطوانة، بارتفاعات البطاقة
  const LENS = 2.7; // مسافة المنظور
  const RING_R = 1.14; // نصف قطر الحلقة
  const BOW = 1.82; // قوس الشريط: الجيران بيرجعوا لجنب كمان، مش بس لفوق وتحت
  const TITLE = 0.124; // اسم القسم بالحلقة
  const CULL = 1.6; // كم بطاقة على كل جنب بتنرسم

  const WHEEL_UNITS = 900;
  const DRAG_UNITS = 420;
  const SETTLE = 140;
  const EASE = 0.12;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rad = (deg) => (deg * Math.PI) / 180;
  const bowAt = (drumDeg, bow) => -bow * (1 - Math.cos(rad(drumDeg)));

  // الحالتين بسلسلة وحدة: تحويلات الحلقة بتختفي لما m يوصل للأسطوانة، وتحويلات الأسطوانة صفر وهي حلقة
  function place(ringDeg, drumDeg, ringR, drumR, bow, m) {
    return (
      `translateX(${(m * bowAt(drumDeg, bow)).toFixed(2)}px)` +
      ` rotateZ(${((1 - m) * ringDeg).toFixed(3)}deg) translateY(${(-(1 - m) * ringR).toFixed(2)}px)` +
      ` rotateX(${(m * drumDeg).toFixed(3)}deg) translateZ(${(m * drumR).toFixed(2)}px)`
    );
  }

  // ألوان البطاقات بالتناوب، كل لون مع لون نص مقروء عليه
  const SWATCHES = [
    { bg: "#1d3a33", fg: "#f2ece0", line: "#c8b48f" },
    { bg: "#c8b48f", fg: "#10231e", line: "#10231e" },
    { bg: "#a3333d", fg: "#f2ece0", line: "#f2ece0" },
    { bg: "#55602f", fg: "#f2ece0", line: "#e6dcc4" },
  ];

  let category = null;
  let items = [];
  let cards = [];
  let indexBtns = [];
  let metrics = null;
  let turn = 0;
  let target = 0;
  let active = -1;
  let frame = 0;
  let settling = 0;
  let autoOpen = 0;
  let drag = null;
  let opener = null;
  let pushed = false;
  let moved = false;
  let sheetOpen = false;
  let sheetPushed = false;
  let ignorePop = false;
  let tap = null;

  const rtl = () => document.documentElement.dir === "rtl";
  const last = () => Math.max(items.length - 1, 0);

  // ---------- المقاسات ----------
  function measure() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const phone = narrow.matches;
    const cardW = Math.min(h * CARD_H * CARD_RATIO, w * (phone ? 0.78 : CARD_MAX_W));
    const cardH = cardW / CARD_RATIO;
    // على الهاتف الحلقة لازم تساع بعرض الشاشة
    const ringR = phone ? Math.min(cardH * RING_R, w * 0.3) : cardH * RING_R;
    const count = items.length;
    // مع أصناف قليلة (٤-٦) الحلقة بتطلع ضخمة، فبنسقّف حجم البطاقة فيها
    const ringScale = count ? clamp((((2 * Math.PI * ringR) / count) * 0.82) / (cardW || 1), 0.16, 0.48) : 1;
    metrics = {
      cardW,
      cardH,
      ringR,
      ringScale,
      drumR: cardH * DRUM,
      bow: cardH * BOW,
      depth: cardH * LENS,
      title: cardH * TITLE,
    };
    stage.style.perspective = `${metrics.depth}px`;
    labelEl.style.fontSize = `${Math.max(metrics.title * 1.25, 30)}px`;
    overlay.style.setProperty("--card-w", `${cardW}px`);
    overlay.style.setProperty("--card-h", `${cardH}px`);
    cards.forEach((card) => {
      card.style.width = `${cardW}px`;
      card.style.height = `${cardH}px`;
      card.style.marginLeft = `${-cardW / 2}px`;
      card.style.marginTop = `${-cardH / 2}px`;
    });
  }

  // ---------- الرسم ----------
  function draw() {
    frame = 0;
    if (!metrics) return;
    const gap = target - turn;
    if (Math.abs(gap) < 0.0005) turn = target;
    else turn += gap * (reduceMotion.matches ? 1 : EASE);

    const m = clamp(turn, 0, 1);
    const pos = Math.max(0, turn - 1);
    const { ringR, ringScale, drumR, bow } = metrics;
    const side = rtl() ? -1 : 1; // بالعربي القوس بيلف لليمين
    const count = items.length;

    // الأسطوانة بترجع لورا عشان وجهها اللي قدّام يقعد على مستوى الشاشة
    drum.style.transform = `translateZ(${(-m * drumR).toFixed(2)}px)`;

    for (let i = 0; i < count; i++) {
      const d = i - pos;
      const card = cards[i];
      card.style.transform = place(d * (360 / count), d * STEP, ringR, drumR, bow * side, m);
      card.style.opacity = m > 0.5 && Math.abs(d) > CULL ? "0" : "1";
      card.style.zIndex = String(Math.round(100 - Math.abs(d) * 2));
      card.firstElementChild.style.transform = `scale(${lerp(ringScale, 1, m).toFixed(4)})`;
    }

    labelEl.style.opacity = String(1 - m);
    front.style.opacity = String(m);
    front.style.visibility = m < 0.05 ? "hidden" : "visible";
    countEl.style.opacity = String(m);

    const near = clamp(Math.round(pos), 0, last());
    if (near !== active) setActive(near);

    if (turn !== target) frame = requestAnimationFrame(draw);
  }

  function kick() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  // رسم فوري، مع إلغاء أي إطار مجدول عشان ما تشتغل حلقتين مع بعض
  function drawNow() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    draw();
  }

  function to(next) {
    target = clamp(next, 0, last() + 1);
    if (!moved && target > 0) {
      moved = true;
      overlay.classList.add("has-moved");
    }
    kick();
  }

  // ---------- الصنف اللي قدّام ----------
  function setActive(i) {
    active = i;
    const { t, formatPrice, getLang } = window.Rabad;
    const item = items[i];
    const ar = getLang() === "ar";
    frontName.textContent = ar ? item.ar : item.en;
    frontDesc.textContent = ar ? item.descAr : item.descEn;
    frontPrice.textContent = formatPrice(item.price);
    countEl.textContent = t("wheelCount")(i, items.length);
    stage.setAttribute("aria-activedescendant", `wheel-item-${i}`);
    cards.forEach((c, j) => c.setAttribute("aria-selected", String(j === i)));
    indexBtns.forEach((b, j) => b.classList.toggle("is-active", j === i));
  }

  // ---------- تفاصيل الصنف ----------
  let sheetItem = -1;
  function fillSheet(i) {
    sheetItem = i;
    const { formatPrice, getLang } = window.Rabad;
    const item = items[i];
    const ar = getLang() === "ar";
    const sw = SWATCHES[i % SWATCHES.length];
    sheetMedia.style.setProperty("--sw-bg", sw.bg);
    sheetMedia.style.setProperty("--sw-line", sw.line);
    sheetMedia.innerHTML = item.image
      ? `<img src="${item.image}" alt="${ar ? item.ar : item.en}" decoding="async" draggable="false">`
      : `<svg viewBox="0 0 48 56" aria-hidden="true">${window.RABAD_ICONS[category.id] || ""}</svg>`;
    sheetName.textContent = ar ? item.ar : item.en;
    sheetPrice.textContent = formatPrice(item.price);
    const tags = (ar ? item.tagsAr : item.tagsEn) || [];
    sheetTags.innerHTML = tags.map((tg) => `<li>${tg}</li>`).join("");
    sheetTags.hidden = !tags.length;
    sheetDesc.textContent = (ar ? item.longAr : item.longEn) || (ar ? item.descAr : item.descEn);
  }

  function openSheet(i) {
    if (!category || sheetOpen) return;
    fillSheet(i);
    sheetPanel.scrollTop = 0;
    sheetPanel.style.transform = "";
    sheet.hidden = false;
    sheetOpen = true;
    requestAnimationFrame(() => sheet.classList.add("is-open"));
    sheetPanel.focus({ preventScroll: true });
    try {
      history.pushState({ sheet: i }, "");
      sheetPushed = true;
    } catch (e) { /* history unavailable */ }
  }

  function closeSheet(fromPop) {
    if (!sheetOpen) return;
    sheetOpen = false;
    sheet.classList.remove("is-open");
    sheetPanel.style.transform = "";
    if (sheetPushed && !fromPop) {
      ignorePop = true;
      try { history.back(); } catch (e) { ignorePop = false; }
    }
    sheetPushed = false;
    const done = () => { if (!sheetOpen) sheet.hidden = true; };
    if (reduceMotion.matches) done();
    else setTimeout(done, 320);
    stage.focus({ preventScroll: true });
  }

  // البطاقة اللي قدّام بتنبض لحظة لما تنكبس، تأكيد إنها انفتحت
  function bump(i) {
    const face = cards[i] && cards[i].firstElementChild;
    if (!face || reduceMotion.matches) return;
    face.classList.remove("is-tapped");
    void face.offsetWidth;
    face.classList.add("is-tapped");
  }

  // ---------- البناء ----------
  function build() {
    const { formatPrice, getLang } = window.Rabad;
    const lang = getLang();
    const ar = lang === "ar";
    const icon = window.RABAD_ICONS[category.id] || "";
    labelEl.textContent = category[lang];
    drum.innerHTML = items.map((item, i) => {
      const sw = SWATCHES[i % SWATCHES.length];
      const name = ar ? item.ar : item.en;
      const art = item.image
        ? `<img class="wheel-card-img" src="${item.image}" alt="" draggable="false" loading="lazy" decoding="async">`
        : `<svg class="wheel-card-icon" viewBox="0 0 48 56" aria-hidden="true">${icon}</svg>`;
      return `
        <div class="wheel-card${item.image ? " has-image" : ""}" id="wheel-item-${i}" role="option" aria-selected="false" aria-label="${name}"
             style="--sw-bg:${sw.bg};--sw-fg:${sw.fg};--sw-line:${sw.line}">
          <span class="wheel-card-face">
            ${art}
            <span class="wheel-card-price">${formatPrice(item.price)}</span>
            <span class="wheel-card-name">${name}</span>
          </span>
        </div>`;
    }).join("");
    cards = Array.from(drum.children);

    indexEl.innerHTML = items.map((item, i) =>
      `<li><button type="button" data-i="${i}">${ar ? item.ar : item.en}</button></li>`
    ).join("");
    indexBtns = Array.from(indexEl.querySelectorAll("button"));
    active = -1;
    measure();
  }

  // ---------- الفتح والإغلاق ----------
  function open(id, from) {
    category = window.MENU.find((c) => c.id === id);
    if (!category) return;
    items = category.items;
    opener = from || null;
    moved = false;
    overlay.classList.remove("has-moved");
    overlay.hidden = false;
    build();
    turn = 0;
    target = 0;
    drawNow();
    // الفتح على مراحل، عشان ما يتجمّع كل الشغل بإطار واحد ويعلق الهاتف:
    // هلأ البطاقات، بالإطار الجاي التلاشي، وبعده قفل الصفحة اللي ورا
    requestAnimationFrame(() => {
      if (!category) return;
      overlay.classList.add("is-open");
      requestAnimationFrame(() => {
        if (!category) return;
        document.documentElement.classList.add("wheel-open");
        document.querySelectorAll("body > :not(.wheel-overlay):not(script)").forEach((el) => {
          el.inert = true;
        });
      });
    });
    stage.focus({ preventScroll: true });
    if (!pushed) {
      // بعض الصفحات المضمّنة بتمنع السجل؛ وقتها بنكتفي بزر الإغلاق و Esc
      try {
        history.pushState({ wheel: id }, "");
        pushed = true;
      } catch (e) { /* history unavailable */ }
    }
    // الحلقة بتبين لحظة، وبعدين بتنفتح أسطوانة لحالها
    clearTimeout(autoOpen);
    autoOpen = setTimeout(() => to(1), reduceMotion.matches ? 0 : narrow.matches ? 600 : 900);
  }

  function finishClose() {
    if (sheetOpen) {
      sheetOpen = false;
      sheetPushed = false;
      sheet.classList.remove("is-open");
      sheet.hidden = true;
    }
    clearTimeout(autoOpen);
    clearTimeout(settling);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    overlay.classList.remove("is-open");
    document.documentElement.classList.remove("wheel-open");
    document.querySelectorAll("body > [inert]").forEach((el) => {
      el.inert = false;
    });
    const done = () => {
      overlay.hidden = true;
      drum.innerHTML = "";
      cards = [];
    };
    if (reduceMotion.matches) done();
    else setTimeout(done, 280);
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    category = null;
  }

  function close() {
    if (!category) return;
    // زر الرجوع بالجوال بيسكّر العجلة؛ والإغلاق من الزر برجّع السجل خطوة
    if (pushed) {
      pushed = false;
      // الرجوع بيوصل متأخر؛ ما بدنا يسكّر عجلة انفتحت بعدها مباشرة
      ignorePop = true;
      try { history.back(); } catch (e) { ignorePop = false; }
    }
    finishClose();
  }

  window.addEventListener("popstate", () => {
    if (ignorePop) {
      ignorePop = false;
      return;
    }
    // زر الرجوع: بيسكّر التفاصيل أول، وبعدين العجلة
    if (sheetOpen) {
      sheetPushed = false;
      closeSheet(true);
      return;
    }
    if (category) {
      pushed = false;
      finishClose();
    }
  });

  // ---------- التحكم ----------
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    clearTimeout(autoOpen);
    to(target + e.deltaY / WHEEL_UNITS);
    clearTimeout(settling);
    settling = setTimeout(() => to(Math.round(target)), SETTLE);
  }, { passive: false });

  stage.addEventListener("pointerdown", (e) => {
    clearTimeout(autoOpen);
    drag = e.clientY;
    const card = e.target.closest(".wheel-card");
    tap = { x: e.clientX, y: e.clientY, card };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (drag === null) return;
    to(target + (drag - e.clientY) / DRAG_UNITS);
    drag = e.clientY;
  });
  const endDrag = (e) => {
    if (drag === null) return;
    drag = null;
    // كبسة (حركة أقل من 6px) مش سحب: على البطاقة اللي قدّام بتفتح التفاصيل، وعلى جارتها بتجيبها لقدّام
    const t0 = tap;
    tap = null;
    if (e && e.type === "pointerup" && t0 && t0.card && Math.hypot(e.clientX - t0.x, e.clientY - t0.y) < 6) {
      const i = cards.indexOf(t0.card);
      if (i >= 0) {
        if (turn >= 0.9 && i === active) {
          bump(i);
          openSheet(i);
        } else {
          to(i + 1);
        }
        return;
      }
    }
    // نوقف على صنف، مش بين صنفين
    if (target > 1) to(Math.round(target));
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (sheetOpen) closeSheet();
      else close();
      return;
    }
    if (sheetOpen || e.target.closest("#wheelIndex") || e.target.closest("button")) return;
    if (e.key === "Enter" && turn >= 0.9) {
      e.preventDefault();
      bump(active);
      openSheet(active);
      return;
    }
    if (e.key === "ArrowDown") to(Math.round(target) + 1);
    else if (e.key === "ArrowUp") to(Math.round(target) - 1);
    else return;
    clearTimeout(autoOpen);
    e.preventDefault();
  });

  indexEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    clearTimeout(autoOpen);
    to(Number(btn.dataset.i) + 1);
  });

  closeBtn.addEventListener("click", close);
  moreBtn.addEventListener("click", () => {
    if (active >= 0) openSheet(active);
  });
  sheet.querySelector("#sheetClose").addEventListener("click", () => closeSheet());
  // بعد كبسة لمس المتصفح بيبعث click متأخر بيوقع على الخلفية اللي طلعت تحت الإصبع،
  // فالخلفية بتسكّر بس إذا الكبسة نفسها بلّشت عليها
  const scrim = sheet.querySelector("#sheetScrim");
  let scrimDown = false;
  scrim.addEventListener("pointerdown", () => { scrimDown = true; });
  scrim.addEventListener("click", () => {
    if (scrimDown) closeSheet();
    scrimDown = false;
  });

  // سحب اللوح لتحت بيسكّره (بس لما النص مش متسكرل لتحت).
  // على اللمس منستعمل touch events: المتصفح بيلغي pointer events أول ما يبلّش يسكرل.
  let pull = null;
  const startPull = (y, target) => {
    if (sheetPanel.scrollTop > 0 || target.closest("button")) return;
    pull = { y, dy: 0 };
  };
  const movePull = (y) => {
    if (!pull) return false;
    pull.dy = y - pull.y;
    if (pull.dy <= 0) {
      if (pull.dy < -6) pull = null; // سحب لفوق = سكرول عادي للنص
      return false;
    }
    sheetPanel.classList.add("is-dragging");
    sheetPanel.style.transform = `translate3d(0, ${pull.dy}px, 0)`;
    return true;
  };
  const endPull = () => {
    if (!pull) return;
    const dy = pull.dy;
    pull = null;
    sheetPanel.classList.remove("is-dragging");
    if (dy > 90) closeSheet();
    else sheetPanel.style.transform = "";
  };
  sheetPanel.addEventListener("touchstart", (e) => startPull(e.touches[0].clientY, e.target), { passive: true });
  sheetPanel.addEventListener("touchmove", (e) => {
    if (movePull(e.touches[0].clientY) && e.cancelable) e.preventDefault();
  }, { passive: false });
  sheetPanel.addEventListener("touchend", endPull);
  sheetPanel.addEventListener("touchcancel", endPull);
  sheetPanel.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") startPull(e.clientY, e.target);
  });
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" && pull) movePull(e.clientY);
  });
  window.addEventListener("pointerup", (e) => {
    if (e.pointerType === "mouse") endPull();
  });

  new ResizeObserver(() => {
    if (!category) return;
    measure();
    kick();
  }).observe(stage);

  document.addEventListener("rabad:lang", () => {
    if (!category) return;
    const keep = active;
    build();
    if (keep >= 0) setActive(keep);
    drawNow();
    if (sheetOpen && sheetItem >= 0) fillSheet(sheetItem);
  });

  window.ItemWheel = { open, close };
})();
