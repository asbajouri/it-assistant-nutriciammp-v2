# دستیار IT شرکت

## مراحل Deploy روی Render

### مرحله ۱ - آپلود روی GitHub
1. برو روی github.com و یه حساب رایگان بساز
2. یه Repository جدید بساز به اسم it-assistant
3. همه فایل‌های این پوشه رو آپلود کن

### مرحله ۲ - Deploy روی Render
1. برو روی render.com و با همون GitHub لاگین کن
2. روی New > Static Site کلیک کن
3. Repository ایجاد شده رو انتخاب کن
4. تنظیمات زیر رو وارد کن:
   - Build Command: npm install && npm run build
   - Publish Directory: dist
5. روی Create Static Site کلیک کن
6. چند دقیقه صبر کن تا Deploy بشه
7. یه آدرس مثل https://it-assistant-xxxx.onrender.com میگیری

### مرحله ۳ - اضافه کردن به Teams
1. توی Teams روی Apps کلیک کن
2. روی Manage your apps کلیک کن
3. روی Upload an app کلیک کن
4. فایل teams-manifest.zip رو آپلود کن (بعدا میسازیم)

## ساختار پروژه
- src/App.jsx - کد اصلی چت‌بات
- src/main.jsx - نقطه شروع React
- index.html - صفحه اصلی
- package.json - تنظیمات پروژه
- vite.config.js - تنظیمات Build
- render.yaml - تنظیمات Render
