from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
import os
import time
import uuid
import re
import asyncio
import json

app = FastAPI()

# === LM Studio Relay — ۸ اوت ۲۰۲۶ ===
# چون Cloudflare Tunnel و ngrok هر دو از شبکه‌ی VM (ایران) مسدود بودن (یکی DNS hijack سطح شبکه،
# یکی مسدودی IP ایران توسط خودِ ngrok)، به‌جای این‌که VM یه سرور عمومی (inbound) داشته باشه،
# خودِ VM یه اتصال خروجی (outbound) به همین HuggingFace Space می‌زنه که می‌دونیم از ایران کار می‌کنه.
# VM هر چند ثانیه این صف رو poll می‌کنه، سوال رو به LM Studio محلی (localhost:1234) میده،
# جواب رو برمی‌گردونه اینجا. هیچ تونل/دامنه/IP عمومی لازم نیست.
LMSTUDIO_RELAY_SECRET = os.environ.get("LMSTUDIO_RELAY_SECRET", "")
lmstudio_jobs = {}  # job_id -> {"messages", "system_prompt", "status": "pending"/"done", "reply": None, "model": None, "created": ts}
lmstudio_last_seen = 0.0  # آخرین باری که VM موفق poll کرد (heartbeat) — برای تشخیص آنلاین/آفلاین بدون اتلاف وقت
# ۱۳ اوت ۲۰۲۶: اسکریپت relay سمت VM (خارج از این ریپو) همیشه فیلد "model" رو توی POST به
# /lmstudio-relay/respond پر نمی‌کرد، پس توی جواب نهایی به‌جای اسم مدل "؟" نمایش داده می‌شد.
# تا وقتی اسکریپت VM اصلاح بشه، این مقدار پیش‌فرض (همون مدلی که طبق مستندات پروژه روش نصب شده)
# جایگزین می‌شه تا کاربر همیشه یه اسم واقعی ببینه، نه علامت سوال.
LMSTUDIO_DEFAULT_MODEL_NAME = "google/gemma-3-1b"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_KEYS = [
    os.environ.get("GROQ_KEY1", ""),
    os.environ.get("GROQ_KEY2", ""),
    os.environ.get("GROQ_KEY3", ""),
    os.environ.get("GROQ_KEY4", ""),
    os.environ.get("GROQ_KEY5", ""),
    os.environ.get("GROQ_KEY6", ""),
    os.environ.get("GROQ_KEY7", ""),
    os.environ.get("GROQ_KEY8", ""),
]

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
CF_TOKEN = os.environ.get("CF_TOKEN", "")
# ۱۶ اوت ۲۰۲۶: کلید API سرویس رسمی نرخ ارز Navasan (navasan.tech) — عمداً فقط اینجا (env variable
# بک‌اند) نگه داشته می‌شه، نه توی URL ذخیره‌شده توی جدول web_sources (اون جدول با anon key از
# مرورگر کاربر قابل‌خوندنه؛ اگه کلید توی URL بود، هر کاربری از Network tab می‌تونست ببینتش و
# سهمیه‌ی محدود ماهانه رو خودش مصرف کنه). توی /fetch-web-source، اگه URL درخواستی مال
# navasan.tech بود و خودش از قبل api_key نداشت، همینجا اضافه می‌شه.
NAVASAN_API_KEY = os.environ.get("NAVASAN_API_KEY", "")
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "")

# OpenRouter — یه کلید، چند مدل رایگان پشتش، خودش auto-route می‌کنه اگه یه مدل خاص از کار افتاد یا rate limit خورد.
# چون مدل‌های رایگان OpenRouter مرتب عوض میشن، از "openrouter/free" (auto-router خودش) استفاده می‌کنیم
# نه یه model id ثابت — این‌طوری حتی وقتی لیست مدل‌های رایگان تغییر کنه، کد نیاز به ویرایش نداره.
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

# 🎚️ ۱۳ اوت ۲۰۲۶: ترتیب اولویت provider ها الان از پنل مدیریت قابل‌تغییره (تب «آمار»، بخش
# «اولویت هوش مصنوعی‌ها»). فرانت‌اند این ترتیب رو از Supabase (app_settings, key=provider_priority)
# می‌خونه و توی هر درخواست /chat به‌عنوان provider_order می‌فرسته. اگه چیزی نفرستاد یا لیست نامعتبر
# بود (یکی از ۵ تا رو کم/زیاد داشت)، همین ترتیب پیش‌فرض استفاده میشه — پس این خط همیشه باید
# منبع حقیقت برای «کدوم ۵ provider معتبرن» باقی بمونه.
DEFAULT_PROVIDER_ORDER = ["groq", "lmstudio", "gemini", "openrouter", "cloudflare"]

OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY", "")

# نگاشت شهرهای پرکاربرد ایران به نام لاتین — چون OpenWeatherMap اسم فارسی شهرهای کوچک رو نمی‌شناسه
IRAN_CITY_MAP = {
    "تهران": "Tehran", "مشهد": "Mashhad", "شاندیز": "Shandiz,IR",
    "اصفهان": "Isfahan", "شیراز": "Shiraz", "تبریز": "Tabriz",
    "اهواز": "Ahvaz", "کرج": "Karaj", "قم": "Qom", "کرمان": "Kerman",
    "یزد": "Yazd", "رشت": "Rasht", "همدان": "Hamedan", "ارومیه": "Urmia",
    "زاهدان": "Zahedan", "ساری": "Sari", "بندرعباس": "Bandar Abbas",
    "کرمانشاه": "Kermanshah", "اراک": "Arak", "زنجان": "Zanjan",
    "قزوین": "Qazvin", "گرگان": "Gorgan", "سنندج": "Sanandaj",
    "خرم‌آباد": "Khorramabad", "خرم آباد": "Khorramabad", "یاسوج": "Yasuj",
    "بجنورد": "Bojnord", "بیرجند": "Birjand", "ایلام": "Ilam",
    "بوشهر": "Bushehr", "دماوند": "Damavand", "توس": "Tus,IR",
}

@app.get("/")
def root():
    return {"status": "ok"}

@app.get("/ping")
def ping():
    return "ok"

@app.get("/ping/supabase")
async def ping_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {"status": "skipped", "reason": "no supabase config"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/buttons?limit=1",
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
            )
            return {"status": "ok", "supabase": res.status_code}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@app.post("/admin/login")
async def admin_login(request: Request):
    body = await request.json()
    password = body.get("password", "")
    if not ADMIN_PASSWORD:
        return JSONResponse(status_code=500, content={"error": "Admin password not configured"})
    if password == ADMIN_PASSWORD:
        return {"success": True, "token": "admin_" + ADMIN_PASSWORD[-4:]}
    return JSONResponse(status_code=401, content={"error": "Invalid password"})

@app.get("/status")
def status():
    return {
        "groq_keys": len([k for k in GROQ_KEYS if k]),
        "openrouter": bool(OPENROUTER_API_KEY),
        "gemini": bool(GEMINI_API_KEY),
        "cloudflare": bool(CF_TOKEN),
        "openweather": bool(OPENWEATHER_API_KEY),
    }

@app.get("/test-providers")
async def test_providers():
    """
    تست مستقل هر provider/کلید — برخلاف /chat که به محض جواب گرفتن از اولین provider متوقف میشه،
    این endpoint همه رو جدا و مستقل امتحان می‌کنه و نتیجه‌ی هرکدوم رو برمی‌گردونه.
    برای دیباگ استفاده شود؛ چون ~۱۰ تا درخواست همزمان به provider های مختلف میزنه، مصرف quota داره.
    """
    results = {}
    test_messages = [{"role": "user", "content": "سلام"}]

    async def test_groq(i, key):
        if not key:
            return "not_configured"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={"model": "openai/gpt-oss-120b", "max_tokens": 5, "messages": test_messages}
                )
                return "ok" if res.status_code == 200 else f"fail: {res.status_code} {res.text[:150]}"
        except Exception as e:
            return f"fail: {type(e).__name__}: {str(e) or 'no message'}"

    async def test_openrouter(model):
        if not OPENROUTER_API_KEY:
            return "not_configured"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                    json={"model": model, "max_tokens": 5, "messages": test_messages, "reasoning": {"exclude": True}}
                )
                return "ok" if res.status_code == 200 else f"fail: {res.status_code} {res.text[:150]}"
        except Exception as e:
            return f"fail: {type(e).__name__}: {str(e) or 'no message'}"

    async def test_gemini():
        if not GEMINI_API_KEY:
            return "not_configured"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
                    headers={"Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY},
                    json={"contents": [{"role": "user", "parts": [{"text": "سلام"}]}], "generationConfig": {"maxOutputTokens": 5, "thinkingConfig": {"thinkingLevel": "minimal"}}}
                )
                return "ok" if res.status_code == 200 else f"fail: {res.status_code} {res.text[:150]}"
        except Exception as e:
            return f"fail: {type(e).__name__}: {str(e) or 'no message'}"

    async def test_cf():
        if not (CF_TOKEN and CF_ACCOUNT_ID):
            return "not_configured"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.post(
                    f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
                    headers={"Authorization": f"Bearer {CF_TOKEN}", "Content-Type": "application/json"},
                    json={"messages": test_messages}
                )
                if res.status_code == 200 and res.json().get("success"):
                    return "ok"
                return f"fail: {res.status_code} {res.text[:150]}"
        except Exception as e:
            cause = f" | cause: {type(e.__cause__).__name__}: {e.__cause__}" if e.__cause__ else ""
            return f"fail: {type(e).__name__}: {str(e) or 'no message'}{cause}"

    for i, key in enumerate(GROQ_KEYS):
        results[f"groq_key{i+1}"] = await test_groq(i, key)
    results["openrouter_gemma"] = await test_openrouter("google/gemma-4-31b-it:free")
    results["openrouter_auto"] = await test_openrouter("openrouter/free")
    results["gemini"] = await test_gemini()
    results["cloudflare"] = await test_cf()

    return results

