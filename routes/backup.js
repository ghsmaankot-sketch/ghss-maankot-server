const router  = require("express").Router();
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Diary   = require("../models/Diary");

// Google Drive mein JSON file save karta hai
async function saveToDrive(filename, data) {
  try {
    const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!keyJson) { console.log("Service account nahi mila, Drive backup skip"); return false; }

    const { google } = require("googleapis");
    const credentials = typeof keyJson === "string" ? JSON.parse(keyJson) : keyJson;
    const auth = new google.auth.GoogleAuth({
      credentials,
     scopes: ["https://www.googleapis.com/auth/drive"]
    });
    const drive   = google.drive({ version: "v3", auth });
    const content = JSON.stringify(data, null, 2);
    const folderId = process.env.GDRIVE_BACKUP_FOLDER_ID;

    const meta = { name: filename };
    if (folderId) meta.parents = [folderId];

    await drive.files.create({
      requestBody: meta,
      media: {
        mimeType: "application/json",
        body:     require("stream").Readable.from([content]),
      },
    });
    return true;
  } catch (err) {
    console.error("Drive backup error:", err.message);
    return false;
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

    const driveResults = await Promise.all([
      saveToDrive(`teachers_${stamp}.json`, teachers),
      saveToDrive(`students_${stamp}.json`, students),
      saveToDrive(`diary_${stamp}.json`,    diary),
    ]);

    res.json({
      success: true,
      timestamp: stamp,
      counts: { teachers: teachers.length, students: students.length, diary: diary.length },
      savedToDrive: driveResults.every(Boolean),
      message: driveResults.every(Boolean)
        ? "Google Drive backup complete!"
        : "Backup count ready, lekin Drive pe save nahi hua (service account check karein)",
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
