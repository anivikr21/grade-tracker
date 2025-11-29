// ====== DATA & STORAGE ======
const STORAGE_KEY = "school_organizer_v1";

let state = {
  courses: [],
  tasks: [],
  grades: [],
  // For selecting task when managing steps
  selectedTaskId: null
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}

// Simple id generator
function makeId(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 9);
}

// ====== GPA HELPERS ======
const GPA_SCALE = [
  { letter: "A", min: 93, value: 4.0 },
  { letter: "A-", min: 90, value: 3.7 },
  { letter: "B+", min: 87, value: 3.3 },
  { letter: "B", min: 83, value: 3.0 },
  { letter: "B-", min: 80, value: 2.7 },
  { letter: "C+", min: 77, value: 2.3 },
  { letter: "C", min: 73, value: 2.0 },
  { letter: "C-", min: 70, value: 1.7 },
  { letter: "D", min: 60, value: 1.0 },
  { letter: "F", min: 0, value: 0.0 }
];

function percentToLetterAndGpa(pct) {
  if (pct == null || isNaN(pct)) {
    return { letter: "-", gpa: null };
  }
  for (const row of GPA_SCALE) {
    if (pct >= row.min) return { letter: row.letter, gpa: row.value };
  }
  return { letter: "F", gpa: 0.0 };
}

// Get weighted course percent from grade items
function getCoursePercent(courseId, overridePercent = null) {
  if (overridePercent != null) return overridePercent;
  const items = state.grades.filter(g => g.courseId === courseId);
  if (items.length === 0) return null;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const g of items) {
    const weight = Number(g.weight) || 0;
    const pct = Number(g.percent);
    if (!isNaN(pct) && weight > 0) {
      totalWeight += weight;
      weightedSum += pct * (weight / 100);
    }
  }

  if (totalWeight === 0) {
    // If no weights, average simple %s
    const valid = items.filter(g => !isNaN(Number(g.percent)));
    if (!valid.length) return null;
    const sum = valid.reduce((acc, g) => acc + Number(g.percent), 0);
    return sum / valid.length;
  }

  return weightedSum;
}

// Overall GPA
function computeGpa(perCourseOverride = {}) {
  let sumGpaTimesCredits = 0;
  let sumCredits = 0;

  for (const c of state.courses) {
    const pct = getCoursePercent(c.id, perCourseOverride[c.id]);
    const { gpa } = percentToLetterAndGpa(pct);
    if (gpa != null && c.credits > 0) {
      sumGpaTimesCredits += gpa * c.credits;
      sumCredits += c.credits;
    }
  }

  if (sumCredits === 0) return null;
  return sumGpaTimesCredits / sumCredits;
}

// ====== DOM HELPERS ======
function $(id) {
  return document.getElementById(id);
}

function formatDateTime(dtStr) {
  if (!dtStr) return "";
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return dtStr;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function daysUntil(dtStr) {
  const now = new Date();
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return null;
  const diffMs = d - now;
  return diffMs / (1000 * 60 * 60 * 24);
}

// ====== NAV ======
function initNav() {
  const buttons = document.querySelectorAll(".nav-btn");
  const views = document.querySelectorAll(".view");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.view;
      views.forEach(v => {
        v.classList.toggle("active", v.id === "view-" + target);
      });
      // some views need re-render
      renderAll();
    });
  });
}