@app.get("/weather")
async def weather(city: str = ""):
    city = (city or "").strip()
    if not city:
        return JSONResponse(status_code=400, content={"error": "نام شهر ارسال نشده"})
    if not OPENWEATHER_API_KEY:
        return JSONResponse(status_code=500, content={"error": "کلید OpenWeatherMap تنظیم نشده"})

    # اگه اسم شهر توی نگاشت ایران بود، معادل لاتینش رو استفاده کن
    query_city = IRAN_CITY_MAP.get(city, city)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={"q": query_city, "appid": OPENWEATHER_API_KEY, "units": "metric", "lang": "fa"}
            )
            if res.status_code == 200:
                data = res.json()
                result = {
                    "success": True,
                    "city": data.get("name", city),
                    "temp": round(data["main"]["temp"]),
                    "feels_like": round(data["main"]["feels_like"]),
                    "humidity": data["main"]["humidity"],
                    "wind_kmh": round(data.get("wind", {}).get("speed", 0) * 3.6),
                    "description": data["weather"][0]["description"],
                    "icon": data["weather"][0]["icon"],
                    "observed_at_unix": data.get("dt"),
                    "timezone_offset_sec": data.get("timezone", 0),
                }

                # پیش‌بینی ۳ روز آینده — از همون endpoint رایگان OpenWeatherMap (5 day / 3 hour forecast)،
                # نیازی به پلن پولی یا کلید جدا نداره. بازه‌های ۳ساعته رو بر اساس تاریخ محلی شهر گروه‌بندی
                # می‌کنیم و برای هر روز دما کمینه/بیشینه و وضعیت غالب رو برمی‌گردونیم.
                try:
                    fres = await client.get(
                        "https://api.openweathermap.org/data/2.5/forecast",
                        params={"q": query_city, "appid": OPENWEATHER_API_KEY, "units": "metric", "lang": "fa"}
                    )
                    if fres.status_code == 200:
                        fdata = fres.json()
                        tz_offset = fdata.get("city", {}).get("timezone", 0)
                        days = {}
                        for entry in fdata.get("list", []):
                            local_dt = entry["dt"] + tz_offset
                            day_key = local_dt // 86400
                            hour = (local_dt % 86400) // 3600
                            d = days.setdefault(day_key, {"temps": [], "mid_entry": None, "mid_diff": 999})
                            d["temps"].append(entry["main"]["temp"])
                            diff = abs(hour - 13.5)  # نزدیک‌ترین بازه به وسط روز رو برای توصیف/آیکون انتخاب کن
                            if diff < d["mid_diff"]:
                                d["mid_diff"] = diff
                                d["mid_entry"] = entry
                        today_key = (data.get("dt", 0) + tz_offset) // 86400
                        forecast = []
                        for day_key in sorted(days.keys()):
                            if day_key <= today_key:
                                continue
                            d = days[day_key]
                            forecast.append({
                                "date_unix": day_key * 86400 - tz_offset,
                                "min": round(min(d["temps"])),
                                "max": round(max(d["temps"])),
                                "description": d["mid_entry"]["weather"][0]["description"],
                                "icon": d["mid_entry"]["weather"][0]["icon"],
                            })
                            if len(forecast) == 3:
                                break
                        result["forecast"] = forecast
                        result["forecast_timezone_offset_sec"] = tz_offset
                except Exception as fe:
                    print(f"⚠️ forecast fetch failed (current weather still returned): {type(fe).__name__}: {fe}")
                    result["forecast"] = []

                return result
            elif res.status_code == 404:
                return JSONResponse(status_code=404, content={"error": f"شهر «{city}» پیدا نشد"})
            else:
                return JSONResponse(status_code=502, content={"error": "خطا در دریافت اطلاعات آب و هوا"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# === منابع وب — ۱۶ اوت ۲۰۲۶ ===
# فیچر «منابع وب» (تب جدید پنل مدیریت): ادمین یه URL دلخواه (مثلاً سایت نرخ ارز navasanplus.net)
# + یه لیبل + چندتا کلیدواژه ثبت می‌کنه. وقتی سوال کاربر با یکی از کلیدواژه‌ها مچ بشه، فرانت‌اند
# اول اینجا (بک‌اند) رو صدا می‌زنه تا صفحه‌ی مقصد بلادرنگ خونده و متن خام (بدون تگ HTML) استخراج
# بشه، بعد همون متن به‌عنوان context واقعی به AI داده می‌شه تا AI دقیقاً از روی همون متن جواب بده —
# نه از حافظه‌ی خودش (که برای قیمت لحظه‌ای ارز کاملاً غیرقابل‌اعتماده و می‌تونه عدد از خودش بسازه).
# فچ خودِ صفحه اینجا (بک‌اند) انجام می‌شه، نه توی مرورگر کاربر، چون اکثر سایت‌ها CORS رو برای
# دامنه‌های خارجی مسدود می‌کنن.
WEB_SOURCE_FETCH_TIMEOUT = 15
WEB_SOURCE_MAX_CHARS = 10000  # سقف طول متن استخراج‌شده — هم برای جلوگیری از صفحه‌های غیرمنتظره‌ی خیلی بزرگ، هم چون بعداً این متن وارد بودجه‌ی کاراکتری system_prompt (همون منطق GROQ_BUDGET پایین) می‌شه

def extract_visible_text_from_html(html: str) -> str:
    """
    متن قابل‌مشاهده‌ی یه صفحه‌ی HTML رو (بدون تگ/اسکریپت/استایل) استخراج می‌کنه.
    از BeautifulSoup با پارسر داخلی خودِ پایتون (html.parser) استفاده می‌کنه — نیازی به
    نصب lxml جدا نیست.
    ⛔️ ۱۶ اوت ۲۰۲۶: نسخه‌ی اول این تابع فقط get_text ساده بود — برای صفحاتی مثل جدول نرخ ارز
    (navasanplus.net) که هر ردیف چند سلول جدا (زمان/تغییر/قیمت/اسم ارز) داره، این باعث می‌شد
    ترتیب متن خروجی بین سلول‌ها به‌هم بریزه و AI نمی‌تونست بفهمه کدوم عدد مال کدوم ارزه (مثلاً
    «186,400» و «دلار آمریکا» چندین خط از هم فاصله می‌گرفتن). حالا اول جدول‌ها رو جدا پردازش
    می‌کنیم: هر ردیف جدول به یه خط «ستون۱: مقدار۱ | ستون۲: مقدار۲ | ...» تبدیل می‌شه (دقیقاً
    همون الگوی parseHeaderTableSheet توی فرانت‌اند برای اکسل) تا رابطه‌ی هر عدد با برچسبش حفظ
    بشه؛ بعد جدول از soup حذف می‌شه تا توی متن عمومی پایین تکراری/بی‌ساختار اضافه نکنه.
    """
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "iframe"]):
        tag.decompose()

    table_lines = []
    for table in soup.find_all("table"):
        headers = None
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"])
            texts = [c.get_text(" ", strip=True) for c in cells]
            texts = [t for t in texts if t]
            if not texts:
                continue
            if headers is None and row.find("th"):
                headers = texts
                continue
            if headers and len(texts) == len(headers):
                table_lines.append(" | ".join(f"{h}: {v}" for h, v in zip(headers, texts)))
            else:
                table_lines.append(" | ".join(texts))
        table.decompose()

    general_text = soup.get_text("\n")
    general_lines = [ln.strip() for ln in general_text.split("\n")]
    general_lines = [ln for ln in general_lines if ln]

    combined = "\n".join(table_lines + general_lines)
    return combined[:WEB_SOURCE_MAX_CHARS]

