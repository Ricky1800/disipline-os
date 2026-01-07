/* DISCIPLINE_OS V7 — professional single-file app
   - Offline localStorage
   - Versioned schema with migration
   - Habits CRUD + reorder + enable
   - Day entries: habits, workouts, notes, submitted lock
   - Workout generator (no equipment) using goal + weight delta + duration
   - Weekly recap + monthly heatmap
   - Undo + toast + confirm modal
*/

const APP_VERSION = 7;
const STORAGE_KEY = "dos_v7_state";

const Util = {
  iso(d) {
    const x = new Date(d);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },
  parseIso(iso) {
    return new Date(iso + "T00:00:00");
  },
  pretty(iso) {
    const d = Util.parseIso(iso);
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  },
  dowShort(iso) {
    const d = Util.parseIso(iso);
    return d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  },
  clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  },
  uid() {
    return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
  },
  pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  },
  toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 1400);
  }
};

const Defaults = {
  version: APP_VERSION,
  theme: "dark",
  privacyMode: false,
  monthOffset: 0,
  statusLabels: {
    good: "🔥 LOCKED IN",
    mid: "😐 SLIPPING",
    bad: "🚨 BROKE DISCIPLINE"
  },
  scoring: { threshold: 6 },
  profile: {
    goal: "fat_loss",
    currentWeight: 180,
    goalWeight: 165,
    duration: 25,
    autoWorkoutHabit: true
  },
  habits: [
    { id: "h-workout", name: "Workout", enabled: true },
    { id: "h-grind", name: "Grind / Money", enabled: true },
    { id: "h-deep", name: "Deep Work", enabled: true },
    { id: "h-sleep", name: "Sleep ≥ 7h", enabled: true },
    { id: "h-noporn", name: "No Porn", enabled: true },
    { id: "h-nomast", name: "No Masturbation", enabled: true }
  ],
  entries: {
    // "YYYY-MM-DD": { submitted:false, note:"", habits:{[id]:bool}, workouts:[{id,name,prescription,done}] }
  },
  undo: null
};

const Store = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(Defaults);
      const s = JSON.parse(raw);
      return Store.migrate(s);
    } catch {
      return structuredClone(Defaults);
    }
  },
  save(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  },
  migrate(s) {
    // Soft-merge defaults and ensure shape
    const merged = structuredClone(Defaults);
    Object.assign(merged, s);

    // merge nested objects
    merged.statusLabels = {
      ...Defaults.statusLabels,
      ...(s.statusLabels || {})
    };
    merged.scoring = { ...Defaults.scoring, ...(s.scoring || {}) };
    merged.profile = { ...Defaults.profile, ...(s.profile || {}) };

    if (!Array.isArray(merged.habits) || merged.habits.length === 0) {
      merged.habits = structuredClone(Defaults.habits);
    } else {
      merged.habits = merged.habits.map((h) => ({
        id: h.id || Util.uid(),
        name: (h.name || "Habit").trim(),
        enabled: typeof h.enabled === "boolean" ? h.enabled : true
      }));
    }

    merged.entries = merged.entries || {};
    merged.version = APP_VERSION;

    return merged;
  }
};

const App = {
  state: Store.load(),
  selectedDate: Util.iso(new Date()),
  tab: "today",

  activeHabits() {
    return App.state.habits.filter((h) => h.enabled);
  },

  ensureEntry(iso) {
    const s = App.state;
    if (!s.entries[iso]) {
      const habits = {};
      s.habits.forEach((h) => (habits[h.id] = false));
      s.entries[iso] = { submitted: false, note: "", habits, workouts: [] };
    } else {
      const e = s.entries[iso];
      e.habits = e.habits || {};
      s.habits.forEach((h) => {
        if (typeof e.habits[h.id] !== "boolean") e.habits[h.id] = false;
      });
      if (typeof e.submitted !== "boolean") e.submitted = false;
      if (typeof e.note !== "string") e.note = "";
      if (!Array.isArray(e.workouts)) e.workouts = [];
    }
    return s.entries[iso];
  },

  score(iso) {
    const e = App.ensureEntry(iso);
    const active = App.activeHabits();
    return active.reduce((acc, h) => acc + (e.habits[h.id] ? 1 : 0), 0);
  },

  statusFor(score) {
    const t = App.state.scoring.threshold;
    if (score >= t) return { cls: "good", text: App.state.statusLabels.good };
    if (score >= Math.max(1, t - 2))
      return { cls: "mid", text: App.state.statusLabels.mid };
    return { cls: "bad", text: App.state.statusLabels.bad };
  },

  setUndo(snapshot) {
    App.state.undo = snapshot;
    Store.save(App.state);
  },

  undo() {
    if (!App.state.undo) return Util.toast("Nothing to undo");
    App.state = Store.migrate(App.state.undo);
    App.state.undo = null;
    Store.save(App.state);
    Util.toast("Undone");
    App.renderAll();
  }
};

