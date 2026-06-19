import { useState, useRef, useEffect } from "react";

const API_URLS = [
  "https://asbajouri-it-assistant-api.hf.space",
  "https://it-assistant-api.onrender.com",
];

async function fetchWithFallback(path, options) {
  for (const base of API_URLS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(`${base}${path}`, { ...options, signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) return res;
      } catch (e) {
        if (attempt === 1) break;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  throw new Error("هر دو سرور در دسترس نیستند");
}
const ADMIN_PASSWORD = "Sb@332211";
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
    headers: { ...sbHeaders, ...(options.headers || {}) }
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

const BASE_KNOWLEDGE = `تو یک دستیار هوش مصنوعی متخصص IT هستی که برای پشتیبانی کارکنان شرکت Nutricia-MMP طراحی شده‌ای.

قانون مهم: فقط و فقط به زبان فارسی جواب بده. هیچ کاراکتر چینی، ژاپنی، کره‌ای، هندی، ویتنامی یا هر زبان دیگری استفاده نکن. کلمات انگلیسی تخصصی را فقط با حروف استاندارد انگلیسی (a-z, A-Z) بنویس. از هیچ حرف لاتین با علامت‌گذاری (مثل ã، ề، ā) استفاده نکن.

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

همیشه مودب، صبور و حرفه‌ای باش.`;

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
      <div style={{ background: "white", borderRadius: 12, width: "92%", maxWidth: 720, maxHeight: "92vh", overflowY: "auto", direction: "rtl", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "white", zIndex: 10 }}>
          <h2 style={{ margin: 0, color: "#0078d4", fontSize: 18 }}>⚙️ پنل مدیریت</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#666" }}>✕</button>
        </div>

        <div style={{ borderBottom: "1px solid #eee", display: "flex", padding: "0 16px" }}>
          <button style={tabStyle("buttons")} onClick={() => setTab("buttons")}>🔘 دکمه‌های سریع</button>
          <button style={tabStyle("qa")} onClick={() => setTab("qa")}>💬 سوال و جواب اختصاصی</button>
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
  const WELCOME = { role: "assistant", content: "سلام! من دستیار IT شرکت Nutricia-MMP هستم 👋\nهر سوالی درباره ویندوز، دامین، آفیس، شبکه یا درخواست‌های IT دارید بپرسید." };

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

  const buildSystemPrompt = async () => {
    try {
      const customQA = await sbFetch("custom_qa?order=id");
      if (customQA.length === 0) return BASE_KNOWLEDGE;
      const customSection = customQA.map(item => `سوال: ${item.question}\nجواب: ${item.answer}`).join("\n\n");
      return `${BASE_KNOWLEDGE}\n\n=== سوال و جواب‌های اختصاصی شرکت ===\n${customSection}`;
    } catch { return BASE_KNOWLEDGE; }
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
    try {
      const systemPrompt = await buildSystemPrompt();
      const apiMsgs = newMessages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetchWithFallback("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMsgs, system_prompt: systemPrompt }),
      });
      const data = await res.json();
      if (!res.ok || !data.reply) throw new Error(data.error || "خطا از سرور");
      const reply = cleanText(data.reply);
      setMessages([...newMessages, { role: "assistant", content: reply }]);
      if (userId) saveMessage(userId, "assistant", reply);
    } catch (err) {
      setMessages([...newMessages, { role: "assistant", content: `⚠️ خطا در اتصال: ${err.message}` }]);
    } finally { setLoading(false); }
  };

  const handleAdminLogin = () => {
    if (adminPass === ADMIN_PASSWORD) { setShowAdminLogin(false); setShowAdminPanel(true); setAdminPass(""); setAdminError(""); }
    else setAdminError("پسورد اشتباه است");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxHeight: "-webkit-fill-available", background: "#f0f2f5", fontFamily: "'Segoe UI', Tahoma, sans-serif", direction: "rtl", overflow: "hidden" }}>
      <div style={{ background: "linear-gradient(135deg, #0078d4, #005a9e)", color: "white", padding: "16px 20px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🖥️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 17 }}>دستیار IT شرکت Nutricia-MMP</div>
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
          <button key={q.id} onClick={() => sendMessage(q.question)} style={{ padding: "6px 12px", borderRadius: 20, border: "1px solid #0078d4", background: "white", color: "#0078d4", cursor: "pointer", fontSize: 12, fontFamily: "inherit", whiteSpace: "nowrap" }}
            onMouseEnter={e => { e.target.style.background = "#0078d4"; e.target.style.color = "white"; }}
            onMouseLeave={e => { e.target.style.background = "white"; e.target.style.color = "#0078d4"; }}
          >{q.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", touchAction: "pan-y", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-start" : "flex-end", alignItems: "flex-end", gap: 8 }}>
            {msg.role === "assistant" && <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#0078d4", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🖥️</div>}
            <div style={{ maxWidth: "72%", padding: "10px 14px", borderRadius: msg.role === "user" ? "18px 18px 18px 4px" : "18px 18px 4px 18px", background: msg.role === "user" ? "#0078d4" : "#ffffff", color: msg.role === "user" ? "white" : "#1a1a1a", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", direction: "rtl", textAlign: "right" }}>{msg.content}</div>
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