# ۱۶ اوت ۲۰۲۶: نگاشت فیلدهای خام API نوسان (navasan.tech) به لیبل فارسی + واحد قطعی. مستندات
# رسمی Navasan می‌گه خروجی «ریال»ه، ولی با مقایسه‌ی عددی مستقیم با tgju.org (که خودش صراحتاً ریال
# می‌نویسه) روشن شد این مستندات قدیمی/غلطه و مقدار واقعی «تومان»ه (دقیقاً ۱۰ برابر کوچیک‌تر از
# رقم‌های ریالی tgju). برای ارز دیجیتال (btc/eth/...) و اونس جهانی (xau) هم مقدار واقعی «دلار»
# آمریکاست، نه تومان. این واحدها دستی و قطعی تعیین شدن — نه حدس AI — چون اشتباه تومان/ریال قبلاً
# باعث خطای واقعی به کاربر شده بود.
NAVASAN_FIELD_INFO = {
    "usd": ("دلار آمریکا (نقدی)", "تومان"), "usd_sherkat": ("دلار آمریکا (شرکتی)", "تومان"), "usd_shakhs": ("دلار آمریکا (شخصی)", "تومان"),
    "eur": ("یورو", "تومان"), "gbp": ("پوند انگلیس", "تومان"), "aed": ("درهم امارات (نقدی)", "تومان"), "aed_note": ("درهم امارات (اسکناس)", "تومان"),
    "try": ("لیر ترکیه", "تومان"), "jpy": ("ین ژاپن", "تومان"), "aud": ("دلار استرالیا", "تومان"), "nzd": ("دلار نیوزیلند", "تومان"),
    "cad": ("دلار کانادا", "تومان"), "sgd": ("دلار سنگاپور", "تومان"), "chf": ("فرانک سوئیس", "تومان"), "pkr": ("روپیه پاکستان", "تومان"),
    "azn": ("منات آذربایجان", "تومان"), "nok": ("کرون نروژ", "تومان"), "sek": ("کرون سوئد", "تومان"), "dkk": ("کرون دانمارک", "تومان"),
    "kwd": ("دینار کویت", "تومان"), "omr": ("ریال عمان", "تومان"), "rub": ("روبل روسیه", "تومان"), "brl": ("رئال برزیل", "تومان"),
    "thb": ("بات تایلند", "تومان"), "afn": ("افغانی", "تومان"), "inr": ("روپیه هند", "تومان"), "cny": ("یوان چین", "تومان"), "myr": ("رینگیت مالزی", "تومان"),
    "gel": ("لاری گرجستان", "تومان"),
    "eur_hav": ("یورو (حواله)", "تومان"), "gbp_hav": ("پوند (حواله)", "تومان"), "hav_cad_cheque": ("دلار کانادا (حواله/چک)", "تومان"),
    "aud_hav": ("دلار استرالیا (حواله)", "تومان"), "myr_hav": ("رینگیت مالزی (حواله)", "تومان"), "cny_hav": ("یوان چین (حواله)", "تومان"),
    "try_hav": ("لیر ترکیه (حواله)", "تومان"), "jpy_hav": ("ین ژاپن (حواله)", "تومان"),
    # ۱۶ اوت ۲۰۲۶ — فیکس مهم: طبق مستندات رسمی Navasan (webserviceguide)، رمزارزها هم مثل بقیه‌ی
    # فیلدها پیش‌فرض به تومان‌ان؛ نسخه‌ی دلاری فقط وقتی توی پاسخه که پارامتر dollar_rate=true به
    # درخواست اضافه شده باشه (که پایین‌تر اضافه‌ش کردیم) و به‌صورت فیلد جدای dollar_rate توی همون
    # آبجکت میاد — برای همین یونیت پایه‌شون هم «تومان»ه، نه «دلار» (قبلاً اشتباه دلار گذاشته بودم).
    "btc": ("بیت‌کوین", "تومان"), "eth": ("اتریوم", "تومان"), "xrp": ("ریپل", "تومان"), "bch": ("بیت‌کوین‌کش", "تومان"), "eos": ("ایاس", "تومان"),
    "bnb": ("بایننس‌کوین", "تومان"), "usdt": ("تتر", "تومان"), "ltc": ("لایت‌کوین", "تومان"), "dash": ("دش", "تومان"), "doge": ("دوج‌کوین", "تومان"),
    "sol": ("سولانا", "تومان"), "ada": ("کاردانو", "تومان"), "shib": ("شیبا اینو", "تومان"), "avax": ("آوالانچ", "تومان"), "matic": ("متیک", "تومان"),
    "dot": ("پولکادات", "تومان"), "xlm": ("استلار", "تومان"), "ton": ("تون‌کوین", "تومان"), "trx": ("ترون", "تومان"), "xmr": ("مونرو", "تومان"),
    # xau (بدون پیشوند usd) طبق جدول کدهای ارز نوسان مثل بقیه‌ی کدهای ارز، تومانیه؛ فقط usd_xau
    # صراحتاً «اونس جهانی طلا» به دلاره (پیشوند usd خودش این رو مشخص کرده)
    "xau": ("اونس طلا", "تومان"), "usd_xau": ("اونس جهانی طلا", "دلار"),
    "18ayar": ("طلای ۱۸ عیار (هر گرم)", "تومان"), "sekkeh": ("سکه امامی", "تومان"),
    "bahar": ("سکه بهار آزادی", "تومان"), "nim": ("نیم‌سکه", "تومان"), "rob": ("ربع‌سکه", "تومان"), "abshodeh": ("طلای آب‌شده", "تومان"),
    "gerami": ("سکه گرمی", "تومان"),
}

def format_navasan_json(data: dict) -> str:
    lines = []
    for key, info in data.items():
        if not isinstance(info, dict) or "value" not in info:
            continue
        # پیش‌فرض «تومان» (نه خالی): تقریباً کل جدول کدهای ارز Navasan (شامل صدها کد ارز/رمزارز
        # ناشناخته که توی NAVASAN_FIELD_INFO دستی لیست نشدن) به‌همین قاعده تومانی‌ان.
        label, unit = NAVASAN_FIELD_INFO.get(key, (key, "تومان"))
        change = info.get("change", "")
        date = info.get("date", "")
        lines.append(f"{label} ({key}): {info.get('value', '')} {unit} — تغییر: {change} — بروزرسانی: {date}")
        # اگه dollar_rate=true درخواست شده بود، برای رمزارزها یه خط جدای دلاری هم (طبق مستندات
        # رسمی، این فیلد اضافی توی همون آبجکت میاد) کنارش اضافه کن
        if "dollar_rate" in info:
            lines.append(f"{label} ({key}) به دلار: {info.get('dollar_rate', '')} دلار")
    return "\n".join(lines)

# ۱۶ اوت ۲۰۲۶: برای سایت‌هایی که ساختارشون رو از قبل می‌شناسیم و واحد قیمتشون همیشه ثابته (ولی
# خودِ صفحه‌ی اصلی‌شون همیشه توی متن اون رو تکرار نمی‌کنه)، یه یادداشت قطعی به محتوای فچ‌شده اضافه
# می‌کنیم تا AI مجبور نشه حدس بزنه. برای دامنه‌های ناشناخته (هر چیزی که اینجا نیست)، سیستم عمداً
# چیزی اضافه نمی‌کنه — AI فقط وقتی واحدی رو می‌گه که خودِ صفحه صریح نوشته باشدش؛ این امن‌تره تا
# این‌که برای یه سایت ناشناخته حدس بزنیم.
KNOWN_SOURCE_UNIT_NOTES = {
    "tgju.org": "⚠️ توجه مهم: تمام قیمت‌های این سایت (tgju.org) همیشه به واحد «ریال» ایران هستن، نه تومان (طبق اعلام صریح خودِ سایت در صفحات جزئیات).",
}

def get_known_source_unit_note(url: str) -> str:
    for domain, note in KNOWN_SOURCE_UNIT_NOTES.items():
        if domain in url:
            return note
    return ""

# ۱۶ اوت ۲۰۲۶: به‌جای اینکه همیشه کل لیست چندصد ارز/رمزارز Navasan رو بگیریم (که هم غیرضروریه، هم
# باعث می‌شد متن به قدری بلند بشه که موقع محدودیت طول برای Groq از وسط قطع بشه و AI عدد اشتباه/
# ساختگی بده)، اگه بشه از روی متن سوال کاربر تشخیص داد دقیقاً کدوم ارز/طلا/رمزارز مدنظرشه، فقط
# همون یکی رو با پارامتر item= از API می‌گیریم — دقیقاً مثل تستی که با مرورگر جواب درست داد.
# اگه سوال چندتا ارز رو با هم بخواد یا هیچ‌کدوم تشخیص داده نشه، به گرفتن کل لیست برمی‌گردیم.
NAVASAN_KEYWORD_TO_ITEM = {
    "دلار": "usd", "یورو": "eur", "پوند": "gbp", "درهم": "aed", "لیر": "try", "ین": "jpy",
    "طلا": "18ayar", "اونس": "usd_xau",
    "سکه امامی": "sekkeh", "بهار آزادی": "bahar", "نیم سکه": "nim", "ربع سکه": "rob", "سکه گرمی": "gerami", "آبشده": "abshodeh",
    "بیت کوین": "btc", "بیتکوین": "btc", "اتریوم": "eth", "ریپل": "xrp", "تتر": "usdt", "بایننس": "bnb",
    "لایت کوین": "ltc", "دوج کوین": "doge", "سولانا": "sol", "کاردانو": "ada", "شیبا": "shib",
    "آوالانچ": "avax", "پولکادات": "dot", "استلار": "xlm", "ترون": "trx", "مونرو": "xmr",
}

