// ============================================================
//  GHSS MAANKOT — server.js
//  Node.js + Express + MongoDB + Google Drive HTML Serving
// ============================================================
require("dotenv").config();

const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const fetch    = require("node-fetch");
const cron     = require("node-cron");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "15mb" }));   // base64 images ke liye bada limit
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// ── MongoDB Connect ──────────────────────────────────────────
if (!process.env.MONGODB_URI) {
  console.error("❌  MONGODB_URI .env mein nahi hai!");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅  MongoDB connected — ghss_maankot"))
  .catch((err) => { console.error("❌  MongoDB error:", err.message); process.exit(1); });

// ── Google Drive HTML Fetcher (with short cache) ─────────────
//
//  Logic:
//  - Aap Drive mein index.html change karo
//  - Node.js har request pr check karta hai k cache expire hua ya nahi
//  - Cache expire hua → Drive se fresh file uthata hai → serve karta hai
//  - HTML_CACHE_SECONDS = 0 → har baar fresh (thoda slow)
//  - HTML_CACHE_SECONDS = 30 → 30 second mein ek baar Drive se fetch
// ──────────────────────────────────────────────────────────────
const CACHE_SECS  = parseInt(process.env.HTML_CACHE_SECONDS || "30", 10);
const FILE_ID     = process.env.GDRIVE_HTML_FILE_ID;

// Drive public export URL
function getDriveUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

let htmlCache    = null;
let cacheExpiry  = 0;

async function getHtmlFromDrive() {
  // Agar cache valid hai to wohi do
  if (htmlCache && Date.now() < cacheExpiry) {
    return htmlCache;
  }

  if (!FILE_ID || FILE_ID === "YOUR_INDEX_HTML_FILE_ID_HERE") {
    return fallbackHtml();
  }

  try {
    console.log("📥  Drive se fresh HTML fetch ho rahi hai...");
    const response = await fetch(getDriveUrl(FILE_ID), {
      headers: { "Cache-Control": "no-cache" },
      redirect: "follow",
      timeout: 10000,
    });

    if (!response.ok) throw new Error(`Drive HTTP ${response.status}`);

    const html = await response.text();

    // Cache update karo
    htmlCache   = html;
    cacheExpiry = Date.now() + CACHE_SECS * 1000;

    console.log(`✅  HTML fetched (${html.length} bytes), cache ${CACHE_SECS}s`);
    return html;
  } catch (err) {
    console.error("❌  Drive fetch error:", err.message);
    // Agar cache mein kuch tha to wohi do (stale but better than nothing)
    if (htmlCache) return htmlCache;
    return fallbackHtml(err.message);
  }
}

// ── Fallback HTML (jab Drive ID set nahi ya error ho) ────────
function fallbackHtml(errMsg = "") {
  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>GHSS Maankot Setup</title>
<style>
  body{font-family:sans-serif;background:#1a237e;color:#fff;display:flex;align-items:center;
       justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center}
  .box{background:rgba(255,255,255,.1);border-radius:16px;padding:32px 24px;max-width:420px}
  h2{margin-bottom:12px;font-size:22px}
  p{line-height:1.7;font-size:14px;opacity:.85}
  .err{background:#e53935;border-radius:8px;padding:10px;margin-top:14px;font-size:13px}
  code{background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px}
</style>
</head><body><div class="box">
  <h2>🏫 GHSS Maankot Server</h2>
  <p>Server chal raha hai! ✅<br/>
  Lekin <strong>Google Drive HTML file</strong> abhi set nahi hui.<br/><br/>
  <strong>Steps:</strong><br/>
  1. <code>index.html</code> Drive pr upload karo<br/>
  2. <strong>Anyone with link</strong> access do<br/>
  3. File ID <code>.env</code> mein <code>GDRIVE_HTML_FILE_ID</code> mein dalo<br/>
  4. Server restart karo</p>
  ${errMsg ? `<div class="err">Error: ${errMsg}</div>` : ""}
</div></body></html>`;
}

// ── MAIN ROUTE — Drive se HTML serve karo ────────────────────
app.get("/", async (req, res) => {
  const html = await getHtmlFromDrive();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");  // browser cache nahi kare
  res.send(html);
});

// Cache force refresh endpoint (agar foran Drive change dekhna ho)
app.post("/refresh-cache", (req, res) => {
  htmlCache   = null;
  cacheExpiry = 0;
  console.log("🔄  HTML cache cleared");
  res.json({ success: true, message: "Cache clear ho gaya, agli request mein Drive se fresh HTML milegi" });
});

// ── API ROUTES ────────────────────────────────────────────────
app.use("/api/teachers", require("./routes/teachers"));
app.use("/api/students", require("./routes/students"));
app.use("/api/diary",    require("./routes/diary"));
app.use("/api/backup",   require("./routes/backup"));

// Dashboard stats
app.get("/api/stats", async (req, res) => {
  try {
    const Teacher = require("./models/Teacher");
    const Student = require("./models/Student");
    const Diary   = require("./models/Diary");
    const [t, s, d] = await Promise.all([
      Teacher.countDocuments(),
      Student.countDocuments(),
      Diary.countDocuments(),
    ]);
    res.json({ success: true, teachers: t, students: s, diary: d });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Health check (Render/Railway ke liye)
app.get("/health", (req, res) =>
  res.json({ status: "ok", server: "GHSS Maankot", time: new Date().toISOString() })
);

// ── AUTO DAILY BACKUP — raat 11 baje (Pakistan time) ─────────
cron.schedule("0 23 * * *", async () => {
  try {
    console.log("🔄  Auto daily backup shuru...");
    const resp = await fetch(`http://localhost:${PORT}/api/backup`, { method: "POST" });
    const data = await resp.json();
    console.log("✅  Auto backup:", JSON.stringify(data.counts));
  } catch (err) {
    console.error("❌  Auto backup error:", err.message);
  }
}, { timezone: "Asia/Karachi" });

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  GHSS Maankot Server chal raha hai`);
  console.log(`📡  URL: http://localhost:${PORT}`);
  console.log(`🗄️   API: http://localhost:${PORT}/api`);
  console.log(`📄  HTML Drive ID: ${FILE_ID || "NOT SET (set GDRIVE_HTML_FILE_ID in .env)"}`);
  console.log(`⏱️   Cache: ${CACHE_SECS}s\n`);
});
