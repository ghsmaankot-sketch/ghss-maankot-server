const router = require("express").Router();
const Diary  = require("../models/Diary");

// GET /api/diary?search=xyz
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    const query = search
      ? { $or: [
          { subject:         { $regex: search, $options: "i" } },
          { referenceNumber: { $regex: search, $options: "i" } },
          { sourceOffice:    { $regex: search, $options: "i" } },
        ]}
      : {};
    const list = await Diary.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/diary/:id
router.get("/:id", async (req, res) => {
  try {
    const d = await Diary.findById(req.params.id);
    if (!d) return res.status(404).json({ success: false, error: "Entry nahi mili" });
    res.json({ success: true, data: d });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/diary
router.post("/", async (req, res) => {
  try {
    const d = await Diary.create(req.body);
    res.json({ success: true, data: d });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/diary/:id
router.delete("/:id", async (req, res) => {
  try {
    await Diary.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Entry delete ho gayi" });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
