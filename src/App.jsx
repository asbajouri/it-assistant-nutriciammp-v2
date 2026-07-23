import { useState, useRef, useEffect } from "react";

const API_URLS = [
  "https://asbajouri-it-assistant-api.hf.space",
  "https://it-assistant-api.onrender.com",
];

// Cache برای custom_qa
let _qaCache = null;
let _qaCacheTime = 0;

async function fetchWithFallback(path, options) {
  for (const base of API_URLS) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${base}${path}`, { ...options, signal: controller.signal });
      clearTimeout(t);
      if (res.ok) return res;
    } catch (e) {
      continue;
    }
  }
  throw new Error("هر دو سرور در دسترس نیستند");
}
// === آب و هوا — تشخیص سوال و استخراج نام شهر ===
const IRAN_CITIES = ["تهران", "مشهد", "شاندیز", "اصفهان", "شیراز", "تبریز", "اهواز", "کرج", "قم", "کرمان", "یزد", "رشت", "همدان", "ارومیه", "زاهدان", "ساری", "بندرعباس", "کرمانشاه", "اراک", "زنجان", "قزوین", "گرگان", "سنندج", "خرم‌آباد", "خرم آباد", "یاسوج", "بجنورد", "بیرجند", "ایلام", "بوشهر", "دماوند", "توس"];

const isWeatherQuery = (text) => /هوا|آب.?و.?هوا|دما|رطوبت|weather|temperature/i.test(text);

const extractCity = (text) => {
  for (const c of IRAN_CITIES) {
    if (text.includes(c)) return c;
  }
  const match = text.match(/(?:هوای|دمای|آب.?و.?هوای|weather (?:in|of)|temperature (?:in|of))\s+([^\s؟?.,!،]+(?:\s+[^\s؟?.,!،]+)?)/i);
  return match ? match[1].trim() : null;
};

const WEATHER_ICONS = { "01d": "☀️", "01n": "🌙", "02d": "🌤️", "02n": "☁️", "03d": "☁️", "03n": "☁️", "04d": "☁️", "04n": "☁️", "09d": "🌧️", "09n": "🌧️", "10d": "🌦️", "10n": "🌧️", "11d": "⛈️", "11n": "⛈️", "13d": "❄️", "13n": "❄️", "50d": "🌫️", "50n": "🌫️" };

const formatWeatherReply = (data) => {
  const emoji = WEATHER_ICONS[data.icon] || "🌡️";
  return `${emoji} آب و هوای ${data.city}:\n\n🌡️ دما: ${data.temp}°C (احساس واقعی: ${data.feels_like}°C)\n☁️ وضعیت: ${data.description}\n💧 رطوبت: ${data.humidity}%\n💨 سرعت باد: ${data.wind_kmh} km/h`;
};

// ADMIN_PASSWORD moved to backend for security
const SUPABASE_URL = "https://lphczmltctrqmkxktdzo.supabase.co";
const SUPABASE_KEY = "sb_publishable_4zAcw2YmjJkFnpgZI-ZzLQ_EXznYJs_";

const sbHeaders = {
  "Content-Type": "application/json",
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Prefer": "return=representation"
};

const sbFetch = async (path, options = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...sbHeaders,
      ...(options.headers || {}),
      // برای DELETE باید Prefer header باشه
      ...(options.method === "DELETE" ? { "Prefer": "return=representation" } : {})
    }
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase error: ${res.status} — ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

const BASE_KNOWLEDGE = `تو دستیار هوش مصنوعی واحد IT شرکت Nutricia-MMP هستی که برای پشتیبانی کارکنان طراحی شده‌ای. به تمام سوالات مرتبط با IT، نرم‌افزار، سخت‌افزار، شبکه، برنامه‌نویسی و فناوری جواب بده — حتی اگه نرم‌افزار خاص شرکت نباشه.

قانون ۱ — زبان: به زبان سوال جواب بده. فارسی→فارسی، انگلیسی→انگلیسی. هیچ کاراکتر چینی، ژاپنی، کره‌ای، هندی یا ویتنامی استفاده نکن.

قانون ۲ — حوزه تخصصی: حوزه تو بسیار گسترده‌ست — هر چیزی مرتبط با فناوری، نرم‌افزار، سخت‌افزار، شبکه، هوش مصنوعی (AI، LLM، Claude، ChatGPT، Gemini، Groq، MCP، API هوش مصنوعی، مدل‌های زبانی، prompt، agent)، برنامه‌نویسی، سیستم‌های سازمانی (راهکاران، ERP، CRM)، ابزارهای کاری و دیجیتال رو جواب بده. هوش مصنوعی و ابزارهای AI بخش مهمی از IT هستن و باید کامل توضیح بدی. فقط اگه سوال صددرصد غیرفناوری بود (سنجاق قفلی، آشپزی، پزشکی، ورزش)، مودبانه بگو این موضوع در حوزه IT نیست.

قانون ۳ — پیوستگی مکالمه: همیشه تاریخچه مکالمه رو در نظر بگیر. اگر پیام کاربر کوتاه یا مبهم بود (مثل بله، نه، آره، نه، yes، no، ok، ممنون، باشه، وصلم)، معنی‌اش رو از پیام‌های قبلی بفهم و ادامه منطقی مکالمه رو بده. هرگز پیام کوتاه رو بدون توجه به context قبلی جواب نده.

قانون ۴ — احوال‌پرسی: اگر صرفاً احوال‌پرسی یا تشکر بود، مودبانه جواب بده و اعلام آمادگی برای سوالات IT کن.

قانون ۵ — آب و هوا: سیستم به‌صورت خودکار سوالات آب و هوای شهرهای مختلف رو با داده واقعی از OpenWeatherMap جواب می‌ده (این بخش قبل از رسیدن به تو انجام می‌شه). اگه پیامی به دستت رسید که درباره آب و هواست ولی نتونستی داده واقعی بهش بدی، از کاربر بخواه اسم شهر رو واضح‌تر یا با نام لاتین بنویسه.

دامین شرکت danonemulti.net است. تمام کاربران عضو این دامین هستند.
جواب‌هایت باید واضح، گام به گام و عملی باشند.

=== تغییر پسورد در دامین danonemulti.net ===
- روش اول (داخل ویندوز): Ctrl+Alt+Delete > Change a password
- روش دوم: Settings > Accounts > Sign-in options > Password > Change
- پسورد دامین باید حداقل 8 کاراکتر، شامل حروف بزرگ، کوچک و عدد باشد
- پسورد هر 90 روز یک بار منقضی می‌شود
- اگر پسورد فراموش شده: با IT Support تماس بگیرید تا ادمین دامین ریست کند
- بعد از ریست، اولین لاگین باید پسورد تغییر کند

=== لاگین به دامین danonemulti.net ===
- فرمت یوزرنیم: firstname.lastname@danonemulti.net
- اگر اکانت قفل شده: با IT Support تماس بگیرید
- حداکثر 5 بار تلاش اشتباه = قفل شدن اکانت
- VPN: برای دسترسی از خارج از شبکه شرکت به VPN نیاز است

=== اکتیو کردن ویندوز با KMS داخلی شرکت ===
سرور KMS شرکت: kms.danonemulti.net
دستورات را در CMD به عنوان Administrator اجرا کنید:
slmgr /skms kms.danonemulti.net
slmgr /ato
برای بررسی وضعیت لایسنس: slmgr /dli

=== اکتیو کردن Office با KMS داخلی شرکت ===
Office 2010: cd "C:\\Program Files\\Microsoft Office\\Office14"
Office 2013: cd "C:\\Program Files\\Microsoft Office\\Office15"
Office 2016 و 2019: cd "C:\\Program Files\\Microsoft Office\\Office16"
بعد از رفتن به پوشه:
cscript ospp.vbs /sethst:kms.danonemulti.net
cscript ospp.vbs /act
نکته مهم: CMD را حتماً با Run as Administrator اجرا کنید

=== ویندوز 10 و 11 ===
- Task Manager: Ctrl+Shift+Esc
- آپدیت ویندوز: Settings > Windows Update
- مشکل اینترنت: ipconfig /release و ipconfig /renew در CMD
- اضافه کردن پرینتر: Settings > Bluetooth & devices > Printers & scanners
- Remote Desktop: Settings > System > Remote Desktop > Enable

=== Microsoft Office - Excel ===
- فریز کردن ردیف/ستون: View > Freeze Panes
- VLOOKUP: =VLOOKUP(مقدار, محدوده, شماره_ستون, FALSE)
- Pivot Table: Insert > PivotTable
- فیلتر کردن: Data > Filter
- Conditional Formatting: Home > Conditional Formatting

=== Microsoft Office - Word ===
- فهرست خودکار: References > Table of Contents
- Track Changes: Review > Track Changes
- شماره صفحه: Insert > Page Number
- پیدا کردن و جایگزینی: Ctrl+H

=== Microsoft Outlook ===
- تنظیم Out of Office: File > Automatic Replies
- Signature: File > Options > Mail > Signatures
- بازیابی ایمیل حذف شده: Deleted Items > Recover Deleted Items

=== Microsoft Teams ===
- تغییر Background: ... > Apply Background Effects
- ضبط جلسه: ... > Start Recording
- اشتراک صفحه: Share

=== مشکلات رایج شبکه ===
- IP نگرفتن: ipconfig /release > ipconfig /flushdns > ipconfig /renew
- DNS مشکل: تغییر DNS به 8.8.8.8
- Ping: ping 8.8.8.8 در CMD

=== درخواست‌های IT ===
برای ثبت درخواست IT به سیستم تیکتینگ شرکت به آدرس servicenow.danonemulti.net مراجعه کنید.
با اکانت دامین danonemulti.net لاگین کنید.
اطلاعات لازم: نام، شماره پرسنلی، توضیح مشکل و اولویت.
زمان پاسخگویی: مشکلات عادی 24-48 ساعت، اورژانسی همان روز.

همیشه مودب، صبور و حرفه‌ای باش.

=== ابزار اکتیواسیون KMS ===
اگر کاربر گفت ویندوز یا آفیسش اکتیو نیست یا سوالی درباره اکتیواسیون داشت:

قدم اول: بپرس "آیا الان به شبکه داخلی شرکت (LAN یا VPN) وصل هستید؟"

اگر جواب بله بود، دقیقاً این متن رو بده:
✅ عالی! چون به شبکه داخلی شرکت وصل هستید، از ابزار KMS داخلی استفاده کنید.

📥 لینک دانلود: https://lphczmltctrqmkxktdzo.supabase.co/storage/v1/object/public/KMS%20Activator/Danone_Activation_Agent%20.cmd

راهنمای اجرا:
1. فایل را دانلود کنید
2. روی فایل کلیک راست کنید
3. گزینه Run as Administrator را انتخاب کنید
4. منتظر بمانید تا عملیات تکمیل شود

اگر جواب خیر بود، دقیقاً این متن رو بده:
⚠️ نگران نباشید! ابزار مخصوص اینترنت عمومی هم داریم.

📥 لینک دانلود: https://lphczmltctrqmkxktdzo.supabase.co/storage/v1/object/public/Active%20External/Activator_AIO.cmd

راهنمای اجرا:
1. فایل را دانلود کنید
2. روی فایل کلیک راست کنید
3. گزینه Run as Administrator را انتخاب کنید
4. منتظر بمانید تا عملیات تکمیل شود`;

function AdminPanel({ onClose, onDataChanged }) {
  const [tab, setTab] = useState("buttons");
  const [buttons, setButtons] = useState([]);
  const [qaList, setQaList] = useState([]);
  const [btnLabel, setBtnLabel] = useState("");
  const [btnQ, setBtnQ] = useState("");
  const [btnEditId, setBtnEditId] = useState(null);
  const [qaQ, setQaQ] = useState("");
  const [qaA, setQaA] = useState("");
  const [qaEditId, setQaEditId] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  useEffect(() => {
    loadButtons();
    loadQA();
  }, []);

  const loadButtons = async () => {
    try {
      const data = await sbFetch("buttons?order=sort_order");
      setButtons(data);
    } catch { showMsg("⚠️ خطا در بارگذاری دکمه‌ها"); }
  };

  const loadQA = async () => {
    try {
      const data = await sbFetch("custom_qa?order=id");
      setQaList(data);
    } catch { showMsg("⚠️ خطا در بارگذاری سوال‌ها"); }
  };

  const saveBtn = async () => {
    if (!btnLabel.trim() || !btnQ.trim()) { showMsg("⚠️ لیبل و سوال را پر کنید"); return; }
    setLoading(true);
    try {
      if (btnEditId !== null) {
        await sbFetch(`buttons?id=eq.${btnEditId}`, {
          method: "PATCH",
          body: JSON.stringify({ label: btnLabel, question: btnQ })
        });
        setBtnEditId(null);
      } else {
        await sbFetch("buttons", {
          method: "POST",
          body: JSON.stringify({ label: btnLabel, question: btnQ, sort_order: buttons.length + 1 })
        });
      }
      setBtnLabel(""); setBtnQ("");
      await loadButtons();
      onDataChanged();
      showMsg("✅ ذخیره شد");
    } catch { showMsg("⚠️ خطا در ذخیره"); }
    setLoading(false);
  };

  const deleteBtn = async (id) => {
    try {
      await sbFetch(`buttons?id=eq.${id}`, { method: "DELETE" });
      await loadButtons();
      onDataChanged();
      showMsg("✅ حذف شد");
    } catch { showMsg("⚠️ خطا در حذف"); }
  };

  const moveBtn = async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= buttons.length) return;
    const a = buttons[index], b = buttons[newIndex];
    try {
      await sbFetch(`buttons?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: b.sort_order }) });
      await sbFetch(`buttons?id=eq.${b.id}`, { method: "PATCH", body: JSON.stringify({ sort_order: a.sort_order }) });
      await loadButtons();
      onDataChanged();
    } catch { showMsg("⚠️ خطا در تغییر ترتیب"); }
  };

  const saveQA = async () => {
    if (!qaQ.trim() || !qaA.trim()) { showMsg("⚠️ سوال و جواب را پر کنید"); return; }
    setLoading(true);
    try {
      if (qaEditId !== null) {
        await sbFetch(`custom_qa?id=eq.${qaEditId}`, {
          method: "PATCH",
          body: JSON.stringify({ question: qaQ, answer: qaA })
        });
        setQaEditId(null);
      } else {
        await sbFetch("custom_qa", {
          method: "POST",
          body: JSON.stringify({ question: qaQ, answer: qaA })
        });
      }
      setQaQ(""); setQaA("");
      await loadQA();
      showMsg("✅ ذخیره شد");
    } catch { showMsg("⚠️ خطا در ذخیره"); }
    setLoading(false);
  };

  const deleteQA = async (id) => {
    try {
      await sbFetch(`custom_qa?id=eq.${id}`, { method: "DELETE" });
      await loadQA();
      showMsg("✅ حذف شد");
    } catch { showMsg("⚠️ خطا در حذف"); }
  };

  // ── اسناد آموزشی ──
  const [docs, setDocs] = useState([]);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docCategory, setDocCategory] = useState("general");
  const [docEditId, setDocEditId] = useState(null);

  useEffect(() => { loadDocs(); }, []);

  const loadDocs = async () => {
    try {
      const data = await sbFetch("knowledge_docs?order=created_at.desc");
      setDocs(data);
    } catch { showMsg("⚠️ خطا در بارگذاری اسناد"); }
  };

  const saveDoc = async () => {
    if (!docTitle.trim() || !docContent.trim()) { showMsg("⚠️ عنوان و محتوا را پر کنید"); return; }
    setLoading(true);
    try {
      if (docEditId !== null) {
        await sbFetch(`knowledge_docs?id=eq.${docEditId}`, {
          method: "PATCH",
          body: JSON.stringify({ title: docTitle, content: docContent, category: docCategory })
        });
        setDocEditId(null);
      } else {
        await sbFetch("knowledge_docs", {
          method: "POST",
          body: JSON.stringify({ title: docTitle, content: docContent, category: docCategory })
        });
      }
      setDocTitle(""); setDocContent(""); setDocCategory("general");
      await loadDocs();
      showMsg("✅ سند ذخیره شد");
    } catch { showMsg("⚠️ خطا در ذخیره"); }
    setLoading(false);
  };

  const deleteDoc = async (id) => {
    if (!window.confirm("این سند حذف شود؟")) return;
    try {
      await sbFetch(`knowledge_docs?id=eq.${id}`, { method: "DELETE" });
      setDocs(prev => prev.filter(d => d.id !== id));
      showMsg("✅ سند حذف شد");
    } catch (err) {
      console.error("Delete error:", err);
      showMsg("⚠️ خطا در حذف: " + err.message);
    }
  };

  // تشخیص و مسطح‌سازی جدول‌های چندبلاکی مثل لیست تلفن داخلی (اسم/داخلی که چند بار پهلوی هم تکرار شده)
  // خروجی: آرایه‌ای از خط‌های "اسم — داخلی: شماره — ..." یا null اگه فرمت دایرکتوری تشخیص داده نشد
  const parseDirectoryLikeSheet = (rows) => {
    const isExtCell = (v) => {
      if (typeof v === "number") return true;
      if (typeof v === "string") {
        const t = v.trim();
        return /^\d{1,6}(\s*(و|,)\s*\d{1,6})*$/.test(t);
      }
      return false;
    };

    // ستون‌هایی که مقدار شماره‌مانند دارن رو پیدا کن، و فاصله بین ستون‌های عددی متوالی رو داخل هر ردیف حساب کن
    // (نه در کل شیت — چون یکی دو ردیف نامنظم نباید الگوی غالب رو خراب کنه)
    const gapCounts = {};
    rows.forEach((row) => {
      const numIdx = [];
      row.forEach((cell, idx) => { if (isExtCell(cell) && String(cell).trim() !== "") numIdx.push(idx); });
      for (let i = 1; i < numIdx.length; i++) {
        const gap = numIdx[i] - numIdx[i - 1];
        if (gap > 0) gapCounts[gap] = (gapCounts[gap] || 0) + 1;
      }
    });
    const sortedGaps = Object.entries(gapCounts).sort((a, b) => b[1] - a[1]);
    if (!sortedGaps.length) return null;
    const blockWidth = Number(sortedGaps[0][0]);
    if (blockWidth < 2) return null;

    const entries = [];
    rows.forEach((row) => {
      for (let start = 0; start + 1 < row.length; start += blockWidth) {
        const name = row[start];
        const ext = row[start + 1];
        if (typeof name === "string" && name.trim() && isExtCell(ext) && String(ext).trim() !== "") {
          const extras = row.slice(start + 2, start + blockWidth)
            .map((c) => (c === undefined || c === null ? "" : String(c).trim()))
            .filter(Boolean);
          entries.push(`${name.trim()} — داخلی: ${String(ext).trim()}${extras.length ? " — " + extras.join(" — ") : ""}`);
        }
      }
    });

    // اگه تعداد ردیف‌های معتبر خیلی کم بود، این احتمالاً یه لیست تلفن نیست — بذار fallback عادی اجرا بشه
    if (entries.length < Math.max(3, rows.length * 0.3)) return null;
    return entries;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    // عنوان خودکار از اسم فایل
    if (!docTitle) setDocTitle(file.name.replace(/\.[^/.]+$/, ""));
    if (ext === "pdf") {
      showMsg("⏳ در حال خواندن PDF...");
      try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        const pdfjsLib = window.pdfjsLib;
        if (pdfjsLib) {
          const pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;
          let fullText = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map(item => item.str).join(" ") + "\n";
          }
          setDocContent(fullText);
          showMsg("✅ PDF خوانده شد");
        } else {
          showMsg("⚠️ کتابخانه PDF هنوز لود نشده — چند ثانیه صبر کن و دوباره امتحان کن");
        }
      } catch {
        showMsg("⚠️ خطا در خواندن PDF");
      }
    } else if (ext === "docx") {
      showMsg("⏳ در حال خواندن Word...");
      try {
        const arrayBuffer = await file.arrayBuffer();
        const mammoth = window.mammoth;
        if (mammoth) {
          const result = await mammoth.extractRawText({ arrayBuffer });
          setDocContent(result.value);
          showMsg("✅ فایل Word خوانده شد");
        } else {
          showMsg("⚠️ کتابخانه Word هنوز لود نشده — چند ثانیه صبر کن و دوباره امتحان کن");
        }
      } catch {
        showMsg("⚠️ خطا در خواندن فایل Word");
      }
    } else if (ext === "doc") {
      showMsg("⚠️ فرمت قدیمی .doc پشتیبانی نمیشه — فایل رو با Word به .docx تبدیل کن");
    } else if (ext === "xlsx" || ext === "xls") {
      showMsg("⏳ در حال خواندن Excel...");
      try {
        const arrayBuffer = await file.arrayBuffer();
        const XLSX = window.XLSX;
        if (XLSX) {
          const wb = XLSX.read(arrayBuffer, { type: "array" });
          let fullText = "";
          wb.SheetNames.forEach(name => {
            const sheet = wb.Sheets[name];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
            const directoryEntries = parseDirectoryLikeSheet(rows);
            if (directoryEntries) {
              fullText += `=== شیت: ${name} (لیست تلفن/داخلی) ===\n${directoryEntries.join("\n")}\n\n`;
            } else {
              const csv = XLSX.utils.sheet_to_csv(sheet);
              fullText += `=== شیت: ${name} ===\n${csv}\n\n`;
            }
          });
          setDocContent(fullText.trim());
          showMsg("✅ فایل Excel خوانده شد");
        } else {
          showMsg("⚠️ کتابخانه Excel هنوز لود نشده — چند ثانیه صبر کن و دوباره امتحان کن");
        }
      } catch {
        showMsg("⚠️ خطا در خواندن فایل Excel");
      }
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setDocContent(ev.target.result);
        showMsg("✅ فایل خوانده شد");
      };
      reader.readAsText(file, "UTF-8");
    }
    e.target.value = "";
  };

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const logs = await sbFetch("chat_logs?order=created_at.desc&limit=1000");
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const todayLogs = logs.filter(l => l.created_at.slice(0, 10) === today);
      
      // آمار کلی
      const totalAI = logs.filter(l => l.type === "ai").length;
      const totalDB = logs.filter(l => l.type === "database").length;
      const totalGreeting = logs.filter(l => l.type === "system" && l.source === "greeting").length;
      const totalOOS = logs.filter(l => l.source === "out_of_scope").length;

      // آمار امروز
      const todayAI = todayLogs.filter(l => l.type === "ai").length;
      const todayDB = todayLogs.filter(l => l.type === "database").length;

      // منابع AI
      const sources = {};
      logs.filter(l => l.type === "ai").forEach(l => {
        const src = l.source || "unknown";
        const key = src.startsWith("groq") ? "Groq" : 
                    src.startsWith("gemini") ? "Gemini" :
                    src.startsWith("github") ? "GitHub Models" :
                    src.startsWith("cloudflare") ? "Cloudflare" : src;
        sources[key] = (sources[key] || 0) + 1;
      });

      // آمار ۷ روز اخیر
      const daily = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        daily[key] = logs.filter(l => l.created_at.slice(0, 10) === key).length;
      }

      setStats({ totalAI, totalDB, totalGreeting, totalOOS, todayAI, todayDB, sources, daily, total: logs.length });
    } catch { showMsg("⚠️ خطا در بارگذاری آمار"); }
    setStatsLoading(false);
  };

  const tabStyle = (t) => ({
    padding: "10px 20px", border: "none", cursor: "pointer",
    fontFamily: "inherit", fontSize: 14, fontWeight: 600,
    borderBottom: tab === t ? "3px solid #0078d4" : "3px solid transparent",
    background: "none", color: tab === t ? "#0078d4" : "#666"
  });

  const inputStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1.5px solid #ddd", marginBottom: 10,
    fontFamily: "inherit", fontSize: 14, direction: "rtl", boxSizing: "border-box"
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div data-admin-scroll style={{ background: "white", borderRadius: 12, width: "92%", maxWidth: 720, maxHeight: "92vh", overflowY: "auto", direction: "rtl", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "white", zIndex: 10 }}>
          <h2 style={{ margin: 0, color: "#0078d4", fontSize: 18 }}>⚙️ پنل مدیریت</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#666" }}>✕</button>
        </div>

        <div style={{ borderBottom: "1px solid #eee", display: "flex", padding: "0 16px" }}>
          <button style={tabStyle("buttons")} onClick={() => setTab("buttons")}>🔘 دکمه‌های سریع</button>
          <button style={tabStyle("qa")} onClick={() => setTab("qa")}>💬 سوال و جواب اختصاصی</button>
          <button style={tabStyle("docs")} onClick={() => setTab("docs")}>📚 اسناد آموزشی</button>
          <button style={tabStyle("stats")} onClick={() => { setTab("stats"); loadStats(); }}>📊 آمار</button>
        </div>

        <div style={{ padding: 20 }}>
          {msg && <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 16, background: msg.includes("✅") ? "#d4edda" : "#fff3cd", color: msg.includes("✅") ? "#155724" : "#856404", fontSize: 14 }}>{msg}</div>}

          {tab === "buttons" && (
            <>
              <div style={{ background: "#f8f9fa", borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{btnEditId !== null ? "✏️ ویرایش دکمه" : "➕ افزودن دکمه جدید"}</h3>
                <input value={btnLabel} onChange={e => setBtnLabel(e.target.value)} placeholder="متن دکمه" style={inputStyle} />
                <input value={btnQ} onChange={e => setBtnQ(e.target.value)} placeholder="سوالی که ارسال میشه" style={inputStyle} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveBtn} disabled={loading} style={{ padding: "9px 20px", background: "#0078d4", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
                    {loading ? "..." : btnEditId !== null ? "ویرایش" : "افزودن"}
                  </button>
                  {btnEditId !== null && <button onClick={() => { setBtnEditId(null); setBtnLabel(""); setBtnQ(""); }} style={{ padding: "9px 20px", background: "#6c757d", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>انصراف</button>}
                </div>
              </div>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>دکمه‌های فعلی ({buttons.length})</h3>
              {buttons.map((btn, idx) => (
                <div key={btn.id} style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "12px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button onClick={() => moveBtn(idx, -1)} disabled={idx === 0} style={{ padding: "2px 8px", background: idx === 0 ? "#eee" : "#f0f0f0", border: "1px solid #ddd", borderRadius: 4, cursor: idx === 0 ? "default" : "pointer", fontSize: 11 }}>▲</button>
                    <button onClick={() => moveBtn(idx, 1)} disabled={idx === buttons.length - 1} style={{ padding: "2px 8px", background: idx === buttons.length - 1 ? "#eee" : "#f0f0f0", border: "1px solid #ddd", borderRadius: 4, cursor: idx === buttons.length - 1 ? "default" : "pointer", fontSize: 11 }}>▼</button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: "#0078d4", marginBottom: 4 }}>🔘 {btn.label}</div>
                    <div style={{ color: "#666", fontSize: 12 }}>↪ {btn.question}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => { setBtnLabel(btn.label); setBtnQ(btn.question); setBtnEditId(btn.id); }} style={{ padding: "6px 14px", background: "#ffc107", color: "#333", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>ویرایش</button>
                    <button onClick={() => deleteBtn(btn.id)} style={{ padding: "6px 14px", background: "#dc3545", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>حذف</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === "stats" && (
            <>
              {statsLoading ? (
                <div style={{textAlign:"center",padding:40,color:"#666"}}>در حال بارگذاری...</div>
              ) : stats ? (
                <>
                  {/* کارت‌های خلاصه */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
                    {[
                      {label:"کل پیام‌ها",value:stats.total,color:"#0078d4",icon:"💬"},
                      {label:"جواب AI امروز",value:stats.todayAI,color:"#0d9488",icon:"🤖"},
                      {label:"از دیتابیس امروز",value:stats.todayDB,color:"#6d28d9",icon:"🗄️"},
                      {label:"خارج از حوزه",value:stats.totalOOS,color:"#dc3545",icon:"🚫"},
                    ].map((c,i) => (
                      <div key={i} style={{background:"white",borderRadius:10,padding:"16px 14px",textAlign:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.08)",border:`2px solid ${c.color}22`}}>
                        <div style={{fontSize:24}}>{c.icon}</div>
                        <div style={{fontSize:26,fontWeight:700,color:c.color,margin:"4px 0"}}>{c.value}</div>
                        <div style={{fontSize:11,color:"#666"}}>{c.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* آمار کلی */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
                    <div style={{background:"white",borderRadius:10,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
                      <h4 style={{margin:"0 0 12px",color:"#0078d4",fontSize:14}}>📊 کل آمار</h4>
                      {[
                        {label:"جواب‌های AI",value:stats.totalAI,color:"#0078d4"},
                        {label:"جواب‌های دیتابیس",value:stats.totalDB,color:"#0d9488"},
                        {label:"احوال‌پرسی",value:stats.totalGreeting,color:"#6d28d9"},
                        {label:"خارج از حوزه",value:stats.totalOOS,color:"#dc3545"},
                      ].map((r,i) => (
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f0f0f0"}}>
                          <span style={{fontWeight:600,color:r.color}}>{r.value}</span>
                          <span style={{fontSize:13,color:"#444"}}>{r.label}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{background:"white",borderRadius:10,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
                      <h4 style={{margin:"0 0 12px",color:"#0078d4",fontSize:14}}>🤖 منابع AI</h4>
                      {Object.entries(stats.sources).sort((a,b)=>b[1]-a[1]).map(([src,cnt],i) => (
                        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #f0f0f0"}}>
                          <span style={{fontWeight:600,color:"#0078d4"}}>{cnt}</span>
                          <span style={{fontSize:12,color:"#444"}}>{src}</span>
                        </div>
                      ))}
                      {Object.keys(stats.sources).length === 0 && <p style={{color:"#999",fontSize:13,textAlign:"center"}}>هنوز داده‌ای نیست</p>}
                    </div>
                  </div>

                  {/* ۷ روز اخیر */}
                  <div style={{background:"white",borderRadius:10,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
                    <h4 style={{margin:"0 0 12px",color:"#0078d4",fontSize:14}}>📅 ۷ روز اخیر</h4>
                    <div style={{display:"flex",gap:8,alignItems:"flex-end",height:80}}>
                      {Object.entries(stats.daily).map(([date,cnt],i) => {
                        const max = Math.max(...Object.values(stats.daily), 1);
                        const h = Math.max((cnt/max)*70, cnt>0?4:0);
                        return (
                          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                            <div style={{fontSize:10,color:"#666",fontWeight:600}}>{cnt}</div>
                            <div style={{width:"100%",height:`${h}px`,background:"#0078d4",borderRadius:"4px 4px 0 0",transition:"height 0.3s"}}/>
                            <div style={{fontSize:9,color:"#999",writingMode:"vertical-rl",transform:"rotate(180deg)"}}>{date.slice(5)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{textAlign:"center",marginTop:16}}>
                    <button onClick={loadStats} style={{padding:"8px 20px",background:"#0078d4",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>🔄 بروزرسانی</button>
                  </div>
                </>
              ) : (
                <div style={{textAlign:"center",padding:40}}>
                  <button onClick={loadStats} style={{padding:"10px 24px",background:"#0078d4",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:14}}>📊 نمایش آمار</button>
                </div>
              )}
            </>
          )}

          {tab === "docs" && (
            <>
              <div style={{ background: "#f8f9fa", borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "#333" }}>{docEditId !== null ? "✏️ ویرایش سند" : "➕ افزودن سند آموزشی"}</h3>

                <input
                  value={docTitle}
                  onChange={e => setDocTitle(e.target.value)}
                  placeholder="عنوان سند (فارسی یا انگلیسی)..."
                  style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #ddd",marginBottom:10,fontFamily:"inherit",fontSize:14,direction:"rtl",boxSizing:"border-box"}}
                />

                <select
                  value={docCategory}
                  onChange={e => setDocCategory(e.target.value)}
                  style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #ddd",marginBottom:10,fontFamily:"inherit",fontSize:14,direction:"rtl",boxSizing:"border-box"}}
                >
                  <option value="general">عمومی</option>
                  <option value="windows">ویندوز</option>
                  <option value="office">آفیس</option>
                  <option value="network">شبکه</option>
                  <option value="erp">راهکاران / ERP</option>
                  <option value="domain">دامین</option>
                  <option value="other">سایر</option>
                </select>

                <div style={{background:"#fff",border:"2px dashed #0078d4",borderRadius:8,padding:14,marginBottom:10,textAlign:"center"}}>
                  <div style={{fontSize:13,color:"#555",marginBottom:8}}>📁 آپلود فایل</div>
                  <input
                    type="file"
                    accept=".md,.txt,.pdf,.docx,.xlsx,.xls"
                    onChange={handleFileUpload}
                    style={{fontSize:13,cursor:"pointer"}}
                  />
                  <div style={{fontSize:11,color:"#999",marginTop:6}}>فرمت‌های مجاز: TXT، MD، PDF، Word (.docx)، Excel (.xlsx/.xls)</div>
                </div>

                <div style={{position:"relative"}}>
                  <textarea
                    value={docContent}
                    onChange={e => setDocContent(e.target.value)}
                    placeholder="یا متن را اینجا paste کنید..."
                    rows={8}
                    style={{width:"100%",padding:"10px 12px",borderRadius:8,border:"1.5px solid #ddd",marginBottom:4,fontFamily:"inherit",fontSize:13,direction:"rtl",resize:"vertical",boxSizing:"border-box"}}
                  />
                </div>
                <div style={{fontSize:12,color:"#999",marginBottom:10,textAlign:"right"}}>
                  📊 {docContent.length.toLocaleString()} کاراکتر
                  {docContent.length > 10000 && <span style={{color:"#e67e22",marginRight:8}}>⚠️ فایل بزرگ — فقط ۳۰۰۰ کاراکتر اول به AI ارسال می‌شه</span>}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={saveDoc}
                    disabled={loading}
                    style={{padding:"9px 20px",background:"#0078d4",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:14,opacity:loading?0.6:1}}
                  >
                    {loading ? "در حال ذخیره..." : docEditId !== null ? "✅ ذخیره ویرایش" : "✅ افزودن سند"}
                  </button>
                  {docEditId !== null && (
                    <button
                      onClick={() => { setDocEditId(null); setDocTitle(""); setDocContent(""); setDocCategory("general"); }}
                      style={{padding:"9px 20px",background:"#6c757d",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:14}}
                    >
                      ❌ انصراف
                    </button>
                  )}
                </div>
              </div>

              <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#333" }}>📚 اسناد ذخیره شده ({docs.length})</h3>
              {docs.length === 0 ? (
                <p style={{color:"#999",textAlign:"center",padding:30}}>هنوز سندی اضافه نشده</p>
              ) : docs.map((doc) => (
                <div key={doc.id} style={{border:"1px solid #e0e0e0",borderRadius:8,padding:"12px 14px",marginBottom:10,background:"#fff"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <div style={{display:"flex",gap:6}}>
                      <button
                        onClick={() => {
                          setDocTitle(doc.title);
                          setDocContent(doc.content);
                          setDocCategory(doc.category || "general");
                          setDocEditId(doc.id);
                          // اسکرول به بالا
                          document.querySelector("[data-admin-scroll]")?.scrollTo({top:0,behavior:"smooth"});
                        }}
                        style={{padding:"6px 14px",background:"#ffc107",color:"#333",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}
                      >
                        ✏️ ویرایش
                      </button>
                      <button
                        onClick={() => deleteDoc(doc.id)}
                        style={{padding:"6px 14px",background:"#dc3545",color:"white",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600}}
                      >
                        🗑️ حذف
                      </button>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <span style={{fontWeight:700,color:"#0078d4",fontSize:14}}>📄 {doc.title}</span>
                      <span style={{marginRight:8,fontSize:11,background:"#e8f4fd",color:"#0078d4",padding:"2px 8px",borderRadius:10}}>{doc.category || "general"}</span>
                    </div>
                  </div>
                  <div style={{color:"#666",fontSize:12,textAlign:"right",marginBottom:4}}>{(doc.content || "").slice(0,150)}...</div>
                  <div style={{color:"#aaa",fontSize:11,textAlign:"right"}}>{(doc.content || "").length.toLocaleString()} کاراکتر · {new Date(doc.created_at).toLocaleDateString("fa-IR")}</div>
                </div>
              ))}
            </>
          )}

          {tab === "qa" && (
            <>
              <div style={{ background: "#f8f9fa", borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{qaEditId !== null ? "✏️ ویرایش سوال" : "➕ افزودن سوال جدید"}</h3>
                <input value={qaQ} onChange={e => setQaQ(e.target.value)} placeholder="سوال را بنویسید..." style={inputStyle} />
                <textarea value={qaA} onChange={e => setQaA(e.target.value)} placeholder="جواب را بنویسید..." rows={4} style={{ ...inputStyle, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveQA} disabled={loading} style={{ padding: "9px 20px", background: "#0078d4", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
                    {loading ? "..." : qaEditId !== null ? "ویرایش" : "افزودن"}
                  </button>
                  {qaEditId !== null && <button onClick={() => { setQaEditId(null); setQaQ(""); setQaA(""); }} style={{ padding: "9px 20px", background: "#6c757d", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>انصراف</button>}
                </div>
              </div>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>سوال‌های ذخیره شده ({qaList.length})</h3>
              {qaList.length === 0 ? <p style={{ color: "#999", textAlign: "center", padding: 30 }}>هنوز سوالی اضافه نشده</p> : qaList.map((item) => (
                <div key={item.id} style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, color: "#0078d4", marginBottom: 6 }}>❓ {item.question}</div>
                  <div style={{ color: "#444", fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}>💬 {item.answer}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { setQaQ(item.question); setQaA(item.answer); setQaEditId(item.id); }} style={{ padding: "6px 14px", background: "#ffc107", color: "#333", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>ویرایش</button>
                    <button onClick={() => deleteQA(item.id)} style={{ padding: "6px 14px", background: "#dc3545", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>حذف</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ITAssistant() {
  const WELCOME = { role: "assistant", content: "سلام! من دستیار هوش مصنوعی واحد IT شرکت Nutricia-MMP هستم 👋\nهر سوالی درباره ویندوز، آفیس، نرم‌افزارها، شبکه یا درخواست‌های IT دارید بپرسید." };

  const loadMessages = () => {
    try {
      const saved = sessionStorage.getItem("it_assistant_messages");
      return saved ? JSON.parse(saved) : [WELCOME];
    } catch { return [WELCOME]; }
  };

  const [messages, setMessages] = useState(loadMessages);
  const [userId, setUserId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminPass, setAdminPass] = useState("");
  const [adminError, setAdminError] = useState("");
  const [buttons, setButtons] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => { loadButtons(); }, []);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    try { sessionStorage.setItem("it_assistant_messages", JSON.stringify(messages)); } catch {}
  }, [messages]);

  useEffect(() => {
    const init = async () => {
      const uid = await getUserId();
      setUserId(uid);
      try {
        const history = await sbFetch(`chat_history?user_id=eq.${encodeURIComponent(uid)}&order=id&limit=100`);
        if (history.length > 0) {
          setMessages(history.map(h => ({ role: h.role, content: h.content })));
        }
      } catch {}
    };
    init();
  }, []);

  const getUserId = async () => {
    try {
      if (window.microsoftTeams) {
        await window.microsoftTeams.app.initialize();
        const context = await window.microsoftTeams.app.getContext();
        const id = context?.user?.userPrincipalName || context?.user?.id;
        if (id) return id;
      }
    } catch {}
    let id = localStorage.getItem("it_assistant_user_id");
    if (!id) {
      id = "guest_" + Math.random().toString(36).slice(2);
      localStorage.setItem("it_assistant_user_id", id);
    }
    return id;
  };

  const saveMessage = async (uid, role, content) => {
    try {
      await sbFetch("chat_history", { method: "POST", body: JSON.stringify({ user_id: uid, role, content }) });
    } catch {}
  };

  const loadButtons = async () => {
    try {
      const data = await sbFetch("buttons?order=sort_order");
      setButtons(data);
    } catch {}
  };

  const sendButtonMessage = async (question) => {
    await loadButtons();
    sendMessage(question);
  };

  const normalizeText = (t) => t
    .toLowerCase()
    .replace(/ي/g, "ی")   // ي → ی
    .replace(/ك/g, "ک")   // ك → ک
    .replace(/ى/g, "ی")   // ى → ی
    .replace(/[؀-ۿ]+/g, m => m)
    .trim();

  // جستجوی هوشمند در اسناد — بر اساس عنوان و محتوا
  const searchDocsWithAI = (userText, docs) => {
    if (!docs || docs.length === 0) return "";
    const q = normalizeText(userText);
    const words = q.split(/\s+/).filter(w => w.length > 1);

    const scored = docs.map(doc => {
      const titleNorm = normalizeText(doc.title || "");
      const catNorm = normalizeText(doc.category || "");
      const contentNorm = normalizeText((doc.content || "").slice(0, 500));
      let score = 0;
      for (const w of words) {
        if (titleNorm.includes(w)) score += 10; // عنوان مهم‌ترینه
        if (catNorm.includes(w)) score += 5;
        if (contentNorm.includes(w)) score += 2;
      }
      return { doc, score };
    }).sort((a, b) => b.score - a.score);

    // اسناد با score بالا رو کامل بفرست، بقیه رو با عنوان معرفی کن
    const topDocs = scored.filter(x => x.score > 0).slice(0, 3);
    const otherDocs = scored.filter(x => x.score === 0);

    let result = "";
    if (topDocs.length > 0) {
      result = topDocs.map(x =>
        "=== سند مرتبط: " + x.doc.title + " [دسته: " + (x.doc.category || "general") + "] ===\n" + x.doc.content.slice(0, 3000)
      ).join("\n\n");
    } else {
      // هیچ match‌ای نبود — همه اسناد رو با عنوان معرفی کن
      result = "=== اسناد آموزشی موجود ===\n" + docs.map(d =>
        "📄 " + d.title + " [" + (d.category || "general") + "]:\n" + d.content.slice(0, 1000)
      ).join("\n\n---\n\n");
    }

    // اسناد دیگه رو با عنوان اضافه کن
    if (otherDocs.length > 0 && topDocs.length > 0) {
      result += "\n\n=== سایر اسناد موجود ===\n" + otherDocs.map(x => "📄 " + x.doc.title).join("، ");
    }

    return result;
  };

    const buildSystemPrompt = async (userText) => {
    try {
      // cache برای custom_qa — هر 5 دقیقه یه بار از Supabase میخونه
      if (!_qaCache || Date.now() - _qaCacheTime > 300000) {
        _qaCache = await sbFetch("custom_qa?order=id");
        _qaCacheTime = Date.now();
      }
      const allDocs = await sbFetch("knowledge_docs?select=id,title,category,content&order=created_at.desc").catch(() => []);
      const [customQA, docsContext] = await Promise.all([
        Promise.resolve(_qaCache),
        userText && allDocs.length > 0 ? searchDocsWithAI(userText, allDocs) : Promise.resolve("")
      ]);
      let prompt = BASE_KNOWLEDGE;
      if (customQA.length > 0) {
        const customSection = customQA.map(item => "سوال: " + item.question + "\nجواب: " + item.answer).join("\n\n");
        prompt += "\n\n=== سوال و جواب‌های اختصاصی شرکت ===\n" + customSection;
      }
      if (docsContext) {
        prompt += "\n\n=== اسناد آموزشی مرتبط ===\n" + docsContext;
      }
      return { prompt, qaList: customQA };
    } catch { return { prompt: BASE_KNOWLEDGE, qaList: [] }; }
  };

  const findExactQA = (userText, qaList) => {
    if (!qaList || qaList.length === 0) return null;
    const normalize = (s) => s.trim().replace(/[\s،,؟?!.]+/g, " ").toLowerCase();
    const userNorm = normalize(userText);
    // exact match
    const exact = qaList.find(item => normalize(item.question) === userNorm);
    if (exact) return exact.answer;
    // contains match (سوال کاربر شامل سوال اختصاصی باشه یا برعکس)
    const partial = qaList.find(item => {
      const qNorm = normalize(item.question);
      return userNorm.includes(qNorm) || qNorm.includes(userNorm);
    });
    return partial ? partial.answer : null;
  };

  const renderMessage = (text) => {
    const parts = text.split(/(https?:\/\/\S+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("http://") || part.startsWith("https://")) {
        const cleanUrl = part.replace(/[.,،؟!)\]]+$/, "");
        const isDownload = cleanUrl.match(/\.(cmd|exe|zip|msi|bat)$/i);
        return (
          <a key={i} href={cleanUrl} target="_blank" rel="noopener noreferrer"
            download={isDownload ? true : undefined}
            style={{ color: "#0078d4", textDecoration: "underline", fontWeight: 600 }}>
            {isDownload ? "📥 دانلود فایل" : cleanUrl}
          </a>
        );
      }
      return part;
    });
  };

  const logChat = async (source, type) => {
    try {
      await sbFetch("chat_logs", {
        method: "POST",
        body: JSON.stringify({ source, type })
      });
    } catch {}
  };

  const cleanText = (text) => text.replace(/[\u3000-\u9fff\uac00-\ud7af\u3040-\u30ff\u0900-\u097f\u0e00-\u0e7f\u1e00-\u1eff\u0100-\u024f\u0400-\u04ff]/g, "");

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput("");
    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    if (userId) saveMessage(userId, "user", userText);
    setLoading(true);

    // اگه سوال درباره آب و هوا بود، مستقیم از OpenWeatherMap جواب بده (بدون AI)
    if (isWeatherQuery(userText)) {
      const city = extractCity(userText);
      if (city) {
        try {
          const res = await fetchWithFallback(`/weather?city=${encodeURIComponent(city)}`, { method: "GET" });
          const data = await res.json();
          if (data.success) {
            const reply = formatWeatherReply(data);
            setMessages([...newMessages, { role: "assistant", content: reply }]);
            if (userId) saveMessage(userId, "assistant", reply);
            logChat("openweathermap", "weather");
            setLoading(false);
            return;
          }
        } catch (e) {
          // اگه weather API در دسترس نبود، بذار جریان عادی AI ادامه پیدا کنه
        }
      }
    }

    try {
      const { prompt: systemPrompt, qaList } = await buildSystemPrompt(userText);

      // اول چک کن سوال اختصاصی داره یا نه
      const exactAnswer = findExactQA(userText, qaList);
      if (exactAnswer) {
        setMessages([...newMessages, { role: "assistant", content: exactAnswer }]);
        if (userId) saveMessage(userId, "assistant", exactAnswer);
        logChat("custom_qa", "database");
        setLoading(false);
        return;
      }

      // پیام کوتاه → context بیشتر بفرست
      const wordCount = userText.trim().split(/\s+/).length;
      const isShortMsg = wordCount <= 3;
      const contextCount = isShortMsg ? 14 : 6;
      const apiMsgs = newMessages.slice(-contextCount).map(m => ({ role: m.role, content: m.content }));

      // اگه پیام خیلی کوتاه بود و هیچ context قبلی IT نداشت، از کاربر بخواه سوالش رو کامل کنه
      const ambiguousWords = ["no", "yes", "آره", "نه", "خیر", "بله", "اوکی", "ok", "okay", "ها", "نه نه", "یا", "آوکی", "ممنون", "مرسی", "باشه", "چشم", "اوکیه", "یس", "نوپ", "nope", "yep", "yup"];
      const isAmbiguous = ambiguousWords.includes(userText.trim().toLowerCase());
      const hasPrevContext = newMessages.slice(-6, -1).some(m => m.role === "assistant" && m.content.length > 50);
      if (isAmbiguous && !hasPrevContext) {
        const msg = "لطفاً سوال خود را کامل‌تر بنویسید تا بتوانم بهتر کمک کنم. 😊";
        setMessages([...newMessages, { role: "assistant", content: msg }]);
        if (userId) saveMessage(userId, "assistant", msg);
        setLoading(false);
        return;
      }

      // اگه پیام ambiguous بود و context داشت، به AI بگو این جواب سوال قبلیه
      let finalMessages = apiMsgs;
      if (isAmbiguous && hasPrevContext) {
        const lastAssistantMsg = [...newMessages].slice(0, -1).reverse().find(m => m.role === "assistant");
        if (lastAssistantMsg && lastAssistantMsg.content.includes("؟")) {
          // آخرین پیام assistant سوال داشته — یه hint اضافه کن
          finalMessages = [
            ...apiMsgs.slice(0, -1),
            { role: "user", content: `[پاسخ به سوال قبلی شما]: ${userText}` }
          ];
        }
      }
      const res = await fetchWithFallback("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: finalMessages, system_prompt: systemPrompt }),
      });
      const data = await res.json();
            if (!res.ok || !data.reply) throw new Error(data?.error || "خطا از سرور");
      const reply = cleanText(data.reply);
      setMessages([...newMessages, { role: "assistant", content: reply }]);
      if (userId) saveMessage(userId, "assistant", reply);
      logChat(data.source || "ai", "ai");
    } catch (err) {
      setMessages([...newMessages, { role: "assistant", content: `⚠️ خطا در اتصال: ${err.message}` }]);
    } finally { setLoading(false); }
  };

  const handleAdminLogin = async () => {
    try {
      const res = await fetchWithFallback("/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPass })
      });
      if (res.ok) {
        setShowAdminLogin(false);
        setShowAdminPanel(true);
        setAdminPass("");
        setAdminError("");
      } else {
        setAdminError("پسورد اشتباه است");
      }
    } catch {
      setAdminError("خطا در اتصال به سرور");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxHeight: "-webkit-fill-available", background: "#f0f2f5", fontFamily: "'Segoe UI', Tahoma, sans-serif", direction: "rtl", overflow: "hidden" }}>
      <div style={{ background: "linear-gradient(135deg, #0078d4, #005a9e)", color: "white", padding: "16px 20px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🖥️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>دستیار هوش مصنوعی واحد IT شرکت Nutricia-MMP</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>پشتیبانی هوشمند فناوری اطلاعات • آنلاین</div>
        </div>
        <button onClick={() => setShowAdminLogin(true)} style={{ marginRight: "auto", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>🔐 Login</button>
        <button onClick={async () => {
          setMessages([WELCOME]);
          try { sessionStorage.removeItem("it_assistant_messages"); } catch {}
          if (userId) {
            try { await sbFetch(`chat_history?user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" }); } catch {}
          }
        }} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>🗑️ پاک کردن چت</button>
      </div>

      <div style={{ padding: "10px 16px", background: "#fff", borderBottom: "1px solid #e0e0e0", display: "flex", gap: 8, flexWrap: "wrap" }}>
        {buttons.map((q) => (
          <button key={q.id} onClick={() => sendButtonMessage(q.question)} style={{ padding: "6px 12px", borderRadius: 20, border: "1px solid #0078d4", background: "white", color: "#0078d4", cursor: "pointer", fontSize: 12, fontFamily: "inherit", whiteSpace: "nowrap" }}
            onMouseEnter={e => { e.target.style.background = "#0078d4"; e.target.style.color = "white"; }}
            onMouseLeave={e => { e.target.style.background = "white"; e.target.style.color = "#0078d4"; }}
          >{q.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", touchAction: "pan-y", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-start" : "flex-end", alignItems: "flex-end", gap: 8 }}>
            {msg.role === "assistant" && <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#0078d4", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🖥️</div>}
            <div style={{ maxWidth: "72%", padding: "10px 14px", borderRadius: msg.role === "user" ? "18px 18px 18px 4px" : "18px 18px 4px 18px", background: msg.role === "user" ? "#0078d4" : "#ffffff", color: msg.role === "user" ? "white" : "#1a1a1a", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", direction: "rtl", textAlign: "right" }}>{msg.role === "user" ? msg.content : renderMessage(msg.content)}</div>
            {msg.role === "user" && <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#6c757d", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>👤</div>}
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#0078d4", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🖥️</div>
            <div style={{ padding: "12px 16px", borderRadius: "18px 18px 4px 18px", background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", display: "flex", gap: 4, alignItems: "center" }}>
              {[0, 1, 2].map(j => <div key={j} style={{ width: 8, height: 8, borderRadius: "50%", background: "#0078d4", opacity: 0.6, animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: "12px 16px", background: "#fff", borderTop: "1px solid #e0e0e0", display: "flex", gap: 10, alignItems: "flex-end" }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="سوال IT خود را بنویسید..." rows={1}
          style={{ flex: 1, padding: "10px 14px", borderRadius: 22, border: "1.5px solid #d0d0d0", outline: "none", resize: "none", fontFamily: "inherit", fontSize: 14, direction: "rtl", textAlign: "right", lineHeight: 1.5, maxHeight: 120, overflowY: "auto", transition: "border-color 0.2s" }}
          onFocus={e => e.target.style.borderColor = "#0078d4"} onBlur={e => e.target.style.borderColor = "#d0d0d0"} />
        <button onClick={() => sendMessage()} disabled={!input.trim() || loading} style={{ width: 44, height: 44, borderRadius: "50%", background: input.trim() && !loading ? "#0078d4" : "#ccc", border: "none", cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>➤</button>
      </div>

      {showAdminLogin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "white", borderRadius: 12, padding: 28, width: 320, direction: "rtl", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 16px", color: "#0078d4" }}>🔐 ورود به پنل مدیریت</h3>
            <input type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdminLogin()} placeholder="پسورد را وارد کنید..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #ddd", marginBottom: 8, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
            {adminError && <p style={{ color: "red", margin: "0 0 8px", fontSize: 13 }}>{adminError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAdminLogin} style={{ flex: 1, padding: 10, background: "#0078d4", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>ورود</button>
              <button onClick={() => { setShowAdminLogin(false); setAdminPass(""); setAdminError(""); }} style={{ flex: 1, padding: 10, background: "#6c757d", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>انصراف</button>
            </div>
          </div>
        </div>
      )}

      {showAdminPanel && <AdminPanel onClose={() => { setShowAdminPanel(false); loadButtons(); }} onDataChanged={loadButtons} />}

      <style>{`
        * { box-sizing: border-box; }
        html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }
        @keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 10px; }
      `}</style>
    </div>
  );
}