const UI = {
  $: (id) => document.getElementById(id),

  modal: {
    el: () => UI.$("modal"),
    title: () => UI.$("modalTitle"),
    text: () => UI.$("modalText"),
    yes: () => UI.$("modalYes"),
    no: () => UI.$("modalNo"),
    show(title, text, onYes) {
      UI.modal.title().textContent = title;
      UI.modal.text().textContent = text;
      const m = UI.modal.el();
      m.classList.add("show");
      m.setAttribute("aria-hidden", "false");

      const cleanup = () => {
        UI.modal.yes().onclick = null;
        UI.modal.no().onclick = null;
        m.classList.remove("show");
        m.setAttribute("aria-hidden", "true");
      };

      UI.modal.yes().onclick = () => {
        cleanup();
        onYes?.();
      };
      UI.modal.no().onclick = () => cleanup();
    }
  }
};

// ---------- Workout Generator (no equipment) ----------
const Workout = {
  buildPlan(profile) {
    const goal = profile.goal;
    const dur = Number(profile.duration) || 25;
    const cw = Number(profile.currentWeight) || 180;
    const gw = Number(profile.goalWeight) || 165;

    const delta = cw - gw; // positive = cutting, negative = gaining
    const intensityBias =
      goal === "fat_loss"
        ? "high"
        : goal === "endurance"
        ? "medium_high"
        : "medium";

    const warmups = [
      "Jumping jacks",
      "High knees",
      "Butt kicks",
      "Arm circles",
      "Inchworms",
      "Hip openers",
      "Shadow boxing"
    ];
    const pushes = [
      "Push-ups",
      "Incline push-ups (hands on couch)",
      "Knee push-ups",
      "Pike push-ups"
    ];
    const legs = [
      "Bodyweight squats",
      "Reverse lunges",
      "Split squats",
      "Wall sit",
      "Glute bridges"
    ];
    const core = [
      "Plank",
      "Dead bug",
      "Bicycle crunches",
      "Leg raises",
      "Mountain climbers"
    ];
    const cardio = [
      "Burpees (low-impact ok)",
      "Skaters",
      "Fast step-ups (stairs)",
      "Shadow boxing combos",
      "Squat-to-reach (fast)"
    ];

    // smart-ish defaults
    const rounds = dur <= 15 ? 3 : dur <= 25 ? 4 : 5;
    const work =
      intensityBias === "high" ? 40 : intensityBias === "medium_high" ? 35 : 30;
    const rest = intensityBias === "high" ? 20 : 25;

    // tweak by weight delta (if cutting hard, keep it slightly more conditioning)
    const finisher =
      goal === "muscle" && delta < 0
        ? "Tempo squats (slow down) — 2 min"
        : goal === "fat_loss" && delta > 10
        ? "EMOM 6: 6 burpees (or 10 squat-to-reach)"
        : goal === "endurance"
        ? "8 min steady shadow boxing"
        : "2 min plank + 2 min wall sit";

    const plan = {
      title: `No-Equipment Plan • ${dur} min`,
      meta: `Goal: ${goal.replace(
        "_",
        " "
      )} • ${cw}→${gw} lbs • Rounds ${rounds} • ${work}s on / ${rest}s off`,
      items: [
        {
          name: "Warmup",
          prescription: `Pick 2: ${Util.pick(warmups)} + ${Util.pick(
            warmups
          )} • 4–5 min`,
          done: false
        },
        {
          name: Util.pick(pushes),
          prescription: `${rounds} rounds • ${work}s work`,
          done: false
        },
        {
          name: Util.pick(legs),
          prescription: `${rounds} rounds • ${work}s work`,
          done: false
        },
        {
          name: Util.pick(core),
          prescription: `${rounds} rounds • ${work}s work`,
          done: false
        },
        {
          name: Util.pick(cardio),
          prescription: `${rounds} rounds • ${work}s work`,
          done: false
        },
        { name: "Rest", prescription: `${rest}s between moves`, done: false },
        { name: "Finisher", prescription: finisher, done: false },
        {
          name: "Cooldown",
          prescription: "Hamstrings + hips + chest opener • 3–5 min",
          done: false
        }
      ]
    };
    return plan;
  }
};

// ---------- Rendering ----------
App.renderAll = function () {
  App.renderTabs();
  App.renderToday();
  App.renderWeek();
  App.renderMonth();
  App.renderWorkoutsTab();
  App.renderSettings();
};

