require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { connectDB } = require("./connectionDB/db");
const quizRoute = require("./routes/quizRoute");

const app = express();
const port = process.env.PORT || 8090;

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/", (req, res) => {
  res.send("✅ exam_be is alive");
});

app.use("/api/quiz", quizRoute);

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`🚀 exam_be running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server", err);
    process.exit(1);
  });
