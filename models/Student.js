const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema(
  {
    name:               { type: String, required: true, trim: true },
    fatherName:         { type: String, default: "" },
    bformNo:            { type: String, required: true, trim: true },
    parentName:         { type: String, default: "" },
    parentCnic:         { type: String, default: "" },
    dob:                { type: String, default: "" },
    address:            { type: String, default: "" },
    contact:            { type: String, default: "" },
    class:              { type: String, default: "" },
    registrationNumber: { type: String, unique: true, sparse: true },
    leavingCertIssued:  { type: Boolean, default: false },
    leavingCertDate:    { type: String, default: "" },
    photoData:          { type: String, default: "" },  // base64 image
  },
  { timestamps: true }
);

module.exports = mongoose.model("Student", studentSchema);
