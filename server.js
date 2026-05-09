// ============================================================
//  routes/backup.js — GHSS Maankot
//  Google Drive pe Service Account se backup upload karta hai
// ============================================================

const express = require("express");
const router  = express.Router();
const { google } = require("googleapis");
const { Readable } = require("stream");

const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Diary   = require("../models/Diary");

// ── POST /api/backup ─────────────────────────────────────────
router.post("/", async (req, res) => {
  try {

    // ── 1. MongoDB se data fetch karo ─────────────────────────
    const [teachers, students, diary] = await Promise.all([
      Teacher.find().lean(),
      Student.find().lean(),
      Diary.find().lean(),
    ]);

    const counts = {
      teachers: teachers.length,
      students: students.length,
      diary:    diary.length,
    };

    console.log(`📊  Data ready: T:${counts.teachers} S:${counts.students} D:${counts.diary}`);

    // ── 2. Environment variables check karo ───────────────────
    const serviceAccountRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const folderId          = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!serviceAccountRaw) {
      console.warn("⚠️  GOOGLE_SERVICE_ACCOUNT_JSON nahi hai Railway Variables mein");
      return res.json({
        success: false,
        message: `Backup count ready, lekin Drive pe save nahi hua — GOOGLE_SERVICE_ACCOUNT_JSON set karein | T:${counts.teachers} S:${counts.students} D:${counts.diary}`,
        counts,
      });
    }

    if (!folderId) {
      console.warn("⚠️  GOOGLE_DRIVE_FOLDER_ID nahi hai Railway Variables mein");
      return res.json({
        success: false,
        message: `Backup count ready, lekin Drive pe save nahi hua — GOOGLE_DRIVE_FOLDER_ID set karein | T:${counts.teachers} S:${counts.students} D:${counts.diary}`,
        counts,
      });
    }

    // ── 3. Service Account parse karo ─────────────────────────
    let credentials;
    try {
      credentials = JSON.parse(serviceAccountRaw);
    } catch (parseErr) {
      console.error("❌  Service Account JSON parse nahi hua:", parseErr.message);
      return res.status(500).json({
        success: false,
        error: "GOOGLE_SERVICE_ACCOUNT_JSON ka format galat hai — valid JSON hona chahiye",
      });
    }

    // ── 4. Google Drive Auth ───────────────────────────────────
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    const drive = google.drive({ version: "v3", auth });

    // ── 5. Backup JSON banao ───────────────────────────────────
    const now       = new Date();
    const dateStr   = now.toLocaleDateString("en-PK", { timeZone: "Asia/Karachi" }).replace(/\//g, "-");
    const timeStr   = now.toLocaleTimeString("en-PK", { timeZone: "Asia/Karachi", hour12: false }).replace(/:/g, "-");
    const fileName  = `GHSS_Maankot_Backup_${dateStr}_${timeStr}.json`;

    const backupData = {
      exportedAt:  now.toISOString(),
      school:      "GHSS Maankot, Kabirwala",
      generatedBy: "Auto Backup System",
      counts,
      teachers,
      students,
      diary,
    };

    const backupJson = JSON.stringify(backupData, null, 2);

    // ── 6. Stream banao (Buffer se readable stream) ───────────
    const bufferStream = new Readable();
    bufferStream.push(Buffer.from(backupJson, "utf-8"));
    bufferStream.push(null);

    // ── 7. Google Drive pe Upload karo ────────────────────────
    console.log(`📤  Drive pe upload ho raha hai: ${fileName}`);

    const uploadResponse = await drive.files.create({
      requestBody: {
        name:    fileName,
        parents: [folderId],
        mimeType: "application/json",
      },
      media: {
        mimeType: "application/json",
        body:      bufferStream,
      },
      fields: "id, name, size, createdTime",
    });

    const uploadedFile = uploadResponse.data;
    console.log(`✅  Backup uploaded! File: ${uploadedFile.name} | ID: ${uploadedFile.id}`);

    // ── 8. Purane backups delete karo (sirf 7 rakhein) ────────
    try {
      await cleanOldBackups(drive, folderId, 7);
    } catch (cleanErr) {
      console.warn("⚠️  Purane backups clean nahi hue:", cleanErr.message);
      // Is error ki wajah se main response fail nahi karta
    }

    // ── 9. Success response ───────────────────────────────────
    return res.json({
      success:   true,
      message:   `✅ Backup Google Drive pe save ho gaya! | T:${counts.teachers} S:${counts.students} D:${counts.diary}`,
      counts,
      driveFile: {
        id:   uploadedFile.id,
        name: uploadedFile.name,
      },
    });

  } catch (err) {
    console.error("❌  Backup error:", err.message);

    // Drive permission error ka specific message
    if (err.message && err.message.includes("storageQuota")) {
      return res.status(500).json({ success: false, error: "Google Drive mein jagah nahi hai!" });
    }
    if (err.message && err.message.includes("insufficientPermissions")) {
      return res.status(500).json({ success: false, error: "Service account ko folder ka Editor access nahi — Drive folder dobara share karein" });
    }
    if (err.message && err.message.includes("notFound")) {
      return res.status(500).json({ success: false, error: "GOOGLE_DRIVE_FOLDER_ID galat hai ya folder delete ho gaya" });
    }

    return res.status(500).json({
      success: false,
      error:   err.message,
    });
  }
});

// ── Helper: Purane backup files delete karo ──────────────────
//  Drive folder mein sirf `keepCount` naye backups rakhta hai
async function cleanOldBackups(drive, folderId, keepCount = 7) {
  const listResp = await drive.files.list({
    q:         `'${folderId}' in parents and name contains 'GHSS_Maankot_Backup' and trashed=false`,
    orderBy:   "createdTime desc",
    fields:    "files(id, name, createdTime)",
    pageSize:  100,
  });

  const files = listResp.data.files || [];

  if (files.length > keepCount) {
    const toDelete = files.slice(keepCount);
    for (const file of toDelete) {
      await drive.files.delete({ fileId: file.id });
      console.log(`🗑️   Purana backup delete kiya: ${file.name}`);
    }
  }
}

module.exports = router;