// ====== COURSES ======
function renderCourses() {
  const courseSelects = [
    $("task-course"),
    $("task-filter-course"),
    $("grade-course"),
    $("whatif-course")
  ];

  courseSelects.forEach(sel => {
    if (!sel) return;
    const preserveValue = sel.value;
    sel.innerHTML = "";
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = sel.id === "task-filter-course" ? "All courses" : "Select course";
    sel.appendChild(defaultOpt);

    for (const c of state.courses) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.credits} cr)`;
      sel.appendChild(opt);
    }

    if ([...sel.options].some(o => o.value === preserveValue)) {
      sel.value = preserveValue;
    }
  });

  const list = $("course-list");
  list.innerHTML = "";
  state.courses.forEach(c => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div class="list-item-header">
        <strong>${c.name}</strong>
        <span class="small">${c.credits} credits</span>
      </div>
      <div>
        <button class="btn-inline" data-action="edit-course" data-id="${c.id}">Edit</button>
        <button class="btn-inline" data-action="delete-course" data-id="${c.id}">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });

  list.onclick = e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    const c = state.courses.find(c => c.id === id);
    if (!c) return;

    if (btn.dataset.action === "edit-course") {
      $("course-id").value = c.id;
      $("course-name").value = c.name;
      $("course-credits").value = c.credits;
    } else if (btn.dataset.action === "delete-course") {
      if (confirm("Delete this course? Related tasks/grades will remain.")) {
        state.courses = state.courses.filter(x => x.id !== id);
        saveState();
      }
    }
  };
}

function initCourseForm() {
  $("course-form").addEventListener("submit", e => {
    e.preventDefault();
    const id = $("course-id").value || makeId("course");
    const name = $("course-name").value.trim();
    const credits = Number($("course-credits").value) || 0;

    if (!name) return;

    const existingIdx = state.courses.findIndex(c => c.id === id);
    if (existingIdx >= 0) {
      state.courses[existingIdx].name = name;
      state.courses[existingIdx].credits = credits;
    } else {
      state.courses.push({ id, name, credits });
    }

    $("course-id").value = "";
    $("course-name").value = "";
    $("course-credits").value = 3;
    saveState();
  });

  $("course-reset").addEventListener("click", () => {
    $("course-id").value = "";
    $("course-name").value = "";
    $("course-credits").value = 3;
  });
}

// ====== TASKS ======
function badgeClassForType(type) {
  if (type === "homework") return "badge-homework";
  if (type === "project") return "badge-project";
  if (type === "exam") return "badge-exam";
  return "";
}

function renderTasks() {
  const filterCourse = $("task-filter-course").value;
  const filterType = $("task-filter-type").value;

  const list = $("task-list");
  list.innerHTML = "";

  const sorted = [...state.tasks].sort((a, b) => new Date(a.due) - new Date(b.due));

  for (const t of sorted) {
    if (filterCourse && t.courseId !== filterCourse) continue;
    if (filterType && t.type !== filterType) continue;

    const course = state.courses.find(c => c.id === t.courseId);
    const days = daysUntil(t.due);
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div class="list-item-header">
        <div>
          <strong>${t.title}</strong>
          <span class="badge ${badgeClassForType(t.type)}">${t.type}</span>
          ${t.completed ? '<span class="tag">Done</span>' : ""}
        </div>
        <div class="small">${formatDateTime(t.due)}</div>
      </div>
      <div class="small">
        ${course ? course.name : "No course"} 
        ${days != null ? ` • Due in ${days.toFixed(1)} days` : ""}
      </div>
      <div>
        <button class="btn-inline" data-action="select-task" data-id="${t.id}">Steps</button>
        <button class="btn-inline" data-action="toggle-done" data-id="${t.id}">
          ${t.completed ? "Mark Not Done" : "Mark Done"}
        </button>
        <button class="btn-inline" data-action="edit-task" data-id="${t.id}">Edit</button>
        <button class="btn-inline" data-action="delete-task" data-id="${t.id}">Delete</button>
      </div>
    `;
    list.appendChild(li);
  }

  list.onclick = e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    const t = state.tasks.find(t => t.id === id);
    if (!t) return;

    switch (btn.dataset.action) {
      case "edit-task":
        $("task-id").value = t.id;
        $("task-title").value = t.title;
        $("task-course").value = t.courseId || "";
        $("task-type").value = t.type;
        $("task-due").value = t.due;
        $("task-estimate").value = t.estimateHours || "";
        $("task-auto-steps").checked = false;
        break;
      case "delete-task":
        if (confirm("Delete this task?")) {
          state.tasks = state.tasks.filter(x => x.id !== id);
          if (state.selectedTaskId === id) state.selectedTaskId = null;
          saveState();
        }
        break;
      case "toggle-done":
        t.completed = !t.completed;
        saveState();
        break;
      case "select-task":
        state.selectedTaskId = id;
        renderSteps();
        break;
    }
  };
}

