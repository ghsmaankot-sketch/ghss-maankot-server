// ============================================================
//  GHSS MAANKOT — server.js
//  Node.js + Express + MongoDB + Google Drive HTML Serving
// ============================================================
require("dotenv").config();

const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
const fetch      = require("node-fetch");
const cron       = require("node-cron");
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this';

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// ── MongoDB Connect ──────────────────────────────────────────
if (!process.env.MONGODB_URI) {
  console.error("❌  MONGODB_URI .env mein nahi hai!");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("✅  MongoDB connected — ghss_maankot");
    // Pehli baar admin user banana (ek baar chalta hai)
    const db = mongoose.connection.db;
    const exists = await db.collection('users').findOne({ username: 'admin' });
    if (!exists) {
      const hash = await bcrypt.hash('admin123', 10);
      await db.collection('users').insertOne({
        username: 'admin',
        password: hash,
        name: 'Administrator',
        createdAt: new Date()
      });
      console.log('✅  Admin user bana diya — username: admin | password: admin123');
    }
  })
  .catch((err) => { console.error("❌  MongoDB error:", err.message); process.exit(1); });

// ── Auth Middleware ──────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expire ho gaya, dobara login karein' });
  }
}

// ── Google Drive HTML Fetcher ────────────────────────────────
const CACHE_SECS = parseInt(process.env.HTML_CACHE_SECONDS || "30", 10);
const FILE_ID    = process.env.GDRIVE_HTML_FILE_ID;

function getDriveUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

let htmlCache   = null;
let cacheExpiry = 0;

async function getHtmlFromDrive() {
  if (htmlCache && Date.now() < cacheExpiry) return htmlCache;

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

    const html  = await response.text();
    htmlCache   = html;
    cacheExpiry = Date.now() + CACHE_SECS * 1000;

    console.log(`✅  HTML fetched (${html.length} bytes), cache ${CACHE_SECS}s`);
    return html;
  } catch (err) {
    console.error("❌  Drive fetch error:", err.message);
    if (htmlCache) return htmlCache;
    return fallbackHtml(err.message);
  }
}

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

// ── ROUTES ───────────────────────────────────────────────────

// PUBLIC — Main HTML page
app.get("/", async (req, res) => {
  const html = await getHtmlFromDrive();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
});

// PUBLIC — Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username aur password daalen' });

    const db   = mongoose.connection.db;
    const user = await db.collection('users').findOne({ username });

    if (!user || !await bcrypt.compare(password, user.password))
      return res.status(401).json({ error: 'Username ya password galat hai' });

    const token = jwt.sign(
      { id: user._id.toString(), username: user.username },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, name: user.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUBLIC — Health check
app.get("/health", (req, res) =>
  res.json({ status: "ok", server: "GHSS Maankot", time: new Date().toISOString() })
);

// PUBLIC — Cache refresh
app.post("/refresh-cache", (req, res) => {
  htmlCache   = null;
  cacheExpiry = 0;
  console.log("🔄  HTML cache cleared");
  res.json({ success: true, message: "Cache clear ho gaya" });
});

// PROTECTED — API Routes
app.use("/api/teachers", requireAuth, require("./routes/teachers"));
app.use("/api/students", requireAuth, require("./routes/students"));
app.use("/api/diary",    requireAuth, require("./routes/diary"));
app.use("/api/backup",   requireAuth, require("./routes/backup"));

// PROTECTED — Dashboard Stats
app.get("/api/stats", requireAuth, async (req, res) => {
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

// ── AUTO DAILY BACKUP ────────────────────────────────────────
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

// ── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  GHSS Maankot Server chal raha hai`);
  console.log(`📡  URL: http://localhost:${PORT}`);
  console.log(`🗄️   API: http://localhost:${PORT}/api`);
  console.log(`📄  HTML Drive ID: ${FILE_ID || "NOT SET"}`);
  console.log(`⏱️   Cache: ${CACHE_SECS}s\n`);
});