App.renderTabs = function () {
  document.querySelectorAll(".tab").forEach((btn) => {
    const t = btn.dataset.tab;
    btn.classList.toggle("active", t === App.tab);
  });
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("show"));
  document.getElementById(`tab-${App.tab}`).classList.add("show");
};

App.renderToday = function () {
  const iso = App.selectedDate;
  const e = App.ensureEntry(iso);
  const active = App.activeHabits();
  const score = App.score(iso);
  const max = active.length;
  const st = App.statusFor(score);

  UI.$("todayLabel").textContent = Util.pretty(iso);
  UI.$("scoreNow").textContent = score;
  UI.$("scoreMax").textContent = max;

  const dayState = UI.$("dayState");
  dayState.textContent = e.submitted ? "✅ SUBMITTED (LOCKED)" : "✍️ EDITABLE";
  dayState.style.borderColor = e.submitted
    ? "rgba(34,197,94,.35)"
    : "var(--stroke)";

  UI.$("subtitle").textContent = st.text;

  UI.$("lockHint").textContent = e.submitted
    ? "This day is locked. Unlock if you *must* correct it."
    : "Tap toggles. Then SUBMIT DAY to lock it.";

  UI.$("dayNote").value = e.note || "";

  // habits list
  const list = UI.$("habits");
  list.innerHTML = "";

  active.forEach((h) => {
    const row = document.createElement("div");
    row.className = "habit";

    const left = document.createElement("div");
    left.className = "hLeft";

    const name = document.createElement("div");
    name.className = "hName";
    name.textContent = App.state.privacyMode ? "• • •" : h.name;

    const meta = document.createElement("div");
    meta.className = "hMeta";
    meta.textContent = e.submitted
      ? e.habits[h.id]
        ? "Done • LOCKED"
        : "Missed • LOCKED"
      : e.habits[h.id]
      ? "Done"
      : "Not done";

    left.append(name, meta);

    const right = document.createElement("div");
    right.className = "hRight";

    const streak = document.createElement("div");
    streak.className = "streak";
    streak.textContent = `Streak: ${App.habitStreak(h.id)}`;

    const toggle = document.createElement("div");
    toggle.className =
      "toggle" + (e.habits[h.id] ? " on" : "") + (e.submitted ? " locked" : "");
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", e.habits[h.id] ? "true" : "false");

    const knob = document.createElement("div");
    knob.className = "knob";
    toggle.appendChild(knob);

    toggle.onclick = () => {
      if (e.submitted) return;
      App.setUndo(structuredClone(App.state));
      e.habits[h.id] = !e.habits[h.id];
      Store.save(App.state);
      App.applyAutoWorkoutHabit();
      App.renderAll();
    };

    right.append(streak, toggle);
    row.append(left, right);
    list.appendChild(row);
  });

  // workout render
  App.renderWorkoutForDay();

  // streaks overall
  const { current, best } = App.overallStreaks();
  UI.$("overallStreak").textContent = current;
  UI.$("bestStreak").textContent = best;
};

