const router  = require("express").Router();
const Student = require("../models/Student");

// Auto registration number generator
async function nextRegNo() {
  const prefix = process.env.SCHOOL_PREFIX || "GHSS-MAANKOT";
  // Sabse last student jo registered tha
  const last = await Student.findOne(
    { registrationNumber: { $exists: true, $ne: "" } },
    {},
    { sort: { createdAt: -1 } }
  );
  if (!last || !last.registrationNumber) return `${prefix}-01`;
  // last number extract karo
  const parts = last.registrationNumber.split("-");
  const num   = parseInt(parts[parts.length - 1], 10) + 1;
  return `${prefix}-${String(num).padStart(2, "0")}`;
}

// GET /api/students?search=xyz
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    const query = search
      ? { $or: [
          { name:               { $regex: search, $options: "i" } },
          { bformNo:            { $regex: search, $options: "i" } },
          { registrationNumber: { $regex: search, $options: "i" } },
        ]}
      : {};
    const list = await Student.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/students/:id
router.get("/:id", async (req, res) => {
  try {
    const s = await Student.findById(req.params.id);
    if (!s) return res.status(404).json({ success: false, error: "Student nahi mila" });
    res.json({ success: true, data: s });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/students  — auto reg number
router.post("/", async (req, res) => {
  try {
    const regNo   = await nextRegNo();
    const student = await Student.create({ ...req.body, registrationNumber: regNo });
    res.json({ success: true, data: student, regNo });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/students/:id
router.put("/:id", async (req, res) => {
  try {
    // Registration number kabhi update nahi hogi
    delete req.body.registrationNumber;
    const s = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!s) return res.status(404).json({ success: false, error: "Student nahi mila" });
    res.json({ success: true, data: s });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/students/:id/leaving-cert  — issue LC
router.post("/:id/leaving-cert", async (req, res) => {
  try {
    const s = await Student.findByIdAndUpdate(
      req.params.id,
      {
        leavingCertIssued: true,
        leavingCertDate:   new Date().toISOString().split("T")[0],
      },
      { new: true }
    );
    if (!s) return res.status(404).json({ success: false, error: "Student nahi mila" });
    res.json({ success: true, data: s });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