def guess_navasan_item(query: str) -> str:
    if not query:
        return ""
    q = query.replace("\u200c", " ")  # نیم‌فاصله → فاصله، تا «بیت‌کوین» و «بیت کوین» یکی حساب بشن
    matched = set()
    for kw, item in NAVASAN_KEYWORD_TO_ITEM.items():
        if kw in q:
            matched.add(item)
    if len(matched) == 1:
        return next(iter(matched))
    return ""  # صفر یا چندتا مچ → کل لیست گرفته می‌شه (امن‌تر از انتخاب یکی از چندتا به‌طور دلبخواه)

@app.post("/fetch-web-source")
async def fetch_web_source(request: Request):
    body = await request.json()
    url = (body.get("url") or "").strip()
    query = (body.get("query") or "").strip()
    if not url.startswith(("http://", "https://")):
        return JSONResponse(status_code=400, content={"success": False, "error": "URL نامعتبر است (باید با http:// یا https:// شروع بشه)"})
    # اگه URL مال api.navasan.tech بود و خودش از قبل api_key نداشت، کلید رو همینجا (سمت بک‌اند) اضافه کن —
    # توضیح کامل بالای NAVASAN_API_KEY رو ببین (چرا کلید نباید توی خودِ URL ذخیره‌شده توی Supabase باشه).
    # dollar_rate=true هم اضافه می‌شه تا طبق مستندات رسمی، برای رمزارزها فیلد دلاریِ جدا هم برگرده
    # (چون مقدار پیش‌فرض/بدون این پارامتر تومانیه، نه دلاری). اگه از روی سوال کاربر بشه دقیقاً یه
    # ارز/طلا/رمزارز تشخیص داد، item= هم اضافه می‌شه تا فقط همون یکی (نه کل لیست) گرفته بشه.
    if "navasan.tech" in url and NAVASAN_API_KEY and "api_key=" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}api_key={NAVASAN_API_KEY}&dollar_rate=true"
        item = guess_navasan_item(query)
        if item and "item=" not in url:
            url = f"{url}&item={item}"
    try:
        async with httpx.AsyncClient(timeout=WEB_SOURCE_FETCH_TIMEOUT, follow_redirects=True) as client:
            # بدون User-Agent مرورگرمانند، خیلی از سایت‌ها (از جمله سایت‌های ایرانی نرخ ارز) درخواست
            # پایتون رو مسدود یا با یه نسخه‌ی متفاوت/خالی از صفحه جواب می‌دن.
            res = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            })
        if res.status_code != 200:
            return JSONResponse(status_code=502, content={"success": False, "error": f"سایت/سرویس مقصد با کد {res.status_code} جواب داد"})
        content_type = res.headers.get("content-type", "")
        if "application/json" in content_type:
            # ۱۶ اوت ۲۰۲۶: برای سرویس‌های API (مثل Navasan) که JSON خام برمی‌گردونن، به‌جای رد کردن
            # از پارسر HTML (که چیزی به‌جز همون متن خام برنمی‌گردوند)، اگه فرمت شبیه پاسخ Navasan بود
            # (هر فیلد یه object با کلید value) به خط‌های فارسی خوانا تبدیلش می‌کنیم؛ وگرنه JSON خام
            # (pretty-printed) رو می‌فرستیم تا AI خودش ازش جواب بسازه.
            try:
                data = res.json()
            except Exception:
                data = None
            if isinstance(data, dict) and any(isinstance(v, dict) and "value" in v for v in data.values()):
                text = format_navasan_json(data)
            else:
                text = json.dumps(data, ensure_ascii=False, indent=2) if data is not None else res.text
            text = text[:WEB_SOURCE_MAX_CHARS]
        else:
            text = extract_visible_text_from_html(res.text)
        if not text.strip():
            return JSONResponse(status_code=502, content={"success": False, "error": "متنی از این صفحه/سرویس استخراج نشد (شاید محتوا با جاوااسکریپت لود میشه)"})
        # اگه این دامنه توی KNOWN_SOURCE_UNIT_NOTES بود، یادداشت قطعیِ واحد قیمت رو بالای محتوا اضافه کن
        note = get_known_source_unit_note(url)
        if note:
            text = f"{note}\n\n{text}"
        return {"success": True, "content": text}
    except Exception as e:
        return JSONResponse(status_code=502, content={"success": False, "error": str(e)})

EXTRACT_IMAGE_PROMPT = (
    "این تصویر یک سند یا جدول اداری/شرکتی فارسی است (مثلاً منوی غذای هفتگی، لیست تلفن داخلی، جدول شیفت، فرم یا برنامه). "
    "وظیفه‌ات رونویسی دقیق و کلمه‌به‌کلمه‌ی محتوای تصویر است — نه خلاصه‌سازی، نه بازنویسی، نه حدس زدن. قوانین زیر را دقیقاً رعایت کن:\n\n"
    "۱. اگر تصویر جدول دارد، برای هر ردیف دقیقاً یک خط بنویس با این فرمت: "
    "«[برچسب ردیف مثل نام هفته/روز]: [نام ستون۱]: [مقدار] — [نام ستون۲]: [مقدار] — ...». "
    "مثال: «هفته اول - چهارشنبه: پیش‌غذا: ماست خیار — غذای اصلی: قیمه — مواد متفرقه: نان». "
    "همه‌ی ردیف‌های جدول را بدون جا انداختن هیچ‌کدام رونویسی کن.\n"
    "۲. متن فارسی را با حروف استاندارد فارسی بنویس (ی و ک فارسی، نه ي و ك عربی). هیچ کلمه یا عددی را با مشابه یا حدسی جایگزین نکن. "
    "اگر کلمه‌ای به‌سختی خوانا بود، دقیق‌ترین خوانش ممکن از روی حروف واقعی تصویر را بنویس.\n"
    "۳. اگر سلولی خالی بود یا فقط *** یا -- داشت، بنویس «ثبت نشده».\n"
    "۴. مطلقاً از نمادهای Markdown مثل **، *، # یا خط تیره‌ی لیست استفاده نکن — فقط متن ساده و خط‌به‌خط.\n"
    "۵. عنوان، تاریخ شروع/پایان یا اطلاعات هدر سند را در یک خط جدا در ابتدای خروجی بیاور.\n"
    "۶. هیچ توضیح، مقدمه، جمع‌بندی یا نظر شخصی اضافه نکن؛ فقط محتوای استخراج‌شده‌ی خام را برگردان."
)

@app.post("/extract-image")
async def extract_image(request: Request):
    body = await request.json()
    image_base64 = body.get("image_base64", "")
    mime_type = body.get("mime_type", "image/jpeg")
    if not image_base64:
        return JSONResponse(status_code=400, content={"error": "تصویری ارسال نشده"})

    errors = []

    # 1. Gemini — اول این رو امتحان کن، برای خوندن جدول‌های چگال و متن ریز معمولاً دقیق‌تره
    # (GitHub Models قبلاً این‌جا بک‌آپ بود؛ از ۳۰ ژوئیه ۲۰۲۶ کاملاً بازنشسته شد و حذف شد)
    if GEMINI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                res = await client.post(
                    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
                    headers={"Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY},
                    json={
                        "contents": [{
                            "role": "user",
                            "parts": [
                                {"text": EXTRACT_IMAGE_PROMPT},
                                {"inline_data": {"mime_type": mime_type, "data": image_base64}}
                            ]
                        }],
                        "generationConfig": {"maxOutputTokens": 3000, "temperature": 0.1, "thinkingConfig": {"thinkingLevel": "minimal"}}
                    }
                )
                if res.status_code == 200:
                    data = res.json()
                    print("✅ Gemini Vision")
                    return {"success": True, "text": data["candidates"][0]["content"]["parts"][0]["text"], "source": "gemini"}
                errors.append(f"Gemini: {res.status_code} {res.text[:200]}")
        except Exception as e:
            errors.append(f"Gemini: {str(e)}")

    # 2. OpenRouter (vision) — بک‌آپ مستقل از کلید Gemini خودمون؛ اگه یه‌روز این model id رو
    # حذف کردن (لیست رایگان مرتب عوض میشه)، توی openrouter.ai/models دنبال یه مدل ":free" با پشتیبانی تصویر بگرد
    if OPENROUTER_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                res = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": "google/gemini-2.0-flash-exp:free",
                        "max_tokens": 3000,
                        "temperature": 0.1,
                        "messages": [{
                            "role": "user",
                            "content": [
                                {"type": "text", "text": EXTRACT_IMAGE_PROMPT},
                                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image_base64}"}}
                            ]
                        }],
                        "reasoning": {"exclude": True}
                    }
                )
                if res.status_code == 200:
                    data = res.json()
                    print("✅ OpenRouter Vision")
                    return {"success": True, "text": data["choices"][0]["message"]["content"], "source": "openrouter"}
                errors.append(f"OpenRouter: {res.status_code} {res.text[:200]}")
        except Exception as e:
            errors.append(f"OpenRouter: {type(e).__name__}: {str(e) or 'no message'}")

    print(f"❌ /extract-image failed: {' | '.join(errors)}")
    return JSONResponse(status_code=503, content={"error": f"استخراج تصویر ناموفق بود: {' | '.join(errors)}"})