App.habitStreak = function (habitId) {
  let streak = 0;
  let cursor = Util.parseIso(App.selectedDate);
  while (true) {
    const iso = Util.iso(cursor);
    const e = App.state.entries[iso];
    if (!e || !e.habits || e.habits[habitId] !== true) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

App.overallStreaks = function () {
  const t = App.state.scoring.threshold;
  const dates = Object.keys(App.state.entries).sort();
  if (dates.length === 0) return { current: 0, best: 0 };

  const ok = new Set();
  dates.forEach((d) => {
    if (App.score(d) >= t) ok.add(d);
  });

  const prev = (iso) => {
    const d = Util.parseIso(iso);
    d.setDate(d.getDate() - 1);
    return Util.iso(d);
  };

  let cur = 0;
  let cursor = App.selectedDate;
  while (ok.has(cursor)) {
    cur++;
    cursor = prev(cursor);
  }

  let best = 0,
    run = 0;
  const start = Util.parseIso(dates[0]);
  const end = Util.parseIso(dates[dates.length - 1]);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = Util.iso(d);
    if (ok.has(iso)) {
      run++;
      best = Math.max(best, run);
    } else run = 0;
  }

  return { current: cur, best };
};

// ----- Workout per day -----
App.renderWorkoutForDay = function () {
  const iso = App.selectedDate;
  const e = App.ensureEntry(iso);
  const meta = UI.$("workoutMeta");
  const list = UI.$("workoutList");

  const prof = App.state.profile;
  const hint = UI.$("autoWorkoutHint");
  hint.textContent = prof.autoWorkoutHabit
    ? "Auto-workout habit: ON (when all workout items are done)"
    : "Auto-workout habit: OFF";

  if (e.workouts.length === 0) {
    meta.textContent = "No workout saved for this day.";
    list.innerHTML = "";
    return;
  }

  meta.textContent = e.workoutTitle
    ? `${e.workoutTitle} • ${e.workoutMeta || ""}`
    : `Workout saved • ${e.workouts.length} items`;

  list.innerHTML = "";
  e.workouts.forEach((w) => {
    const row = document.createElement("div");
    row.className = "wItem";

    const left = document.createElement("div");
    left.className = "wLeft";
    const n = document.createElement("div");
    n.className = "wName";
    n.textContent = w.name;
    const d = document.createElement("div");
    d.className = "wDesc";
    d.textContent = w.prescription || "";
    left.append(n, d);

    const right = document.createElement("div");
    right.className = "wActions";

    const check = document.createElement("button");
    check.className = "chip wCheck";
    check.textContent = w.done ? "✓ Done" : "○ Do";
    check.onclick = () => {
      if (e.submitted) return Util.toast("Day is locked");
      App.setUndo(structuredClone(App.state));
      w.done = !w.done;
      Store.save(App.state);
      App.applyAutoWorkoutHabit();
      App.renderAll();
    };

    const del = document.createElement("button");
    del.className = "wDel";
    del.textContent = "Delete";
    del.onclick = () => {
      if (e.submitted) return Util.toast("Day is locked");
      UI.modal.show(
        "Delete workout item?",
        "This removes it from today.",
        () => {
          App.setUndo(structuredClone(App.state));
          e.workouts = e.workouts.filter((x) => x.id !== w.id);
          Store.save(App.state);
          App.applyAutoWorkoutHabit();
          App.renderAll();
        }
      );
    };

    right.append(check, del);
    row.append(left, right);
    list.appendChild(row);
  });
};

App.applyAutoWorkoutHabit = function () {
  const prof = App.state.profile;
  if (!prof.autoWorkoutHabit) return;
  const iso = App.selectedDate;
  const e = App.ensureEntry(iso);

  // find habit called "Workout" (enabled or not)
  const workoutHabit = App.state.habits.find(
    (h) => h.name.toLowerCase().trim() === "workout"
  );
  if (!workoutHabit) return;

  if (e.workouts.length === 0) return;
  const allDone = e.workouts.every((w) => w.done);
  if (typeof e.habits[workoutHabit.id] === "boolean") {
    e.habits[workoutHabit.id] = allDone;
  }
};

// ---------- Week ----------
App.startOfWeek = function (iso) {
  const d = Util.parseIso(iso);
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  return Util.iso(d);
};

App.renderWeek = function () {
  const weekEl = UI.$("week");
  if (!weekEl) return;

  const startIso = App.startOfWeek(App.selectedDate);
  const base = Util.parseIso(startIso);
  const dates = [];

  weekEl.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = Util.iso(d);
    dates.push(iso);

    const e = App.ensureEntry(iso);
    const score = App.score(iso);
    const max = App.activeHabits().length;
    const st = App.statusFor(score);

    const card = document.createElement("div");
    card.className = "day";

    const top = document.createElement("div");
    top.className = "dayTop";
    const name = document.createElement("div");
    name.className = "dayName";
    name.textContent = Util.dowShort(iso);
    const num = document.createElement("div");
    num.className = "dayNum";
    num.textContent = iso.slice(8);
    top.append(name, num);

    const badge = document.createElement("div");
    badge.className =
      "badge " +
      (st.cls === "good" ? "bGood" : st.cls === "mid" ? "bMid" : "bBad");
    badge.textContent = `${score}/${max}` + (e.submitted ? " ✓" : "");

    card.append(top, badge);

    if (iso === App.selectedDate) {
      card.style.outline = "2px solid rgba(255,255,255,.22)";
    }

    card.onclick = () => {
      App.selectedDate = iso;
      App.tab = "today";
      App.renderAll();
    };

    weekEl.appendChild(card);
  }

  App.renderWeekRecap(dates);
};

