const axios = require("axios");
const Question = require("../models/questionModel");
const QuizSession = require("../models/quizSessionModel");
const { extractToken } = require("../middlewares/auth");

const normalizeVtuBaseUrl = (raw) => {
  const base = String(raw || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  if (base.endsWith("/api")) return base;
  return `${base}/api`;
};

const getVtuApi = () => {
  const baseURL = normalizeVtuBaseUrl(process.env.VTU_BE_API_URL);
  return axios.create({
    baseURL,
    timeout: 15_000,
    proxy: false,
  });
};

const ensureAdmin = (req, res) => {
  const role = String(req?.user?.role || "").toLowerCase();
  if (role !== "admin" && role !== "manager") {
    res.status(403).json({ error: "Admin only" });
    return false;
  }
  return true;
};

const normalizeQuestionPayload = (payload) => {
  const subject = typeof payload?.subject === "string" ? payload.subject.toLowerCase().trim() : "";
  const question = typeof payload?.question === "string" ? payload.question.trim() : "";
  const options = Array.isArray(payload?.options) ? payload.options.map((o) => String(o).trim()) : [];
  const correctOption = typeof payload?.correctOption === "string" ? payload.correctOption.trim() : "";

  return { subject, question, options, correctOption };
};

const createQuestion = async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const { subject, question, options, correctOption } = normalizeQuestionPayload(req.body || {});

  if (!subject) return res.status(400).json({ error: "subject is required" });
  if (!question) return res.status(400).json({ error: "question is required" });
  if (!Array.isArray(options) || options.length !== 4) {
    return res.status(400).json({ error: "options must be an array of 4 strings" });
  }
  if (!correctOption) return res.status(400).json({ error: "correctOption is required" });
  if (!options.includes(correctOption)) {
    return res.status(400).json({ error: "correctOption must match one of the options" });
  }

  const created = await Question.create({ subject, question, options, correctOption });
  return res.status(201).json({ ok: true, questionId: created._id });
};

const createQuestionsBulk = async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const items = Array.isArray(req.body?.questions) ? req.body.questions : null;
  if (!items || items.length === 0) return res.status(400).json({ error: "questions array is required" });

  const normalized = items.map(normalizeQuestionPayload);
  for (const q of normalized) {
    if (!q.subject || !q.question) return res.status(400).json({ error: "Each item needs subject and question" });
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      return res.status(400).json({ error: "Each item options must be an array of 4 strings" });
    }
    if (!q.correctOption || !q.options.includes(q.correctOption)) {
      return res.status(400).json({ error: "Each item correctOption must match one of the options" });
    }
  }

  const created = await Question.insertMany(normalized, { ordered: true });
  return res.status(201).json({ ok: true, created: created.length });
};

const listQuestions = async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const subjectRaw = typeof req.query?.subject === "string" ? req.query.subject : "";
  const subject = String(subjectRaw || "").trim().toLowerCase();

  const page = Math.max(1, Number(req.query?.page || 1));
  const limit = Math.min(200, Math.max(1, Number(req.query?.limit || 200)));
  const skip = (page - 1) * limit;

  const filter = {};
  if (subject) filter.subject = subject;

  const [items, total] = await Promise.all([
    Question.find(filter).sort({ subject: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Question.countDocuments(filter),
  ]);

  return res.status(200).json({
    ok: true,
    items,
    total,
    page,
    limit,
  });
};

const updateQuestion = async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id is required" });

  const existing = await Question.findById(id);
  if (!existing) return res.status(404).json({ error: "Question not found" });

  const next = {
    subject:
      typeof req.body?.subject === "string" ? req.body.subject.toLowerCase().trim() : existing.subject,
    question: typeof req.body?.question === "string" ? req.body.question.trim() : existing.question,
    options: Array.isArray(req.body?.options)
      ? req.body.options.map((o) => String(o).trim())
      : existing.options,
    correctOption:
      typeof req.body?.correctOption === "string" ? req.body.correctOption.trim() : existing.correctOption,
  };

  if (!next.subject) return res.status(400).json({ error: "subject is required" });
  if (!next.question) return res.status(400).json({ error: "question is required" });
  if (!Array.isArray(next.options) || next.options.length !== 4) {
    return res.status(400).json({ error: "options must be an array of 4 strings" });
  }
  if (!next.correctOption) return res.status(400).json({ error: "correctOption is required" });
  if (!next.options.includes(next.correctOption)) {
    return res.status(400).json({ error: "correctOption must match one of the options" });
  }

  existing.subject = next.subject;
  existing.question = next.question;
  existing.options = next.options;
  existing.correctOption = next.correctOption;
  await existing.save();

  return res.status(200).json({ ok: true });
};

const deleteQuestion = async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "id is required" });

  const deleted = await Question.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ error: "Question not found" });

  return res.status(200).json({ ok: true });
};

const getLeaderboard = async (req, res) => {
  const subjectRaw = typeof req.query?.subject === "string" ? req.query.subject : "";
  const subject = String(subjectRaw || "").trim().toLowerCase();
  const limit = Math.min(50, Math.max(1, Number(req.query?.limit || 10)));

  const match = {
    status: "submitted",
    score: { $ne: null },
  };
  if (subject) match.subject = subject;

  const rows = await QuizSession.aggregate([
    { $match: match },
    { $sort: { score: -1, submittedAt: 1 } },
    {
      $group: {
        _id: "$userId",
        userId: { $first: "$userId" },
        bestScore: { $first: "$score" },
        totalQuestions: { $first: "$totalQuestions" },
        subject: { $first: "$subject" },
        submittedAt: { $first: "$submittedAt" },
        attempts: { $sum: 1 },
      },
    },
    { $sort: { bestScore: -1, submittedAt: 1 } },
    { $limit: limit },
  ]);

  const items = rows.map((r, idx) => ({
    rank: idx + 1,
    userId: String(r.userId || r._id),
    bestScore: Number(r.bestScore || 0),
    totalQuestions: Number(r.totalQuestions || 0),
    subject: String(r.subject || ""),
    submittedAt: r.submittedAt || null,
    attempts: Number(r.attempts || 0),
  }));

  return res.status(200).json({ ok: true, items });
};