function initTaskForm() {
  $("task-form").addEventListener("submit", e => {
    e.preventDefault();
    const id = $("task-id").value || makeId("task");
    const title = $("task-title").value.trim();
    const courseId = $("task-course").value || null;
    const type = $("task-type").value;
    const due = $("task-due").value;
    const estimateHours = $("task-estimate").value
      ? Number($("task-estimate").value)
      : null;
    const autoSteps = $("task-auto-steps").checked;

    if (!title || !due) return;

    let task = state.tasks.find(t => t.id === id);
    if (!task) {
      task = {
        id,
        title,
        courseId,
        type,
        due,
        estimateHours,
        completed: false,
        steps: []
      };
      state.tasks.push(task);
    } else {
      task.title = title;
      task.courseId = courseId;
      task.type = type;
      task.due = due;
      task.estimateHours = estimateHours;
    }

    if (autoSteps && (!task.steps || task.steps.length === 0) && estimateHours && estimateHours >= 2) {
      task.steps = generateStepsForTask(task);
    }

    scheduleReminder(task);
    state.selectedTaskId = task.id;

    $("task-id").value = "";
    $("task-title").value = "";
    $("task-course").value = "";
    $("task-type").value = "homework";
    $("task-due").value = "";
    $("task-estimate").value = "";
    $("task-auto-steps").checked = true;

    saveState();
  });

  $("task-reset").addEventListener("click", () => {
    $("task-id").value = "";
    $("task-title").value = "";
    $("task-course").value = "";
    $("task-type").value = "homework";
    $("task-due").value = "";
    $("task-estimate").value = "";
    $("task-auto-steps").checked = true;
  });

  $("task-filter-type").addEventListener("change", renderTasks);
  $("task-filter-course").addEventListener("change", renderTasks);
}

// Break big assignments into steps
function generateStepsForTask(task) {
  const steps = [
    "Research / Read instructions",
    "Outline or plan",
    "Draft / first attempt",
    "Edit / finalize & submit"
  ];
  const now = new Date();
  const due = new Date(task.due);
  const totalMs = due - now;
  return steps.map((title, idx) => ({
    id: makeId("step"),
    title,
    done: false,
    // optional intermediate due date
    subDue:
      totalMs > 0
        ? new Date(now.getTime() + (totalMs * (idx + 1)) / steps.length).toISOString()
        : null
  }));
}

// Simple in-session reminder (does NOT persist after reload)
function scheduleReminder(task) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
  if (Notification.permission !== "granted") return;

  const due = new Date(task.due);
  const now = new Date();
  const msUntil = due - now - 60 * 60 * 1000; // 1 hour before due
  if (msUntil <= 0) return;

  setTimeout(() => {
    new Notification("Task reminder", {
      body: `${task.title} is due at ${due.toLocaleString()}`
    });
  }, msUntil);
}