def is_english_question(messages):
    """چهارم اوت ۲۰۲۶: آخرین پیام کاربر رو چک می‌کنه — سوال انگلیسیه یا فارسی.
    ⛔️ ۵ اوت ۲۰۲۶ (رفع باگ جدی): نسخه‌ی قبلی فقط تعداد حروف لاتین رو با فارسی مقایسه می‌کرد
    (latin > persian). این باعث می‌شد سوال‌های فارسی که یه پیام خطای انگلیسی طولانی وسطشون
    نقل‌قول شده بود (مثل "اگر اکسل خطای compile error in hidden module بده چیکار کنم؟" — که کاملاً
    طبیعیه چون خطاهای نرم‌افزار همیشه انگلیسی‌ان) به‌اشتباه «انگلیسی» تشخیص داده بشن. بعدش هر جواب
    درست فارسی که provider ها می‌دادن، توسط looks_malformed به‌عنوان «زبان غلط» رد می‌شد و کل زنجیره
    تا ۵۰۳ می‌رفت — یعنی این تشخیص غلط داشت جواب‌های *درست* رو دور می‌ریخت.
    حالا خیلی محافظه‌کارتره: فقط وقتی سوال انگلیسی حساب میشه که عملاً هیچ متن فارسی معناداری توش
    نباشه (حداکثر چند حرف فارسی مجاز، برای چیزهایی مثل نام‌های تصادفی). یه عبارت انگلیسی طولانی
    وسط یه جمله‌ی فارسی دیگه به تنهایی کافی نیست."""
    last_user = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            last_user = m.get("content") or ""
            break
    latin = len(re.findall(r"[A-Za-z]", last_user))
    persian = len(re.findall(r"[\u0600-\u06FF]", last_user))
    return latin > 0 and persian <= 3


def looks_malformed(text, request_is_english=False):
    """چهارم/پنجم/ششم اوت ۲۰۲۶: چند نوع خرابی رو تشخیص می‌ده:
    ۱) لیست‌های شماره‌گذاری/بولت‌شده با آیتم خالی (مثل "1. :" بدون محتوا) — مدل‌های رایگان کوچیک
       (مخصوصاً OpenRouter Gemma) گاهی این‌جوری خراب میشن.
    ۲) زبان غلط — وقتی سوال انگلیسیه ولی جواب عمدتاً فارسیه (دیده شد با Groq llama-3.3-70b، یه مدل
       معمولاً قابل‌اعتماد؛ یعنی حتی مدل‌های خوب گاهی از قانون ۱ زبان تخطی می‌کنن، نه فقط مدل‌های کوچیک).
    ۳) نقطه‌گذاری یتیم — کلمات وسط جمله حذف میشن ولی کاما/دونقطه‌ی اطرافشون می‌مونه، مثل
       "Power BI ,  ,  ,  ,  ExcelSQL ServerAzure" یا "1. :  ,  ExcelSQL ServerAzure". چک قبلی
       (فقط آیتم کاملاً خالی) این حالت رو نمی‌گرفت چون بعد از دونقطه/کاما هنوز یه‌کم متن باقی می‌مونه؛
       الان دنبال ",  ," (دو کاما پشت‌سرهم فقط با فاصله) یا ":  ," (دونقطه بلافاصله بعدش کاما) هم می‌گرده."""
    if not text:
        return True
    empty_items = re.findall(r"^\s*(?:\d+\.|[-•*])\s*:?\s*$", text, re.MULTILINE)
    if len(empty_items) >= 2:
        return True
    if re.search(r",\s*,", text) or re.search(r":\s*,", text):
        return True
    if request_is_english:
        latin = len(re.findall(r"[A-Za-z]", text))
        persian = len(re.findall(r"[\u0600-\u06FF]", text))
        if persian > latin:
            return True
    return False


@app.get("/lmstudio-relay/poll")
async def lmstudio_relay_poll(secret: str = ""):
    # VM هر چند ثانیه اینو صدا می‌زنه. اگه job در انتظار بود، قدیمی‌ترینش رو برمی‌گردونیم.
    global lmstudio_last_seen
    if not LMSTUDIO_RELAY_SECRET or secret != LMSTUDIO_RELAY_SECRET:
        return JSONResponse(status_code=401, content={"error": "invalid secret"})
    lmstudio_last_seen = time.time()
    for job_id, job in lmstudio_jobs.items():
        if job["status"] == "pending":
            job["status"] = "sent"
            return JSONResponse(
                content={"job_id": job_id, "messages": job["messages"], "system_prompt": job["system_prompt"]},
                media_type="application/json; charset=utf-8"
            )
    return JSONResponse(content={}, media_type="application/json; charset=utf-8")


@app.post("/lmstudio-relay/respond")
async def lmstudio_relay_respond(request: Request):
    body = await request.json()
    if not LMSTUDIO_RELAY_SECRET or body.get("secret") != LMSTUDIO_RELAY_SECRET:
        return JSONResponse(status_code=401, content={"error": "invalid secret"})
    job_id = body.get("job_id", "")
    if job_id in lmstudio_jobs:
        lmstudio_jobs[job_id]["reply"] = body.get("reply", "")
        lmstudio_jobs[job_id]["model"] = body.get("model") or LMSTUDIO_DEFAULT_MODEL_NAME
        lmstudio_jobs[job_id]["status"] = "done"
    return {"ok": True}


@app.get("/lmstudio-relay/test")
async def lmstudio_relay_test():
    # برای تست دستی مسیر relay، بدون رد شدن از Groq/Gemini/OpenRouter — مستقیم یه job می‌فرسته
    # و منتظر جواب VM می‌مونه.
    if not LMSTUDIO_RELAY_SECRET:
        return {"error": "LMSTUDIO_RELAY_SECRET is not set on the server"}
    seen_ago = time.time() - lmstudio_last_seen
    job_id = uuid.uuid4().hex[:12]
    lmstudio_jobs[job_id] = {
        "messages": [{"role": "user", "content": "این یک پیام تستیه. فقط بگو: سلام، من زنده‌ام!"}],
        "system_prompt": "",
        "status": "pending", "reply": None, "model": None, "created": time.time()
    }
    try:
        for _ in range(180):  # 180 ثانیه — چون روی این سخت‌افزار (بدون GPU) هر جواب ممکنه ۶۰-۱۲۰ ثانیه طول بکشه
            await asyncio.sleep(1)
            job = lmstudio_jobs.get(job_id)
            if job and job["status"] == "done":
                return {"ok": True, "vm_last_seen_seconds_ago": round(seen_ago, 1), "reply": job["reply"], "model": job.get("model")}
        return {"ok": False, "vm_last_seen_seconds_ago": round(seen_ago, 1), "error": "timeout — VM did not respond within 180s"}
    finally:
        lmstudio_jobs.pop(job_id, None)


# === توابع مستقل هر provider — ۱۳ اوت ۲۰۲۶ ===
# قبلاً هر ۵ مرحله (Groq/LM Studio/Gemini/OpenRouter/Cloudflare) مستقیم پشت‌سرهم توی خودِ chat()
# نوشته شده بودن (ترتیب هاردکد). برای این‌که ادمین بتونه از پنل مدیریت ترتیبشون رو عوض کنه، هر
# مرحله به یه تابع مستقل تبدیل شد. هر تابع یا dict جواب موفق برمی‌گردونه، یا None (یعنی این
# provider رد شد/در دسترس نبود، برو سراغ بعدی توی errors). منطق داخل هرکدوم عیناً همون قبلیه —
# فقط جابه‌جا شده، چیزی تغییر نکرده.

