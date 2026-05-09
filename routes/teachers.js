const router  = require("express").Router();
const Teacher = require("../models/Teacher");

// GET /api/teachers?search=xyz
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    const query = search
      ? { $or: [
          { name: { $regex: search, $options: "i" } },
          { cnic: { $regex: search, $options: "i" } },
        ]}
      : {};
    const list = await Teacher.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/teachers/:id
router.get("/:id", async (req, res) => {
  try {
    const t = await Teacher.findById(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: "Teacher nahi mila" });
    res.json({ success: true, data: t });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/teachers
router.post("/", async (req, res) => {
  try {
    const t = await Teacher.create(req.body);
    res.json({ success: true, data: t });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/teachers/:id
router.put("/:id", async (req, res) => {
  try {
    const t = await Teacher.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!t) return res.status(404).json({ success: false, error: "Teacher nahi mila" });
    res.json({ success: true, data: t });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/teachers/:id
router.delete("/:id", async (req, res) => {
  try {
    await Teacher.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Teacher delete ho gaya" });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
