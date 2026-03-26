const express = require("express");
const { authMiddleware } = require("../middlewares/auth");
const {
  startSession,
  saveAnswer,
  submitSession,
  createQuestion,
  createQuestionsBulk,
  listQuestions,
  updateQuestion,
  deleteQuestion,
  getLeaderboard,
} = require("../controllers/quizController");

const router = express.Router();

router.post("/sessions", authMiddleware, startSession);
router.patch("/sessions/:sessionId/answers", authMiddleware, saveAnswer);
router.post("/sessions/:sessionId/submit", authMiddleware, submitSession);
router.get("/leaderboard", authMiddleware, getLeaderboard);
router.get("/questions", authMiddleware, listQuestions);
router.post("/questions", authMiddleware, createQuestion);
router.post("/questions/bulk", authMiddleware, createQuestionsBulk);
router.patch("/questions/:id", authMiddleware, updateQuestion);
router.delete("/questions/:id", authMiddleware, deleteQuestion);

module.exports = router;
