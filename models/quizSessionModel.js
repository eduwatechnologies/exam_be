const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
  {
    questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    selectedOption: { type: String, required: true },
  },
  { _id: false }
);

const quizSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    subject: { type: String, required: true, index: true },
    questionIds: { type: [mongoose.Schema.Types.ObjectId], required: true },
    answers: { type: [answerSchema], default: [] },
    status: { type: String, enum: ["active", "submitted", "expired"], default: "active" },
    accessType: { type: String, enum: ["subscription", "bonus", "free"], required: true },
    score: { type: Number, default: null },
    totalQuestions: { type: Number, default: null },
    expiresAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuizSession", quizSessionSchema);