// ====== STEPS ======
function renderSteps() {
  const container = $("steps-list");
  const titleEl = $("steps-task-title");
  container.innerHTML = "";

  const t = state.tasks.find(t => t.id === state.selectedTaskId);
  if (!t) {
    titleEl.textContent = "No task selected.";
    $("step-task-id").value = "";
    return;
  }

  titleEl.textContent = t.title;
  $("step-task-id").value = t.id;

  if (!t.steps || t.steps.length === 0) {
    const p = document.createElement("p");
    p.className = "small";
    p.textContent = "No steps yet. Add some below!";
    container.appendChild(p);
    return;
  }

  t.steps.forEach(step => {
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div>
        <label>
          <input type="checkbox" data-stepId="${step.id}" ${
      step.done ? "checked" : ""
    } />
          <span class="${step.done ? "step-done" : ""}">${step.title}</span>
        </label>
        ${
          step.subDue
            ? `<div class="small">Target: ${formatDateTime(step.subDue)}</div>`
            : ""
        }
      </div>
    `;
    container.appendChild(li);
  });

  container.onchange = e => {
    if (e.target.tagName !== "INPUT") return;
    const stepId = e.target.dataset.stepid;
    const step = t.steps.find(s => s.id === stepId);
    if (!step) return;
    step.done = e.target.checked;
    saveState();
  };
}

function initStepForm() {
  $("step-form").addEventListener("submit", e => {
    e.preventDefault();
    const taskId = $("step-task-id").value;
    const title = $("step-title").value.trim();
    if (!taskId || !title) return;
    const t = state.tasks.find(t => t.id === taskId);
    if (!t) return;
    if (!t.steps) t.steps = [];
    t.steps.push({
      id: makeId("step"),
      title,
      done: false,
      subDue: null
    });
    $("step-title").value = "";
    saveState();
  });
}

// ====== GRADES ======
function renderGrades() {
  const list = $("grade-list");
  list.innerHTML = "";
  const items = [...state.grades];

  for (const g of items) {
    const course = state.courses.find(c => c.id === g.courseId);
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div class="list-item-header">
        <strong>${g.name}</strong>
        <span class="small">${g.percent != null ? g.percent + "%" : "No score"}</span>
      </div>
      <div class="small">
        ${course ? course.name : "No course"} • 
        ${g.category || "Uncategorized"} • Weight: ${g.weight || 0}%
      </div>
      <div>
        <button class="btn-inline" data-action="edit-grade" data-id="${g.id}">Edit</button>
        <button class="btn-inline" data-action="delete-grade" data-id="${g.id}">Delete</button>
      </div>
    `;
    list.appendChild(li);
  }

  list.onclick = e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    const g = state.grades.find(x => x.id === id);
    if (!g) return;
    if (btn.dataset.action === "edit-grade") {
      $("grade-id").value = g.id;
      $("grade-course").value = g.courseId || "";
      $("grade-name").value = g.name;
      $("grade-category").value = g.category || "";
      $("grade-weight").value = g.weight || "";
      $("grade-percent").value = g.percent || "";
    } else if (btn.dataset.action === "delete-grade") {
      if (confirm("Delete this grade item?")) {
        state.grades = state.grades.filter(x => x.id !== id);
        saveState();
      }
    }
  };
}

function initGradeForm() {
  $("grade-form").addEventListener("submit", e => {
    e.preventDefault();
    const id = $("grade-id").value || makeId("grade");
    const courseId = $("grade-course").value || null;
    const name = $("grade-name").value.trim();
    const category = $("grade-category").value.trim();
    const weight = $("grade-weight").value ? Number($("grade-weight").value) : 0;
    const percent = $("grade-percent").value
      ? Number($("grade-percent").value)
      : null;

    if (!name) return;

    const existing = state.grades.find(g => g.id === id);
    if (existing) {
      existing.courseId = courseId;
      existing.name = name;
      existing.category = category;
      existing.weight = weight;
      existing.percent = percent;
    } else {
      state.grades.push({ id, courseId, name, category, weight, percent });
    }

    $("grade-id").value = "";
    $("grade-course").value = "";
    $("grade-name").value = "";
    $("grade-category").value = "";
    $("grade-weight").value = "";
    $("grade-percent").value = "";

    saveState();
  });

  $("grade-reset").addEventListener("click", () => {
    $("grade-id").value = "";
    $("grade-course").value = "";
    $("grade-name").value = "";
    $("grade-category").value = "";
    $("grade-weight").value = "";
    $("grade-percent").value = "";
  });
}

// ====== GPA RENDERING ======
function renderGpaSummary() {
  const pSummary = $("gpa-summary");
  const gpa = computeGpa() ?? null;

  if (gpa == null) {
    pSummary.textContent = "Add courses with credits and grade items to see GPA.";
    $("gpa-display").textContent = "No grades yet.";
    return;
  }

  const perCourseLines = state.courses.map(c => {
    const pct = getCoursePercent(c.id);
    const { letter } = percentToLetterAndGpa(pct);
    return `${c.name}: ${pct != null ? pct.toFixed(1) + "%" : "N/A"} (${letter})`;
  });

  pSummary.textContent =
    `Overall GPA: ${gpa.toFixed(2)}\n` + perCourseLines.join(" | ");

  $("gpa-display").textContent = `Overall GPA: ${gpa.toFixed(2)}`;
}