App.renderWeekRecap = function (weekDates) {
  const recap = UI.$("weekRecap");
  const totals = UI.$("weekTotals");
  if (!recap || !totals) return;

  const active = App.activeHabits();
  const max = active.length;

  let submitted = 0;
  let totalScore = 0;
  let best = { iso: null, score: -1 };
  let worst = { iso: null, score: 999 };

  const perHabit = Object.fromEntries(active.map((h) => [h.id, 0]));

  weekDates.forEach((iso) => {
    const e = App.ensureEntry(iso);
    const s = App.score(iso);
    totalScore += s;
    if (e.submitted) submitted++;

    if (s > best.score) best = { iso, score: s };
    if (s < worst.score) worst = { iso, score: s };

    active.forEach((h) => {
      if (e.habits[h.id]) perHabit[h.id]++;
    });
  });

  const avg = (totalScore / 7).toFixed(1);

  recap.innerHTML = "";
  const boxes = [
    { t: "Weekly average", v: `${avg}/${max}`, s: `Submitted: ${submitted}/7` },
    {
      t: "Best day",
      v: best.iso ? `${Util.dowShort(best.iso)} ${best.score}/${max}` : "—",
      s: best.iso ? best.iso : ""
    },
    {
      t: "Worst day",
      v: worst.iso ? `${Util.dowShort(worst.iso)} ${worst.score}/${max}` : "—",
      s: worst.iso ? worst.iso : ""
    },
    {
      t: "Locked-in days",
      v: `${
        weekDates.filter((d) => App.score(d) >= App.state.scoring.threshold)
          .length
      }/7`,
      s: `Threshold: ${App.state.scoring.threshold}`
    }
  ];

  boxes.forEach((b) => {
    const el = document.createElement("div");
    el.className = "recapBox";
    el.innerHTML = `<div class="recapTitle">${b.t}</div><div class="recapVal">${b.v}</div><div class="mini">${b.s}</div>`;
    recap.appendChild(el);
  });

  totals.innerHTML = "";
  const ordered = active
    .map((h) => ({ name: h.name, count: perHabit[h.id] }))
    .sort((a, b) => b.count - a.count);

  ordered.forEach((x) => {
    const row = document.createElement("div");
    row.className = "totalRow";
    row.innerHTML = `<b>${App.state.privacyMode ? "• • •" : x.name}</b><span>${
      x.count
    }/7</span>`;
    totals.appendChild(row);
  });
};

// ---------- Month ----------
App.renderMonth = function () {
  const heatmap = UI.$("heatmap");
  const title = UI.$("monthTitle");
  if (!heatmap || !title) return;

  const now = new Date();
  const view = new Date(
    now.getFullYear(),
    now.getMonth() + App.state.monthOffset,
    1
  );
  title.textContent = view.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });

  heatmap.innerHTML = "";

  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const pad = (first.getDay() + 6) % 7; // Monday=0

  for (let i = 0; i < pad; i++) {
    const c = document.createElement("div");
    c.className = "cell pad";
    heatmap.appendChild(c);
  }

  const days = new Date(year, month + 1, 0).getDate();
  const max = App.activeHabits().length || 1;

  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const iso = Util.iso(date);
    const score = App.score(iso);
    const ratio = score / max;

    let lvl = "0";
    if (ratio === 0) lvl = "0";
    else if (ratio < 0.34) lvl = "1";
    else if (ratio < 0.67) lvl = "2";
    else if (ratio < 0.9) lvl = "3";
    else lvl = "4";

    const c = document.createElement("div");
    c.className = "cell";
    c.dataset.lvl = lvl;
    c.title = `${iso} • ${score}/${max}`;
    c.onclick = () => {
      App.selectedDate = iso;
      App.tab = "today";
      App.renderAll();
    };
    heatmap.appendChild(c);
  }
};

// ---------- Workouts tab ----------
App.renderWorkoutsTab = function () {
  const p = App.state.profile;
  UI.$("profileGoal").value = p.goal;
  UI.$("profileCurrentWeight").value = p.currentWeight;
  UI.$("profileGoalWeight").value = p.goalWeight;
  UI.$("profileDuration").value = String(p.duration);
  UI.$("autoWorkoutHabit").checked = !!p.autoWorkoutHabit;

  const plan = App.buildReminderPlan();
  UI.$("reminderPlan").textContent = plan;
};

App.buildReminderPlan = function () {
  const p = App.state.profile;
  return [
    "iPhone Reminder Plan (Apple Shortcuts Automations)",
    "",
    "Goal: " + p.goal.replace("_", " "),
    "Suggested schedule:",
    "1) 8:00 AM — Notification: “Open Discipline_OS and plan your day”",
    "2) 1:00 PM — Notification: “Midday check: Grind + Deep Work”",
    "3) 6:00 PM — Notification: “Workout time (open app + generate plan)”",
    "4) 9:30 PM — Notification: “Finish checklist + SUBMIT DAY”",
    "",
    "How to set:",
    "Shortcuts app → Automation → Create Personal Automation → Time of Day → Add Action → Show Notification → Text above.",
    "",
    "Pro tip:",
    "Pin the app to Home Screen (Safari → Share → Add to Home Screen) so opening is 1 tap."
  ].join("\n");
};

