const mongoose = require("mongoose");

const teacherSchema = new mongoose.Schema(
  {
    name:           { type: String, required: true, trim: true },
    fatherName:     { type: String, trim: true, default: "" },
    cnic:           { type: String, required: true, trim: true },
    dob:            { type: String, default: "" },
    joiningGovt:    { type: String, default: "" },
    joiningSchool:  { type: String, default: "" },
    regularization: { type: String, default: "" },
    contact:        { type: String, default: "" },
    education:      { type: String, default: "" },
    professional:   { type: String, default: "" },
    training:       { type: String, default: "" },
    photoData:      { type: String, default: "" },  // base64 image
  },
  { timestamps: true }
);

module.exports = mongoose.model("Teacher", teacherSchema);