// ====== WHAT-IF ======
function initWhatIf() {
  $("whatif-form").addEventListener("submit", e => {
    e.preventDefault();
    const courseId = $("whatif-course").value;
    const pct = Number($("whatif-percent").value);
    if (!courseId || isNaN(pct)) return;

    const override = { [courseId]: pct };
    const gpa = computeGpa(override);
    const { letter } = percentToLetterAndGpa(pct);
    if (gpa == null) {
      $("whatif-result").textContent =
        "Add credits/grades for at least one course to compute GPA.";
      return;
    }
    const course = state.courses.find(c => c.id === courseId);
    $("whatif-result").textContent =
      `If ${course ? course.name : "this course"} ended at ${pct.toFixed(
        1
      )}% (${letter}), your overall GPA would be ${gpa.toFixed(2)}.`;
  });
}

// ====== DASHBOARD UPCOMING TASKS ======
function renderDashboard() {
  const days = Number($("dashboard-days").value) || 3;
  const list = $("dashboard-upcoming");
  list.innerHTML = "";

  const now = new Date();
  const max = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const upcoming = state.tasks
    .filter(t => {
      const d = new Date(t.due);
      return d >= now && d <= max && !t.completed;
    })
    .sort((a, b) => new Date(a.due) - new Date(b.due));

  if (upcoming.length === 0) {
    const li = document.createElement("li");
    li.className = "small";
    li.textContent = "No tasks due soon 🎉";
    list.appendChild(li);
    return;
  }

  for (const t of upcoming) {
    const course = state.courses.find(c => c.id === t.courseId);
    const li = document.createElement("li");
    li.className = "list-item";
    li.innerHTML = `
      <div class="list-item-header">
        <strong>${t.title}</strong>
        <span class="badge ${badgeClassForType(t.type)}">${t.type}</span>
      </div>
      <div class="small">
        ${course ? course.name : "No course"} • ${formatDateTime(t.due)}
      </div>
    `;
    list.appendChild(li);
  }
}

function initDashboard() {
  $("dashboard-days").addEventListener("change", renderDashboard);
}

// ====== INTEGRATIONS (SIMULATED) ======
function initIntegrations() {
  $("btn-import-google").addEventListener("click", () => {
    simulateImport("Google Classroom");
  });
  $("btn-import-canvas").addEventListener("click", () => {
    simulateImport("Canvas");
  });
  $("btn-clear-all").addEventListener("click", () => {
    if (!confirm("This will erase all courses, tasks, and grades. Continue?")) return;
    state = { courses: [], tasks: [], grades: [], selectedTaskId: null };
    saveState();
  });
}

function simulateImport(source) {
  // In a real app, call backend -> Google/Classroom APIs.
  const demoCourseId = makeId("course");
  state.courses.push({ id: demoCourseId, name: `${source} Sample Course`, credits: 3 });

  const demoTaskId = makeId("task");
  const due = new Date();
  due.setDate(due.getDate() + 5);
  state.tasks.push({
    id: demoTaskId,
    title: `${source} Assignment 1`,
    courseId: demoCourseId,
    type: "homework",
    due: due.toISOString().slice(0, 16),
    estimateHours: 2,
    completed: false,
    steps: generateStepsForTask({
      title: `${source} Assignment 1`,
      due: due.toISOString(),
      estimateHours: 2
    })
  });

  $("integration-status").textContent = `Imported example course & assignment from ${source}.`;
  saveState();
}

// ====== RENDER ALL ======
function renderAll() {
  renderCourses();
  renderTasks();
  renderSteps();
  renderGrades();
  renderGpaSummary();
  renderDashboard();
}

// ====== INIT ======
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  initNav();
  initCourseForm();
  initTaskForm();
  initStepForm();
  initGradeForm();
  initWhatIf();
  initDashboard();
  initIntegrations();
  renderAll();
});