# 🚀 ۱۳ اوت ۲۰۲۶: کشف شد که چرا سوالی که در نهایت از LM Studio Relay جواب می‌گیره، از پنل اصلی
# (که اول باید Groq شکست بخوره) خیلی کندتر از /local-chat.html (که force_lmstudio داره و
# مستقیم می‌ره سراغ LM Studio، بدون رد شدن از Groq) جواب می‌ده. علتش این بود که ۸ کلید Groq
# قبلاً یکی‌یکی (sequential) امتحان می‌شدن — اگه چند کلید اول پشت‌سرهم rate-limit/timeout
# می‌خوردن، مجموع تاخیرشون (تا ۱۲ ثانیه هرکدوم) قبل از رسیدن به مرحله‌ی بعد (LM Studio Relay)
# جمع می‌شد. چون هر کلید سهمیه‌ی جدا داره، امتحان هم‌زمان (parallel) هیچ باری روی Groq اضافه
# نمی‌کنه، فقط زمان انتظار رو از «جمعِ» تاخیرها به «حداکثرِ» تاخیرها کاهش می‌ده.
async def try_groq(messages, groq_system_prompt, request_is_english, rid, t0, errors):
    active_keys = [(i, k) for i, k in enumerate(GROQ_KEYS) if k]
    if not active_keys:
        return None

    async def call_key(i, key):
        try:
            # ⛔️ ۱۸ اوت ۲۰۲۶: مدل قبلی llama-3.3-70b-versatile از ۱۷ ژوئن ۲۰۲۶ توسط خودِ Groq
            # کاملاً منسوخ (decommissioned) شد و دیگه هیچ‌وقت جواب نمی‌ده (۴۰۴ model not found) —
            # طبق توصیه‌ی رسمی خودشون (console.groq.com/docs/deprecations) عوضش شد به
            # openai/gpt-oss-120b.
            # ۱۳ اوت ۲۰۲۶: چون کلیدها الان هم‌زمان امتحان می‌شن، ۱۲ ثانیه دیگه لازم نیست — یه
            # کلید سالم معمولاً چند ثانیه‌ای جواب می‌ده؛ ۸ ثانیه سقف بدترین حالت رو بازم پایین‌تر می‌بره
            async with httpx.AsyncClient(timeout=8) as client:
                res = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={
                        "model": "openai/gpt-oss-120b",
                        "max_tokens": 1500,
                        "messages": [{"role": "system", "content": groq_system_prompt}] + messages
                    }
                )
                if res.status_code == 200:
                    data = res.json()
                    reply_text = data["choices"][0]["message"]["content"]
                    if request_is_english and looks_malformed(reply_text, request_is_english):
                        return ("skip", f"Groq key{i+1}: malformed reply (skipped)", None)
                    return ("ok", f"Groq key{i+1}", {"reply": reply_text, "source": f"groq_key{i+1}"})
                elif res.status_code == 429:
                    return ("fail", f"Groq key{i+1}: rate limit", None)
                else:
                    return ("fail", f"Groq key{i+1}: {res.status_code} {res.text[:200]}", None)
        except Exception as e:
            return ("fail", f"Groq key{i+1}: {str(e)}", None)

    tasks = {asyncio.create_task(call_key(i, k)): i for i, k in active_keys}
    pending = set(tasks.keys())
    try:
        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for d in done:
                status, msg, payload = d.result()
                if status == "ok":
                    print(f"✅ [{rid} +{time.time()-t0:.1f}s] {msg}")
                    for p in pending:
                        p.cancel()
                    return payload
                errors.append(msg)
                print(f"⚠️ [{rid} +{time.time()-t0:.1f}s] {msg}")
    finally:
        for t in tasks:
            if not t.done():
                t.cancel()
    return None


async def try_lmstudio_relay(messages, groq_system_prompt, rid, t0, errors):
    if not (LMSTUDIO_RELAY_SECRET and (time.time() - lmstudio_last_seen) < 12):
        return None
    normalized_messages = []
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if normalized_messages and normalized_messages[-1]["role"] == role:
            normalized_messages[-1]["content"] += "\n\n" + content
        else:
            normalized_messages.append({"role": role, "content": content})
    while normalized_messages and normalized_messages[0]["role"] != "user":
        normalized_messages.pop(0)

    job_id = uuid.uuid4().hex[:12]
    lmstudio_jobs[job_id] = {
        "messages": normalized_messages, "system_prompt": groq_system_prompt,
        "status": "pending", "reply": None, "model": None, "created": time.time()
    }
    try:
        for _ in range(240):  # 240 × 0.5s = 120 ثانیه حداکثر انتظار
            await asyncio.sleep(0.5)
            job = lmstudio_jobs.get(job_id)
            if job and job["status"] == "done":
                reply_text = job["reply"]
                if reply_text:
                    used_model = job.get("model") or LMSTUDIO_DEFAULT_MODEL_NAME
                    print(f"✅ [{rid} +{time.time()-t0:.1f}s] LM Studio (relay, model={used_model})")
                    return {"reply": reply_text, "source": f"lmstudio_relay:{used_model}"}
                errors.append("LM Studio (relay): empty reply")
                break
        else:
            errors.append("LM Studio (relay): timeout waiting for VM response")
    finally:
        lmstudio_jobs.pop(job_id, None)
    return None


async def try_gemini(messages, system_prompt, request_is_english, rid, t0, errors):
    if not GEMINI_API_KEY:
        return None
    try:
        contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]} for m in messages]
        async with httpx.AsyncClient(timeout=8) as client:
            res = await client.post(
                "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
                headers={"Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY},
                json={
                    "system_instruction": {"parts": [{"text": system_prompt}]},
                    "contents": contents,
                    "generationConfig": {"maxOutputTokens": 1500, "thinkingConfig": {"thinkingLevel": "minimal"}}
                }
            )
            if res.status_code == 200:
                data = res.json()
                reply_text = data["candidates"][0]["content"]["parts"][0]["text"]
                if request_is_english and looks_malformed(reply_text, request_is_english):
                    print(f"⚠️ [{rid} +{time.time()-t0:.1f}s] Gemini: malformed English reply, skipping")
                    errors.append("Gemini: malformed reply (skipped)")
                else:
                    print(f"✅ [{rid} +{time.time()-t0:.1f}s] Gemini")
                    return {"reply": reply_text, "source": "gemini"}
            else:
                print(f"⚠️ [{rid} +{time.time()-t0:.1f}s] Gemini: {res.status_code} {res.text[:200]}")
                errors.append(f"Gemini: {res.status_code} {res.text[:200]}")
    except Exception as e:
        print(f"⚠️ [{rid} +{time.time()-t0:.1f}s] Gemini: {type(e).__name__}: {str(e) or 'no message'}")
        errors.append(f"Gemini: {type(e).__name__}: {str(e) or 'no message'}")
    return None


async def try_openrouter(messages, system_prompt, request_is_english, rid, t0, errors):
    if not OPENROUTER_API_KEY:
        return None
    OPENROUTER_MODELS = ["google/gemma-4-26b-a4b-it:free", "google/gemma-4-31b-it:free"]
    for or_model in OPENROUTER_MODELS:
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                res = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": or_model,
                        "max_tokens": 1500,
                        "messages": [{"role": "system", "content": system_prompt}] + messages,
                        "reasoning": {"exclude": True}
                    }
                )
                if res.status_code == 200:
                    data = res.json()
                    reply_text = data["choices"][0]["message"]["content"]
                    if request_is_english and looks_malformed(reply_text, request_is_english):
                        print(f"⚠️ [{rid} +{time.time()-t0:.1f}s] OpenRouter ({or_model}): malformed English reply, skipping")
                        errors.append(f"OpenRouter ({or_model}): malformed reply (skipped)")
                        continue
                    print(f"✅ [{rid} +{time.time()-t0:.1f}s] OpenRouter ({or_model})")
                    return {"reply": reply_text, "source": f"openrouter:{or_model}"}
                fail_msg = f"OpenRouter ({or_model}): {res.status_code} {res.text[:200]}"
                print(f"⚠️ [{rid} +{time.time()-t0:.1f}s] {fail_msg}")
                errors.append(fail_msg)
        except Exception as e:
            fail_msg = f"OpenRouter ({or_model}): {type(e).__name__}: {str(e) or 'no message'}"
            print(f"⚠️ [{rid} +{time.time()-t0:.1f}s] {fail_msg}")
            errors.append(fail_msg)
    return None


async def try_cloudflare(messages, system_prompt, rid, t0, errors):
    if not (CF_TOKEN and CF_ACCOUNT_ID):
        if CF_TOKEN and not CF_ACCOUNT_ID:
            errors.append("CF: CF_ACCOUNT_ID env var is empty")
        return None
    try:
        async with httpx.AsyncClient(timeout=6) as client:
            res = await client.post(
                f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast",
                headers={"Authorization": f"Bearer {CF_TOKEN}", "Content-Type": "application/json"},
                json={"messages": [{"role": "system", "content": system_prompt}] + messages}
            )
            if res.status_code == 200:
                data = res.json()
                if data.get("success") and data.get("result", {}).get("response"):
                    print(f"✅ [{rid} +{time.time()-t0:.1f}s] Cloudflare")
                    return {"reply": data["result"]["response"], "source": "cloudflare"}
                errors.append(f"CF: 200 but success={data.get('success')} errors={data.get('errors')}")
            else:
                errors.append(f"CF: {res.status_code} {res.text[:200]}")
    except Exception as e:
        cause = f" | cause: {type(e.__cause__).__name__}: {e.__cause__}" if e.__cause__ else ""
        errors.append(f"CF: {type(e).__name__}: {str(e) or 'no message'}{cause}")
    return None