const startSession = async (req, res) => {
  const { subject } = req.body || {};
  if (!subject || typeof subject !== "string") {
    return res.status(400).json({ error: "subject is required" });
  }

  const vtuApi = getVtuApi();
  if (!vtuApi.defaults.baseURL) {
    return res.status(500).json({ error: "VTU_BE_API_URL is not configured" });
  }

  const token = extractToken(req);
  let accessResp;
  try {
    accessResp = await vtuApi.get("/auth/quiz/access", {
      headers: { Authorization: `Bearer ${token}` },
      params: { subject },
    });
  } catch (err) {
    const status = err?.response?.status;
    const message = err?.response?.data?.error || err?.response?.data?.reason;
    if (status === 401 || status === 403) {
      return res.status(status).json({ error: message || "locked" });
    }
    return res.status(502).json({
      error: "Failed to verify quiz access",
      detail: message || err?.message || "unknown",
      vtuBaseURL: vtuApi.defaults.baseURL,
    });
  }

  if (!accessResp?.data?.allowed) {
    return res.status(403).json({ error: accessResp?.data?.reason || "locked" });
  }

  const accessType = accessResp.data.quotaType;

  const questions = await Question.aggregate([
    { $match: { subject: subject.toLowerCase() } },
    { $sample: { size: 10 } },
    { $project: { correctOption: 0, __v: 0 } },
  ]);

  if (!Array.isArray(questions) || questions.length < 10) {
    return res.status(400).json({ error: "Not enough questions for this subject" });
  }

  const questionIds = questions.map((q) => q._id);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const session = await QuizSession.create({
    userId: req.user.id,
    subject: subject.toLowerCase(),
    questionIds,
    accessType,
    expiresAt,
  });

  return res.status(201).json({
    sessionId: session._id,
    subject: session.subject,
    expiresAt: session.expiresAt,
    questions,
    access: {
      quotaType: accessResp.data.quotaType,
      remainingFree: accessResp.data.remainingFree,
      bonusQuestions: accessResp.data.bonusQuestions,
    },
  });
};

const saveAnswer = async (req, res) => {
  const { sessionId } = req.params;
  const { questionId, selectedOption } = req.body || {};

  if (!questionId || !selectedOption) {
    return res.status(400).json({ error: "questionId and selectedOption are required" });
  }

  const session = await QuizSession.findOne({ _id: sessionId, userId: req.user.id });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status !== "active") return res.status(400).json({ error: "Session not active" });
  if (session.expiresAt.getTime() < Date.now()) {
    session.status = "expired";
    await session.save();
    return res.status(400).json({ error: "Session expired" });
  }

  const qid = String(questionId);
  const allowed = session.questionIds.some((id) => String(id) === qid);
  if (!allowed) return res.status(400).json({ error: "Question not in session" });

  const existingIndex = session.answers.findIndex((a) => String(a.questionId) === qid);
  if (existingIndex >= 0) {
    session.answers[existingIndex].selectedOption = selectedOption;
  } else {
    session.answers.push({ questionId, selectedOption });
  }

  await session.save();
  return res.status(200).json({ ok: true });
};

const submitSession = async (req, res) => {
  const { sessionId } = req.params;
  const { answers } = req.body || {};

  const vtuApi = getVtuApi();
  if (!vtuApi.defaults.baseURL) {
    return res.status(500).json({ error: "VTU_BE_API_URL is not configured" });
  }

  const session = await QuizSession.findOne({ _id: sessionId, userId: req.user.id });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status === "submitted") {
    return res.status(200).json({
      score: session.score,
      total: session.totalQuestions,
      status: "already_submitted",
    });
  }
  if (session.expiresAt.getTime() < Date.now()) {
    session.status = "expired";
    await session.save();
    return res.status(400).json({ error: "Session expired" });
  }

  if (Array.isArray(answers)) {
    const allowedSet = new Set(session.questionIds.map((id) => String(id)));
    const normalized = answers
      .filter((a) => a && allowedSet.has(String(a.questionId)) && typeof a.selectedOption === "string")
      .map((a) => ({ questionId: a.questionId, selectedOption: a.selectedOption }));
    session.answers = normalized;
  }

  const questions = await Question.find({ _id: { $in: session.questionIds } }).select(
    "_id correctOption"
  );
  const correctById = new Map(questions.map((q) => [String(q._id), q.correctOption]));

  let score = 0;
  for (const ans of session.answers) {
    const correct = correctById.get(String(ans.questionId));
    if (typeof correct === "string" && correct === ans.selectedOption) score += 1;
  }

  const token = extractToken(req);
  try {
    await vtuApi.post(
      "/auth/quiz/consume",
      { sessionId: String(session._id), quotaType: session.accessType },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch {
    return res.status(502).json({ error: "Failed to consume quiz access" });
  }

  session.score = score;
  session.totalQuestions = session.questionIds.length;
  session.status = "submitted";
  session.submittedAt = new Date();
  await session.save();

  return res.status(200).json({
    score,
    total: session.totalQuestions,
    message: score >= 7 ? "Excellent work" : score >= 4 ? "Good effort" : "Keep practicing",
  });
};

module.exports = {
  startSession,
  saveAnswer,
  submitSession,
  createQuestion,
  createQuestionsBulk,
  listQuestions,
  updateQuestion,
  deleteQuestion,
  getLeaderboard,
};