// ---------- Settings ----------
App.renderSettings = function () {
  UI.$("threshold").value = App.state.scoring.threshold;
  UI.$(
    "statusLabels"
  ).value = `${App.state.statusLabels.good} | ${App.state.statusLabels.mid} | ${App.state.statusLabels.bad}`;

  const mgr = UI.$("habitManager");
  mgr.innerHTML = "";

  App.state.habits.forEach((h, idx) => {
    const row = document.createElement("div");
    row.className = "hRow";

    const input = document.createElement("input");
    input.value = h.name;
    input.onchange = () => {
      App.setUndo(structuredClone(App.state));
      h.name = input.value.trim() || "Habit";
      Store.save(App.state);
      App.renderAll();
      Util.toast("Renamed");
    };

    const btns = document.createElement("div");
    btns.className = "hBtns";

    const toggle = document.createElement("button");
    toggle.className = "smallBtn";
    toggle.textContent = h.enabled ? "Enabled" : "Disabled";
    toggle.onclick = () => {
      App.setUndo(structuredClone(App.state));
      h.enabled = !h.enabled;
      Store.save(App.state);
      App.renderAll();
    };

    const up = document.createElement("button");
    up.className = "smallBtn";
    up.textContent = "↑";
    up.onclick = () => {
      if (idx === 0) return;
      App.setUndo(structuredClone(App.state));
      [App.state.habits[idx - 1], App.state.habits[idx]] = [
        App.state.habits[idx],
        App.state.habits[idx - 1]
      ];
      Store.save(App.state);
      App.renderAll();
    };

    const down = document.createElement("button");
    down.className = "smallBtn";
    down.textContent = "↓";
    down.onclick = () => {
      if (idx === App.state.habits.length - 1) return;
      App.setUndo(structuredClone(App.state));
      [App.state.habits[idx + 1], App.state.habits[idx]] = [
        App.state.habits[idx],
        App.state.habits[idx + 1]
      ];
      Store.save(App.state);
      App.renderAll();
    };

    const del = document.createElement("button");
    del.className = "smallBtn";
    del.textContent = "Delete";
    del.onclick = () => {
      UI.modal.show(
        "Delete habit?",
        "This removes it from the habit list (old history remains).",
        () => {
          App.setUndo(structuredClone(App.state));
          App.state.habits = App.state.habits.filter((x) => x.id !== h.id);
          Store.save(App.state);
          App.renderAll();
          Util.toast("Deleted");
        }
      );
    };

    btns.append(toggle, up, down, del);
    row.append(input, btns);
    mgr.appendChild(row);
  });
};

