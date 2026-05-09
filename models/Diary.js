const mongoose = require("mongoose");

const diarySchema = new mongoose.Schema(
  {
    subject:         { type: String, required: true, trim: true },
    referenceNumber: { type: String, required: true, trim: true },
    dated:           { type: String, default: "" },
    sourceOffice:    { type: String, default: "" },
    description:     { type: String, default: "" },
    documentData:    { type: String, default: "" },  // base64 PDF/image
    documentName:    { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Diary", diarySchema);
