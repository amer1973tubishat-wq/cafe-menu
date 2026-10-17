// المنيو كاملاً — عدّل الأصناف والأسعار من هنا فقط.
// The full menu — edit items and prices here only.
// price: بالدينار الأردني (JOD)

window.MENU = [
  {
    id: "arabic",
    ar: "قهوة عربية وتركية",
    en: "Arabic & Turkish coffee",
    noteAr: "تُحمَّص يومياً وتُطحن عند الطلب.",
    noteEn: "Roasted daily, ground to order.",
    items: [
      { ar: "قهوة سادة", en: "Sada coffee", descAr: "قهوة عربية مُرّة بالهيل، تُقدَّم بالفنجان.", descEn: "Bitter Arabic coffee with cardamom, served in a finjan.", price: 1.5 },
      { ar: "قهوة تركية", en: "Turkish coffee", descAr: "على الرمل، سادة أو وسط أو حلوة.", descEn: "Brewed on hot sand — plain, medium or sweet.", price: 1.75 },
      { ar: "تركية بالهيل المضاعف", en: "Double-cardamom Turkish", descAr: "للي بحب الهيل يطغى على الفنجان.", descEn: "For those who want the cardamom up front.", price: 2.0 },
      { ar: "دلّة للطاولة", en: "Table dallah", descAr: "دلّة قهوة سادة تكفي ٤ أشخاص مع تمر.", descEn: "A dallah of sada for four, with dates.", price: 5.0 },
    ],
  },
  {
    id: "specialty",
    ar: "قهوة مختصة",
    en: "Specialty coffee",
    noteAr: "حبوب أحادية المصدر من إثيوبيا وكولومبيا.",
    noteEn: "Single-origin beans from Ethiopia and Colombia.",
    items: [
      { ar: "إسبريسو", en: "Espresso", descAr: "شوت مزدوج، نكهة شوكولاتة وكرز.", descEn: "Double shot, notes of chocolate and cherry.", price: 2.0 },
      { ar: "كورتادو", en: "Cortado", descAr: "إسبريسو مع حليب مبخّر بنفس الكمية.", descEn: "Espresso cut with an equal measure of steamed milk.", price: 2.5 },
      { ar: "فلات وايت", en: "Flat white", descAr: "حليب ناعم وطبقة رغوة رقيقة.", descEn: "Silky milk with a thin layer of microfoam.", price: 2.75 },
      { ar: "لاتيه بالهيل", en: "Cardamom latte", descAr: "لاتيه بلمسة هيل وعسل جبلي من عجلون.", descEn: "Latte with cardamom and Ajloun mountain honey.", price: 3.25 },
      { ar: "V60", en: "V60 pour-over", descAr: "تقطير يدوي، اسأل عن حبوب اليوم.", descEn: "Hand-poured — ask about today's beans.", price: 3.5 },
    ],
  },
  {
    id: "cold",
    ar: "مشروبات باردة",
    en: "Cold drinks",
    noteAr: "للصيف على تلال عجلون.",
    noteEn: "For summer on the Ajloun hills.",
    items: [
      { ar: "آيس لاتيه", en: "Iced latte", descAr: "إسبريسو وحليب بارد على الثلج.", descEn: "Espresso and cold milk over ice.", price: 2.75 },
      { ar: "كولد برو", en: "Cold brew", descAr: "منقوع ١٨ ساعة، ناعم وقليل الحموضة.", descEn: "Steeped 18 hours — smooth and low in acidity.", price: 3.0 },
      { ar: "ليمون ونعنع", en: "Lemon & mint", descAr: "ليمون طازج مع نعنع بلدي مطحون.", descEn: "Fresh lemon blended with local mint.", price: 2.25 },
      { ar: "عصير رمان", en: "Pomegranate juice", descAr: "رمان معصور طازج حسب الموسم.", descEn: "Freshly pressed, in season.", price: 3.0 },
      { ar: "تمر هندي", en: "Tamarind", descAr: "تمر هندي بارد على الطريقة الشامية.", descEn: "Chilled tamarind, Levantine style.", price: 1.75 },
    ],
  },
  {
    id: "tea",
    ar: "شاي وأعشاب جبلية",
    en: "Tea & mountain herbs",
    noteAr: "أعشاب مقطوفة من جبال عجلون.",
    noteEn: "Herbs picked in the Ajloun mountains.",
    items: [
      { ar: "شاي بالميرمية", en: "Sage tea", descAr: "شاي أسود مع ميرمية بلدية.", descEn: "Black tea with local sage.", price: 1.25 },
      { ar: "شاي بالنعنع", en: "Mint tea", descAr: "نعنع طازج من حديقتنا.", descEn: "Fresh mint from our garden.", price: 1.25 },
      { ar: "زعتر بري", en: "Wild thyme infusion", descAr: "زعتر بري مغلي مع قطرة عسل.", descEn: "Wild thyme steeped with a drop of honey.", price: 1.5 },
      { ar: "إبريق شاي للطاولة", en: "Table teapot", descAr: "إبريق يكفي ٣–٤ أشخاص بالعشبة اللي بتختارها.", descEn: "A pot for 3–4 with the herb of your choice.", price: 4.0 },
    ],
  },
  {
    id: "breakfast",
    ar: "فطور عجلوني",
    en: "Ajloun breakfast",
    noteAr: "من الفرن مباشرة، حتى الساعة ١٢ ظهراً.",
    noteEn: "Straight from the oven, until 12 noon.",
    items: [
      { ar: "منقوشة زعتر", en: "Za'atar manakish", descAr: "زعتر عجلوني وزيت زيتون بكر.", descEn: "Ajloun za'atar and extra-virgin olive oil.", price: 1.5 },
      { ar: "منقوشة جبنة", en: "Cheese manakish", descAr: "جبنة بيضاء بلدية وحبة البركة.", descEn: "White village cheese with nigella seeds.", price: 2.0 },
      { ar: "مسخن رول", en: "Musakhan roll", descAr: "دجاج بالسماق والبصل على خبز الطابون.", descEn: "Sumac chicken and onions in taboon bread.", price: 3.5 },
      { ar: "صحن فطور الجبل", en: "Mountain breakfast plate", descAr: "لبنة، زيتون، بيض بلدي، زيت وزعتر، خبز طابون.", descEn: "Labneh, olives, village eggs, oil & za'atar, taboon bread.", price: 6.5 },
    ],
  },
  {
    id: "sweets",
    ar: "حلويات",
    en: "Sweets",
    noteAr: "تتحضّر كل صباح.",
    noteEn: "Made fresh every morning.",
    items: [
      { ar: "كنافة ناعمة", en: "Knafeh", descAr: "كنافة نابلسية بالجبنة، تُقدَّم سخنة.", descEn: "Nabulsi cheese knafeh, served warm.", price: 3.0 },
      { ar: "هريسة باللوز", en: "Almond harissa", descAr: "سميد وقطر ولوز محمّص.", descEn: "Semolina cake with syrup and toasted almonds.", price: 2.0 },
      { ar: "معمول تمر", en: "Date ma'amoul", descAr: "ثلاث حبات مع فنجان قهوة سادة.", descEn: "Three pieces with a cup of sada.", price: 2.5 },
      { ar: "تشيز كيك بالتين", en: "Fig cheesecake", descAr: "تين عجلوني مكرمل فوق تشيز كيك.", descEn: "Caramelised Ajloun figs on cheesecake.", price: 3.75 },
    ],
  },
];