// ---------- Actions / Events ----------
function bindEvents() {
  // tabs
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.onclick = () => {
      App.tab = btn.dataset.tab;
      App.renderAll();
    };
  });

  // theme
  UI.$("btnTheme").onclick = () => {
    App.state.theme = App.state.theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute(
      "data-theme",
      App.state.theme === "light" ? "light" : "dark"
    );
    Store.save(App.state);
    Util.toast("Theme updated");
  };

  // privacy mode
  UI.$("btnPrivacy").onclick = () => {
    App.state.privacyMode = !App.state.privacyMode;
    Store.save(App.state);
    Util.toast(App.state.privacyMode ? "Privacy mode ON" : "Privacy mode OFF");
    App.renderAll();
  };

  // export (top)
  UI.$("btnExportTop").onclick = () => exportJSON();

  // day navigation
  UI.$("btnPrevDay").onclick = () => {
    const d = Util.parseIso(App.selectedDate);
    d.setDate(d.getDate() - 1);
    App.selectedDate = Util.iso(d);
    App.renderAll();
  };
  UI.$("btnNextDay").onclick = () => {
    const d = Util.parseIso(App.selectedDate);
    d.setDate(d.getDate() + 1);
    App.selectedDate = Util.iso(d);
    App.renderAll();
  };

  // copy yesterday
  UI.$("btnCopyYesterday").onclick = () => {
    const e = App.ensureEntry(App.selectedDate);
    if (e.submitted) return Util.toast("Day locked");
    const d = Util.parseIso(App.selectedDate);
    d.setDate(d.getDate() - 1);
    const yIso = Util.iso(d);
    const y = App.ensureEntry(yIso);

    UI.modal.show(
      "Copy yesterday?",
      "This overwrites today’s habit toggles with yesterday’s.",
      () => {
        App.setUndo(structuredClone(App.state));
        Object.keys(e.habits).forEach((k) => (e.habits[k] = !!y.habits[k]));
        Store.save(App.state);
        App.renderAll();
        Util.toast("Copied");
      }
    );
  };

  // submit day
  UI.$("btnSubmitDay").onclick = () => {
    const e = App.ensureEntry(App.selectedDate);
    if (e.submitted) return Util.toast("Already submitted");
    UI.modal.show(
      "Submit day?",
      "This locks the day. You can still unlock later (with confirmation).",
      () => {
        App.setUndo(structuredClone(App.state));
        e.submitted = true;
        Store.save(App.state);
        App.renderAll();
        Util.toast("Day submitted");
      }
    );
  };

  // unlock
  UI.$("btnUnlockDay").onclick = () => {
    const e = App.ensureEntry(App.selectedDate);
    if (!e.submitted) return Util.toast("Day is already editable");
    UI.modal.show(
      "Unlock day?",
      "Unlocking allows edits. Use this only to correct mistakes.",
      () => {
        App.setUndo(structuredClone(App.state));
        e.submitted = false;
        Store.save(App.state);
        App.renderAll();
        Util.toast("Unlocked");
      }
    );
  };

  // reset day
  UI.$("btnResetDay").onclick = () => {
    const iso = App.selectedDate;
    const e = App.ensureEntry(iso);
    if (e.submitted) return Util.toast("Unlock first");
    UI.modal.show(
      "Reset this day?",
      "Clears habits, note, and workouts for this date.",
      () => {
        App.setUndo(structuredClone(App.state));
        Object.keys(e.habits).forEach((k) => (e.habits[k] = false));
        e.note = "";
        e.workouts = [];
        e.workoutTitle = "";
        e.workoutMeta = "";
        Store.save(App.state);
        App.renderAll();
        Util.toast("Day reset");
      }
    );
  };

  // save note
  UI.$("btnSaveNote").onclick = () => {
    const e = App.ensureEntry(App.selectedDate);
    if (e.submitted) return Util.toast("Day locked");
    App.setUndo(structuredClone(App.state));
    e.note = UI.$("dayNote").value || "";
    Store.save(App.state);
    Util.toast("Note saved");
  };

  // workout generate
  UI.$("btnGenWorkout").onclick = () => generateWorkoutForSelectedDay();
  UI.$("btnGenWorkoutFromTab").onclick = () => generateWorkoutForSelectedDay();

  // clear workout
  UI.$("btnClearWorkout").onclick = () => {
    const e = App.ensureEntry(App.selectedDate);
    if (e.submitted) return Util.toast("Day locked");
    UI.modal.show(
      "Clear workout?",
      "Removes all workout items for this day.",
      () => {
        App.setUndo(structuredClone(App.state));
        e.workouts = [];
        e.workoutTitle = "";
        e.workoutMeta = "";
        Store.save(App.state);
        App.renderAll();
        Util.toast("Workout cleared");
      }
    );
  };

  // add manual workout item
  UI.$("btnAddWorkout").onclick = () => {
    const e = App.ensureEntry(App.selectedDate);
    if (e.submitted) return Util.toast("Day locked");
    const val = (UI.$("manualWorkout").value || "").trim();
    if (!val) return Util.toast("Type an item first");
    App.setUndo(structuredClone(App.state));
    e.workouts.push({
      id: Util.uid(),
      name: val,
      prescription: "",
      done: false
    });
    UI.$("manualWorkout").value = "";
    Store.save(App.state);
    App.renderAll();
    Util.toast("Workout item added");
  };

  // month navigation
  UI.$("btnPrevMonth").onclick = () => {
    App.state.monthOffset -= 1;
    Store.save(App.state);
    App.renderAll();
  };
  UI.$("btnNextMonth").onclick = () => {
    App.state.monthOffset += 1;
    Store.save(App.state);
    App.renderAll();
  };

  // this week
  UI.$("btnThisWeek").onclick = () => {
    App.selectedDate = Util.iso(new Date());
    App.renderAll();
    Util.toast("Jumped to this week");
  };

  // profile save
  UI.$("btnSaveProfile").onclick = () => {
    App.setUndo(structuredClone(App.state));
    const p = App.state.profile;
    p.goal = UI.$("profileGoal").value;
    p.currentWeight = Util.clamp(
      Number(UI.$("profileCurrentWeight").value || 180),
      50,
      600
    );
    p.goalWeight = Util.clamp(
      Number(UI.$("profileGoalWeight").value || 165),
      50,
      600
    );
    p.duration = Number(UI.$("profileDuration").value || 25);
    p.autoWorkoutHabit = UI.$("autoWorkoutHabit").checked;
    Store.save(App.state);
    App.renderAll();
    Util.toast("Profile saved");
  };

  // reminder plan
  UI.$("btnCopyReminderPlan").onclick = async () => {
    const text = App.buildReminderPlan();
    try {
      await navigator.clipboard.writeText(text);
      Util.toast("Reminder plan copied");
    } catch {
      Util.toast("Copy failed (iOS sometimes blocks). Select + copy manually.");
    }
  };

  // habits add
  UI.$("btnAddHabit").onclick = () => {
    const name = (UI.$("newHabitName").value || "").trim();
    if (!name) return Util.toast("Enter a habit name");
    App.setUndo(structuredClone(App.state));
    App.state.habits.push({ id: Util.uid(), name, enabled: true });
    UI.$("newHabitName").value = "";
    Store.save(App.state);
    App.renderAll();
    Util.toast("Habit added");
  };

  // settings save
  UI.$("btnSaveSettings").onclick = () => {
    App.setUndo(structuredClone(App.state));
    const t = Number(UI.$("threshold").value || 6);
    App.state.scoring.threshold = Util.clamp(t, 1, 50);

    const labels = (UI.$("statusLabels").value || "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    if (labels.length >= 3) {
      App.state.statusLabels = {
        good: labels[0],
        mid: labels[1],
        bad: labels[2]
      };
    }

    Store.save(App.state);
    App.renderAll();
    Util.toast("Settings saved");
  };

  // templates
  UI.$("btnApplyTemplate").onclick = () => {
    UI.modal.show(
      "Apply template?",
      "This replaces your habits list with a preset.",
      () => {
        App.setUndo(structuredClone(App.state));
        const templates = [
          {
            name: "Beginner",
            threshold: 4,
            habits: [
              "Workout",
              "Deep Work",
              "Sleep ≥ 7h",
              "No Porn",
              "Walk 20m",
              "Read 15m"
            ]
          },
          {
            name: "Standard",
            threshold: 6,
            habits: [
              "Workout",
              "Grind / Money",
              "Deep Work",
              "Sleep ≥ 7h",
              "No Porn",
              "No Masturbation",
              "Meditation"
            ]
          },
          {
            name: "Hard Mode",
            threshold: 7,
            habits: [
              "Workout",
              "Grind / Money",
              "Deep Work",
              "Sleep ≥ 8h",
              "No Porn",
              "No Masturbation",
              "Cold Shower",
              "No Junk Food"
            ]
          }
        ];
        const t = Util.pick(templates);
        App.state.scoring.threshold = t.threshold;
        App.state.habits = t.habits.map((n) => ({
          id: Util.uid(),
          name: n,
          enabled: true
        }));
        Store.save(App.state);
        App.renderAll();
        Util.toast(`Template: ${t.name}`);
      }
    );
  };

  // export/import/reset
  UI.$("btnExport").onclick = () => exportJSON();
  UI.$("btnImport").addEventListener("change", importJSON);
  UI.$("btnResetAll").onclick = () => {
    UI.modal.show("RESET ALL DATA?", "This wipes everything. No undo.", () => {
      localStorage.removeItem(STORAGE_KEY);
      App.state = Store.load();
      App.selectedDate = Util.iso(new Date());
      document.documentElement.setAttribute(
        "data-theme",
        App.state.theme === "light" ? "light" : "dark"
      );
      App.renderAll();
      Util.toast("Reset complete");
    });
  };

  // keyboard shortcuts (desktop)
  window.addEventListener("keydown", (e) => {
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      App.undo();
    }
    if (e.key === "ArrowLeft") {
      /* prev day */
    }
  });
}

function generateWorkoutForSelectedDay() {
  const e = App.ensureEntry(App.selectedDate);
  if (e.submitted) return Util.toast("Day locked");

  const plan = Workout.buildPlan(App.state.profile);
  App.setUndo(structuredClone(App.state));

  e.workouts = plan.items.map((it) => ({
    id: Util.uid(),
    name: it.name,
    prescription: it.prescription,
    done: false
  }));
  e.workoutTitle = plan.title;
  e.workoutMeta = plan.meta;

  Store.save(App.state);
  App.renderAll();
  Util.toast("Workout generated");
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(App.state, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "discipline_os_v7_backup.json";
  a.click();
  URL.revokeObjectURL(url);
  Util.toast("Exported");
}

async function importJSON(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    App.state = Store.migrate(parsed);
    Store.save(App.state);
    Util.toast("Imported");
    App.renderAll();
  } catch {
    Util.toast("Import failed (bad JSON)");
  } finally {
    e.target.value = "";
  }
}

// Boot
(function init() {
  document.documentElement.setAttribute(
    "data-theme",
    App.state.theme === "light" ? "light" : "dark"
  );
  bindEvents();
  App.renderAll();
})();