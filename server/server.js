require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL;
const CANVAS_ACCESS_TOKEN = process.env.CANVAS_ACCESS_TOKEN;

if (!CANVAS_BASE_URL || !CANVAS_ACCESS_TOKEN) {
  console.warn(
    "WARNING: Missing CANVAS_BASE_URL or CANVAS_ACCESS_TOKEN in .env. Canvas integration will not work."
  );
}

const canvasApi = axios.create({
  baseURL: `${CANVAS_BASE_URL}/api/v1`,
  headers: {
    Authorization: `Bearer ${CANVAS_ACCESS_TOKEN}`
  }
});

async function fetchAllPages(url, params = {}) {
  let results = [];
  let nextUrl = url;
  let nextParams = { per_page: 50, ...params };

  while (nextUrl) {
    const res = await canvasApi.get(nextUrl, { params: nextParams });
    results = results.concat(res.data);

    const link = res.headers.link;
    if (!link) break;

    const matches = link.split(",").map(s => s.trim());
    const next = matches.find(s => s.includes('rel="next"'));
    if (next) {
      const urlPart = next.split(";")[0].trim().replace(/[<>]/g, "");
      nextUrl = urlPart.replace(`${CANVAS_BASE_URL}/api/v1`, "");
      nextParams = {};
    } else {
      nextUrl = null;
    }
  }

  return results;
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "School Organizer server running" });
});

app.get("/api/canvas/courses", async (req, res) => {
  if (!CANVAS_BASE_URL || !CANVAS_ACCESS_TOKEN) {
    return res
      .status(500)
      .json({ error: "Canvas not configured on server (.env missing)" });
  }

  try {
    const courses = await fetchAllPages("/courses", {
      enrollment_state: "active",
      include: ["term"]
    });

    const simplified = courses
      .filter(c => !c.access_restricted_by_date)
      .map(c => ({
        id: c.id,
        name: c.name || c.course_code || `Course ${c.id}`,
        term: c.term ? c.term.name : null
      }));

    res.json({ courses: simplified });
  } catch (err) {
    console.error("Error fetching Canvas courses:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch courses from Canvas" });
  }
});

app.get("/api/canvas/assignments", async (req, res) => {
  if (!CANVAS_BASE_URL || !CANVAS_ACCESS_TOKEN) {
    return res
      .status(500)
      .json({ error: "Canvas not configured on server (.env missing)" });
  }

  try {
    const courses = await fetchAllPages("/courses", {
      enrollment_state: "active",
      include: ["term"]
    });

    const simplifiedCourses = [];
    const tasks = [];

    for (const c of courses) {
      if (c.access_restricted_by_date) continue;

      const localCourseId = `canvas_${c.id}`;
      simplifiedCourses.push({
        id: localCourseId,
        name: c.name || c.course_code || `Course ${c.id}`,
        credits: 3,
        canvasId: c.id,
        term: c.term ? c.term.name : null
      });

      try {
        const assignments = await fetchAllPages(`/courses/${c.id}/assignments`, {
          include: ["submission"]
        });

        for (const a of assignments) {
          if (!a.due_at) continue;

          const nameLower = (a.name || "").toLowerCase();
          let type = "homework";
          if (nameLower.includes("quiz") || nameLower.includes("test") || nameLower.includes("exam")) {
            type = "exam";
          } else if (nameLower.includes("project") || nameLower.includes("lab")) {
            type = "project";
          }

          tasks.push({
            id: `canvas_task_${a.id}`,
            title: a.name || `Assignment ${a.id}`,
            courseId: localCourseId,
            type,
            due: a.due_at,
            estimateHours: null,
            completed: !!a.has_submitted_submissions,
            steps: []
          });
        }
      } catch (innerErr) {
        console.error(
          `Error fetching assignments for course ${c.id}:`,
          innerErr.response?.data || innerErr.message
        );
      }
    }

    res.json({ courses: simplifiedCourses, tasks });
  } catch (err) {
    console.error("Error in /api/canvas/assignments:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch Canvas assignments" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
