const router  = require("express").Router();
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Diary   = require("../models/Diary");

// Google Drive mein JSON file save karta hai
// Returns: { ok: true } ya { ok: false, error: "..." }
async function saveToDrive(filename, data) {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyJson) {
    return { ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON env variable nahi mila" };
  }

  let credentials;
  try {
    credentials = typeof keyJson === "string" ? JSON.parse(keyJson) : keyJson;
  } catch (parseErr) {
    return { ok: false, error: "Service Account JSON parse nahi hua: " + parseErr.message };
  }

  // ✅ FIX #1: Railway mein \n escape ho jaata hai private_key mein
  // Yeh line usse wapas real newlines mein convert karti hai
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  }

  try {
    const { google } = require("googleapis");
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const drive    = google.drive({ version: "v3", auth });
    const content  = JSON.stringify(data, null, 2);
    const folderId = process.env.GDRIVE_BACKUP_FOLDER_ID;

    const meta = { name: filename };
    if (folderId) meta.parents = [folderId];

    await drive.files.create({
      requestBody: meta,
      media: {
        mimeType: "application/json",
        body: require("stream").Readable.from([content]),
      },
    });

    return { ok: true };
  } catch (err) {
    // ✅ FIX #2: Full error message wapas karo — console aur response dono mein
    const msg = err.message || String(err);
    console.error(`❌ Drive backup error [${filename}]:`, msg);
    return { ok: false, error: msg };
  }
}

// POST /api/backup
router.post("/", async (req, res) => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

    const [teachers, students, diary] = await Promise.all([
      Teacher.find({}),
      Student.find({}),
      Diary.find({}),
    ]);

    const [tResult, sResult, dResult] = await Promise.all([
      saveToDrive(`teachers_${stamp}.json`, teachers),
      saveToDrive(`students_${stamp}.json`, students),
      saveToDrive(`diary_${stamp}.json`,    diary),
    ]);

    const allOk = tResult.ok && sResult.ok && dResult.ok;

    // ✅ FIX #2: Agar koi error aaya to uska exact message client ko bhejo
    const driveErrors = [
      !tResult.ok ? `Teachers: ${tResult.error}` : null,
      !sResult.ok ? `Students: ${sResult.error}` : null,
      !dResult.ok ? `Diary: ${dResult.error}`    : null,
    ].filter(Boolean);

    res.json({
      success: true,
      timestamp: stamp,
      counts: {
        teachers: teachers.length,
        students: students.length,
        diary:    diary.length,
      },
      savedToDrive: allOk,
      message: allOk
        ? "✅ Google Drive backup complete!"
        : "⚠️ Backup count ready, lekin Drive pe save nahi hua",
      // Yeh field front-end pe dikhega agar error ho
      driveError: driveErrors.length ? driveErrors.join(" | ") : undefined,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