@app.post("/chat")
async def chat(request: Request):
    # 🕵️ چهارم اوت ۲۰۲۶: تا الان لاگ‌ها هیچ timestamp/شناسه‌ای نداشتن، پس وقتی چند درخواست
    # هم‌زمان می‌اومدن (که با retries:1 فرانت‌اند بیشتر هم پیش میاد) تشخیص این‌که کدوم پیام
    # مال کدوم درخواسته، یا چقدر واقعاً طول کشیده، از روی لاگ ممکن نبود. حالا هر درخواست یه
    # شناسه‌ی کوتاه (rid) می‌گیره و هر پرینت هم زمان سپری‌شده از شروع همون درخواست رو نشون می‌ده.
    t0 = time.time()
    rid = uuid.uuid4().hex[:6]
    body = await request.json()
    messages = body.get("messages", [])
    system_prompt = body.get("system_prompt", "")
    force_lmstudio = bool(body.get("force_lmstudio", False))
    # ⛔️ چهارم اوت ۲۰۲۶: کشف شد که گاهی messages خالیه یا آخرین پیام فقط space/whitespace داره
    # (مثلاً از یه دکمه‌ی خالی یا کلیک اشتباه). قبلاً این حالت رو تا آخر زنجیره (هر ۴ provider،
    # هرکدوم با یه خطای فوری "Input must have at least 1 token"/"contents is not specified")
    # می‌فرستادیم و در نهایت به Cloudflare هم می‌رسید (۶ ثانیه ConnectTimeout اضافه) و بعد ۵۰۳ —
    # یعنی چند ثانیه اتلاف وقت برای چیزی که از همون اول قابل‌پیش‌بینی بود. حالا سریع و بدون
    # درگیر کردن هیچ provider ای رد میشه.
    if not messages or not any((m.get("content") or "").strip() for m in messages):
        return {"reply": "متن سوالتون خالی بود، لطفاً دوباره بنویسید.", "source": "validation"}
    # چهارم اوت ۲۰۲۶: فقط برای سوال‌های انگلیسی جواب رو اعتبارسنجی می‌کنیم (طبق درخواست کاربر) —
    # چون تا الان مشکل خروجی خراب/ناقص فقط توی جواب‌های انگلیسی دیده شده، نه فارسی. این چک فقط
    # یه regex ارزونه، پس هزینه‌ای به سرعت جواب‌های سالم (اکثریت قریب‌به‌اتفاق) اضافه نمی‌کنه —
    # فقط وقتی واقعاً خراب بود، یه provider اضافه امتحان میشه (که طبیعتاً یکم کندتره ولی نادره).
    request_is_english = is_english_question(messages)
    # محافظت اضافه: صرف‌نظر از هر باگی که یه‌روز توی فرانت‌اند باعث بزرگ‌شدن بی‌رویه‌ی system_prompt بشه
    # (مثل اتفاق ۲ اوت ۲۰۲۶ که با دامپ‌شدن محتوای همه‌ی اسناد آموزشی باعث خطای 413 روی Groq شد)،
    # این‌جا هم یه سقف سخت می‌ذاریم تا هیچ‌وقت درخواست از حد مجاز provider ها رد نشه.
    if len(system_prompt) > 24000:
        print(f"⚠️ [{rid}] system_prompt truncated: {len(system_prompt)} -> 24000 chars")
        system_prompt = system_prompt[:24000] + "\n\n[...برای جلوگیری از خطای حجم درخواست، بخشی از این پرامپت کوتاه شد.]"
    # Groq سقف TPM (توکن در دقیقه) خیلی پایین‌تری روی پلن رایگان داره، و متن فارسی معمولاً هر کاراکتر
    # تقریباً ۱ توکن می‌گیره (خیلی بدتر از انگلیسی) — همون سقف ۲۴۰۰۰ کاراکتری که برای بقیه‌ی provider ها
    # کافیه، برای Groq هنوز باعث 413 (Request too large... tokens per minute) می‌شد. برای Groq یه
    # نسخه‌ی کوتاه‌تر می‌فرستیم؛ Gemini/OpenRouter نسخه‌ی کامل‌تر (۲۴۰۰۰) رو می‌گیرن.
    # ⛔️ ۵ اوت ۲۰۲۶: کشف شد که سقف قبلی (۶۰۰۰) حتی خودِ BASE_KNOWLEDGE (۷۱۷۷ کاراکتر) رو هم کامل
    # نمی‌ذاشت به Groq برسه — یعنی بخشی از قوانین پایه (نه فقط تاریخ/Q&A/اسناد که همیشه بعدش قطع
    # می‌شدن) هم قطع می‌شد. به ۸۰۰۰ افزایش یافت تا کل BASE_KNOWLEDGE جا بشه. این یه انتخاب محافظه‌کارانه‌ست
    # (هنوز خیلی زیر ۲۴۰۰۰ که باعث 413 می‌شد)، ولی اگه بعد از این تغییر خطای 413 روی Groq دیدی،
    # باید دوباره کمش کنی و/یا خودِ BASE_KNOWLEDGE رو کوتاه‌تر کنی.
    # ⛔️ ۶ اوت ۲۰۲۶: کشف مهم‌تر — چون ترتیب ساخت system_prompt توی فرانت‌اند اینه:
    # BASE_KNOWLEDGE (۷۱۷۷ کاراکتر) → تاریخ → «سوال‌وجواب‌های اختصاصی شرکت» → اسناد آموزشی،
    # و BASE_KNOWLEDGE به‌تنهایی تقریباً کل بودجه‌ی ۸۰۰۰ کاراکتری Groq رو می‌خورد، بخش Q&A
    # (که دقیقاً محتوایی‌ست که کاربر توی پنل مدیریت ثبت کرده) عملاً هیچ‌وقت به Groq نمی‌رسید!
    # همین باعث می‌شد Groq برای سوال‌های مرتبط با Q&A (نه match دقیق — که findExactQA جدا
    # جواب می‌ده — بلکه سوال‌های نزدیک/مرتبط که باید AI با خوندن Q&A جواب بده) اطلاعات رو از خودش
    # بسازه (hallucination)، چون اصلاً محتوای Q&A رو نمی‌دید.
    # رفع شد: به‌جای برش کورکورانه از ابتدا، بخش «=== سوال و جواب‌های اختصاصی شرکت ===» به بعد
    # (که شامل Q&A و اسناد میشه) اولویت نگه‌داشتن داره — تا ۶۰٪ بودجه بهش اختصاص می‌یابد،
    # باقی‌مونده برای BASE_KNOWLEDGE/تاریخ (از ابتدا، جایی که قوانین اصلی مثل قانون ۱ زبانه) صرف میشه.
    # ⛔️ ۶ اوت ۲۰۲۶ (ادامه): کشف شد که خودِ فیکس بالا هم کافی نبود — چون Q&A و اسناد آموزشی رو یه
    # بلوک واحد حساب می‌کرد (qa_and_after)، اگه لیست Q&A شرکت بزرگ بود، به‌تنهایی کل اون ۶۰٪ بودجه رو
    # می‌خورد و بخش «=== اسناد آموزشی مرتبط ===» (که کاربر توی Supabase آپلود کرده، مثل راهنمای اکتیو
    # کردن ویندوز/آفیس) بازم هیچ‌وقت به Groq نمی‌رسید — دقیقاً همون علامتی که با «آیا به شبکه وصلید؟ →
    # بله → لطفاً با IT تماس بگیرید» (جواب عمومی، بدون استفاده از سند واقعی) دیده شد.
    # حالا Q&A و اسناد جدا از هم بودجه می‌گیرن، هرکدوم مستقل.
    # ⛔️ ۱۶ اوت ۲۰۲۶: همین مشکل برای «منابع وب» (نرخ ارز و مشابه) هم پیش اومد — وقتی محتوای فچ‌شده
    # (مثلاً کل لیست ارزهای Navasan) طولانی بود، برش کورکورانه از ابتدا می‌تونست دقیقاً ردیف موردنظر
    # کاربر رو قطع کنه و AI (Groq) به‌جای گفتن «پیدا نکردم»، عدد ساختگی می‌ساخت. حالا این بخش هم
    # مثل Q&A/اسناد بودجه‌ی اختصاصی و تضمین‌شده داره.
    web_source_marker = "=== محتوای صفحه ("
    GROQ_BUDGET = 8000
    qa_marker = "=== سوال و جواب‌های اختصاصی شرکت ==="
    docs_marker = "=== اسناد آموزشی مرتبط ==="
    if docs_marker in system_prompt:
        before_docs, _, docs_part = system_prompt.partition(docs_marker)
        docs_part = docs_marker + docs_part
    else:
        before_docs, docs_part = system_prompt, ""
    if qa_marker in before_docs:
        base_part, _, qa_part = before_docs.partition(qa_marker)
        qa_part = qa_marker + qa_part
    else:
        base_part, qa_part = before_docs, ""
    if web_source_marker in base_part:
        base_part, _, web_source_part = base_part.partition(web_source_marker)
        web_source_part = web_source_marker + web_source_part
    else:
        web_source_part = ""
    if len(system_prompt) > GROQ_BUDGET:
        # اگه محتوای منابع وب توی این system_prompt بود، اولویت اول با اونه (چون معمولاً کوچیکه —
        # یه آیتم یا چندتا ردیف قیمت — و از دست رفتنش یعنی جواب غلط درباره‌ی یه عدد مالی واقعی).
        web_source_budget = min(len(web_source_part), int(GROQ_BUDGET * 0.45)) if web_source_part else 0
        remaining_budget = GROQ_BUDGET - web_source_budget
        # ۲۱ اوت ۲۰۲۶: سهم اسناد آموزشی کمی بیشتر شد (۰.۴۲) تا جواب‌های مبتنی بر سند دقیق‌تر باشند
        docs_budget = min(len(docs_part), int(remaining_budget * 0.42))
        qa_budget = min(len(qa_part), int(remaining_budget * 0.30))
        base_budget = max(remaining_budget - docs_budget - qa_budget, 0)
        groq_system_prompt = (
            base_part[:base_budget] + "\n\n" + qa_part[:qa_budget] + "\n\n" + docs_part[:docs_budget]
            + "\n\n" + web_source_part[:web_source_budget]
            + "\n\n[...برای Groq کوتاه‌تر شد، نسخه‌ی کامل‌تر توسط سایر provider ها استفاده میشه.]"
        )
    else:
        groq_system_prompt = system_prompt

    # 🖥️ ۱۳ اوت ۲۰۲۶: کشف شد که چرا صفحه‌ی /local-chat.html (که system_prompt خالی می‌فرسته) روی
    # همون VM حدود ۲۶-۲۷ ثانیه جواب می‌گیره، ولی همون سوال از پنل اصلی دستیار (که system_prompt
    # کامل — تا سقف ۸۰۰۰ کاراکتری Groq — می‌فرسته) بالای ۱ دقیقه طول می‌کشه: روی این VM بدون GPU،
    # زمان prefill تقریباً خطی با تعداد کاراکتر system_prompt رشد می‌کنه (بر خلاف Groq/Gemini/
    # OpenRouter که سرور ابری قدرتمند دارن و این تفاوت محسوس نیست). چون بودجه‌ی ۸۰۰۰ کاراکتری
    # Groq برای این مدل کوچیک (1B، بدون GPU) اصلاً مناسب نیست، یه بودجه‌ی جدا و خیلی کوچیک‌تر
    # فقط برای LM Studio Relay در نظر گرفته شد — با همون منطق تقسیم (پایه/Q&A/اسناد) که بالا
    # برای Groq استفاده شد، فقط با سقف پایین‌تر.
    # ۱۳ اوت ۲۰۲۶ (ادامه): حتی با بودجه‌ی ۱۵۰۰ کاراکتری، فاصله‌ی محسوسی بین سرعت پنل اصلی و
    # /local-chat.html (system_prompt کاملاً خالی) باقی موند — چون prefill روی این VM بدون GPU
    # خطی با طول prompt رشد می‌کنه، حتی ۱۵۰۰ کاراکتر اضافه (نسبت به صفر) چند ثانیه‌ی محسوس اضافه
    # می‌کنه. بودجه به ۵۰۰ کم شد تا رفتار پنل اصلی به /local-chat.html نزدیک‌تر بشه، با این
    # قبول که مدل محلی (که خودش خیلی ضعیفه) context کمتری از قوانین/اسناد شرکت می‌بینه.
    LMSTUDIO_BUDGET = 500
    if len(system_prompt) > LMSTUDIO_BUDGET:
        lm_docs_budget = min(len(docs_part), int(LMSTUDIO_BUDGET * 0.35))
        lm_qa_budget = min(len(qa_part), int(LMSTUDIO_BUDGET * 0.35))
        lm_base_budget = max(LMSTUDIO_BUDGET - lm_docs_budget - lm_qa_budget, 0)
        lmstudio_system_prompt = (
            base_part[:lm_base_budget] + "\n\n" + qa_part[:lm_qa_budget] + "\n\n" + docs_part[:lm_docs_budget]
            + "\n\n[...برای مدل محلی (بدون GPU) خیلی کوتاه‌تر شد تا سریع‌تر جواب بده.]"
        )
    else:
        lmstudio_system_prompt = system_prompt

    errors = []

    # 🎚️ ۱۳ اوت ۲۰۲۶: ترتیب زیر دیگه هاردکد نیست — از body.provider_order میاد (پنل مدیریت،
    # تب «آمار» → «اولویت هوش مصنوعی‌ها»). اگه نامعتبر بود، به ترتیب پیش‌فرض برمی‌گرده.
    provider_order = body.get("provider_order")
    if not (isinstance(provider_order, list) and set(provider_order) == set(DEFAULT_PROVIDER_ORDER)):
        provider_order = DEFAULT_PROVIDER_ORDER

    provider_funcs = {
        "groq": lambda: try_groq(messages, groq_system_prompt, request_is_english, rid, t0, errors),
        "lmstudio": lambda: try_lmstudio_relay(messages, lmstudio_system_prompt, rid, t0, errors),
        "gemini": lambda: try_gemini(messages, system_prompt, request_is_english, rid, t0, errors),
        "openrouter": lambda: try_openrouter(messages, system_prompt, request_is_english, rid, t0, errors),
        "cloudflare": lambda: try_cloudflare(messages, system_prompt, rid, t0, errors),
    }

    # 🖥️ ۹ اوت ۲۰۲۶: اگه ادمین «فقط هوش مصنوعی محلی» رو فعال کرده، ترتیب بالا کلاً نادیده گرفته
    # میشه — مستقیم فقط LM Studio امتحان میشه، بدون افتادن توی Groq/Gemini/OpenRouter/Cloudflare.
    if force_lmstudio:
        if not (LMSTUDIO_RELAY_SECRET and (time.time() - lmstudio_last_seen) < 12):
            print(f"⚠️ [{rid} +{time.time()-t0:.1f}s] force_lmstudio active but VM is offline")
            return JSONResponse(status_code=503, content={
                "error": "حالت «فقط هوش مصنوعی محلی» فعاله ولی سرور محلی (VM) الان آنلاین نیست. یا VM رو روشن کنید، یا این حالت رو از پنل مدیریت غیرفعال کنید."
            })
        result = await try_lmstudio_relay(messages, lmstudio_system_prompt, rid, t0, errors)
        if result:
            return result
        # اگه به اینجا رسیدیم یعنی LM Studio هم جواب نداد (empty/timeout) — طبق خواسته‌ی ادمین
        # نباید بریم سراغ بقیه‌ی provider ها، همینجا با خطای روشن متوقف می‌شیم.
        print(f"❌ [{rid} +{time.time()-t0:.1f}s] force_lmstudio failed: {' | '.join(errors)}")
        return JSONResponse(status_code=503, content={"error": f"هوش مصنوعی محلی جواب نداد: {' | '.join(errors)}"})

    # ⛔️ ۱۸ اوت ۲۰۲۶: یه تلاش قبلی برای سرعت‌بخشیدن اینجا بود که همه‌ی providerها رو تقریباً
    # هم‌زمان (با فاصله‌ی کوچیک) رقابت می‌داد — ولی این باعث می‌شد گاهی provider سریع‌تر (نه
    # اولین اولویتِ واقعی توی پنل مدیریت) برنده بشه، که برای ادمین قابل‌قبول نبود: ترتیب
    # provider_order باید قطعی رعایت بشه، نه فقط «تا حد امکان». برگشت به حالت کاملاً پشت‌سرهم:
    # provider بعدی فقط وقتی امتحان می‌شه که provider قبلی (طبق ترتیب دقیق پنل) کامل fail بشه.
    for provider in provider_order:
        result = await provider_funcs[provider]()
        if result:
            return result

    print(f"❌ [{rid} +{time.time()-t0:.1f}s] /chat failed: {' | '.join(errors)}")
    return JSONResponse(status_code=503, content={"error": f"All APIs failed: {' | '.join(errors)}"})
