const habits = [
  "Workout",
  "Deep Work",
  "No Porn",
  "No Masturbation",
  "Sleep ≥ 7h"
];

let completed = {};
let submitted = false;

const habitsEl = document.getElementById("habits");
const scoreEl = document.getElementById("score");
const workoutList = document.getElementById("workoutList");

function renderHabits() {
  habitsEl.innerHTML = "";
  habits.forEach(habit => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!completed[habit];
    cb.disabled = submitted;

    cb.onchange = () => {
      completed[habit] = cb.checked;
      renderScore();
    };

    label.appendChild(cb);
    label.append(habit);
    habitsEl.appendChild(label);
  });
}

function renderScore() {
  const done = Object.values(completed).filter(Boolean).length;
  scoreEl.textContent = `${done} / ${habits.length}`;
}

document.getElementById("submitDay").onclick = () => {
  submitted = true;
  alert("Day submitted. Discipline locked.");
  renderHabits();
};

document.getElementById("generateWorkout").onclick = () => {
  workoutList.innerHTML = "";
  [
    "Push-ups — 3×12",
    "Squats — 3×20",
    "Plank — 60s",
    "Jumping Jacks — 2 min"
  ].forEach(w => {
    const li = document.createElement("li");
    li.textContent = w;
    workoutList.appendChild(li);
  });
};

renderHabits();
renderScore();
