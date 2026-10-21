# النسخة المستقلة (Cloudflare Workers)

موقع الكافيه ولوحة التحكم على Cloudflare لحالهم، بدون أي خدمة ثانية:

| الرابط | شو فيه |
|---|---|
| `/` | الموقع للزبائن |
| `/admin/` | لوحة التحكم، بكلمة سر |

- **المحتوى والصور** بقاعدة D1 (جدول `docs`). الصور بتنحفظ مقصوصة على مقاس مكانها من محرّر الصور باللوحة.
- **«انشر على الموقع»** بيحوّل المحفوظ لنسخة الزبائن (`published/site`)، والموقع بيقرأها من `/content-data.js` وقت الفتح. ما في بناء ولا انتظار.
- **الأمان:** الكتابة بس بجلسة بعد كلمة السر (كوكي HttpOnly و SameSite=Strict لأسبوع). كلمة السر بصمة PBKDF2 بـ `secure/auth`، وبعد ٨ محاولات غلط من نفس الجهاز بيوقف الدخول ربع ساعة. تغيير كلمة السر من تبويب «الأمان» بيطلّع كل الأجهزة الثانية.

## الملفات

| الملف | شو فيه |
|---|---|
| `worker.js` | السيرفر: الموقع، الصور، المحتوى، والـ API |
| `admin.html`، `admin.js` | اللوحة (نفس لوحة `admin/`، بس بتحكي مع `/api`) |
| `build.js` | بيبني `dist/site/` (الموقع واللوحة بصفحة وحدة لكل منهم) |
| `wrangler.jsonc` | إعداد Cloudflare: اسم الـ Worker وقاعدة D1 |

## النشر على Cloudflare (مرة وحدة)

**Workers & Pages ← Create ← Continue with GitHub** واختار المستودع، وبعدين:

- **Project name:** نفس `name` بـ `wrangler.jsonc` (`cafe-demo`)
- **Build command:** `node standalone/build.js`
- **Deploy command:** `npx wrangler deploy --config standalone/wrangler.jsonc`
- **Preview command:** `npx wrangler versions upload --config standalone/wrangler.jsonc`
- **Settings ← Build ← Production branch:** الفرع اللي فيه هاي الملفات
- **Domains:** شغّل رابط `workers.dev`، أو ضيف دومين الكافيه

**كلمة السر الأولى:** يا إما بصمة جاهزة بـ `secure/auth` بالقاعدة، أو سر اسمه `ADMIN_PASSWORD` من **Settings ← Variables and secrets**. بعد أول دخول غيّرها من تبويب «الأمان».

## لكافيه جديد

1. قاعدة D1 جديدة، وحط الـ id تبعها بـ `wrangler.jsonc`، وغيّر `name`.
2. غيّر النصوص الافتراضية (`js/i18n.js`) والمنيو الافتراضي (`js/menu-data.js`) وصورة الواجهة (`assets/hero.*`)، أو عبّيها كلها من اللوحة.
3. انشر مثل فوق.

## تجربة محلية

```bash
node standalone/build.js
echo 'ADMIN_PASSWORD=test-pass-123' > standalone/.dev.vars
cd standalone && npx wrangler dev --local
```
