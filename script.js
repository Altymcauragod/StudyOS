/* ============================================
   StudyOS — Gamified Study Planner
   Main Script
   ============================================ */

'use strict';

/* ============================================
   STATE MANAGEMENT
   ============================================ */
const STATE_KEY = 'studyos_state';

const defaultState = () => ({
  tasks: [],
  subjects: [],
  player: {
    xp: 0,
    level: 1,
    streak: 0,
    lastActiveDate: null,
    totalPomodoros: 0,
    weeklyMinutes: {},
    pomoDayCount: 0,
    pomoDayDate: null,
    pomoXpTotal: 0,
  },
  achievements: {},
  filter: 'all',
  sort: 'date',
});

let state = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem(STATE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...defaultState(), ...parsed, player: { ...defaultState().player, ...parsed.player } };
    }
  } catch (e) { console.warn('State load error', e); }
  return defaultState();
}

function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
  catch (e) { console.warn('State save error', e); }
}

/* ============================================
   LEVEL & XP SYSTEM
   ============================================ */
const LEVEL_NAMES = [
  'Novice', 'Apprentice', 'Scholar', 'Adept', 'Sage',
  'Expert', 'Master', 'Grandmaster', 'Legend', 'Mythic'
];

const XP_PER_TASK = { low: 15, medium: 25, high: 40 };
const XP_PER_POMO = 30;
const XP_STREAK_BONUS = 10;

function xpForLevel(level) {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

function getLevelName(level) {
  return LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)] || 'Legend';
}

function addXP(amount) {
  state.player.xp += amount;
  let leveled = false;
  while (state.player.xp >= xpForLevel(state.player.level)) {
    state.player.xp -= xpForLevel(state.player.level);
    state.player.level += 1;
    leveled = true;
  }
  saveState();
  updatePlayerUI();
  if (leveled) showLevelUpModal(state.player.level);
}

function updatePlayerUI() {
  const { xp, level } = state.player;
  const needed = xpForLevel(level);
  const pct = Math.min((xp / needed) * 100, 100);
  const name = getLevelName(level);

  setEl('xpFill', el => el.style.width = pct + '%');
  setEl('xpFillMini', el => el.style.width = pct + '%');
  setEl('xpLabel', el => el.textContent = `${xp} / ${needed}`);
  setEl('xpTextMini', el => el.textContent = `${xp} / ${needed} XP`);
  setEl('sidebarLevel', el => el.textContent = level);
  setEl('playerCardLevel', el => el.textContent = `Level ${level} — ${name}`);
  setEl('pstatLevel', el => animateNumber(el, level));
  setEl('pstatStreak', el => animateNumber(el, state.player.streak));
  setEl('pstatScore', el => el.textContent = calcProductivityScore() + '%');
  setEl('statXP', el => animateNumber(el, state.player.xp + (level - 1) * 100));

  // Analytics
  setEl('analyticsXP', el => animateNumber(el, xp));
  setEl('analyticsLevel', el => el.textContent = `Level ${level} — ${name}`);
  setEl('analyticsXpFill', el => el.style.width = pct + '%');
}

/* ============================================
   STREAK SYSTEM
   ============================================ */
function checkStreak() {
  const today = new Date().toDateString();
  const last = state.player.lastActiveDate;
  if (last === today) return;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (last === yesterday) {
    state.player.streak += 1;
    if (state.player.streak > 1) addXP(XP_STREAK_BONUS);
  } else if (last !== today) {
    state.player.streak = 1;
  }
  state.player.lastActiveDate = today;
  saveState();
  setEl('streakCount', el => el.textContent = state.player.streak);
  setEl('pstatStreak', el => animateNumber(el, state.player.streak));
}

/* ============================================
   ACHIEVEMENTS
   ============================================ */
const ACHIEVEMENT_DEFS = [
  { id: 'first_task',    icon: '🌱', name: 'First Steps',      desc: 'Complete your first task',         check: s => completedCount(s) >= 1 },
  { id: 'ten_tasks',     icon: '📚', name: 'Bookworm',         desc: 'Complete 10 tasks',                check: s => completedCount(s) >= 10 },
  { id: 'fifty_tasks',   icon: '🎓', name: 'Academic',         desc: 'Complete 50 tasks',                check: s => completedCount(s) >= 50 },
  { id: 'streak_3',      icon: '🔥', name: 'On Fire',          desc: 'Reach a 3-day streak',             check: s => s.player.streak >= 3 },
  { id: 'streak_7',      icon: '⚡', name: 'Unstoppable',      desc: 'Reach a 7-day streak',             check: s => s.player.streak >= 7 },
  { id: 'pomo_5',        icon: '⏱', name: 'Focused',          desc: 'Complete 5 Pomodoro sessions',     check: s => s.player.totalPomodoros >= 5 },
  { id: 'pomo_20',       icon: '🧘', name: 'Deep Work',        desc: 'Complete 20 Pomodoro sessions',    check: s => s.player.totalPomodoros >= 20 },
  { id: 'level_5',       icon: '⭐', name: 'Rising Star',      desc: 'Reach Level 5',                   check: s => s.player.level >= 5 },
  { id: 'level_10',      icon: '💎', name: 'Diamond Scholar',  desc: 'Reach Level 10',                  check: s => s.player.level >= 10 },
  { id: 'add_subject',   icon: '🗂', name: 'Organized',        desc: 'Add your first subject',           check: s => s.subjects.length >= 1 },
  { id: 'tasks_10_add',  icon: '📋', name: 'Planner',          desc: 'Add 10 tasks total',               check: s => s.tasks.length >= 10 },
  { id: 'high_priority', icon: '🚨', name: 'Priority Master',  desc: 'Complete a high priority task',    check: s => s.tasks.some(t => t.completed && t.priority === 'high') },
];

function completedCount(s) { return s.tasks.filter(t => t.completed).length; }

function checkAchievements() {
  let newUnlocks = [];
  ACHIEVEMENT_DEFS.forEach(ach => {
    if (!state.achievements[ach.id] && ach.check(state)) {
      state.achievements[ach.id] = Date.now();
      newUnlocks.push(ach);
    }
  });
  if (newUnlocks.length > 0) {
    saveState();
    newUnlocks.forEach((ach, i) => setTimeout(() => showAchievementToast(ach), i * 1200));
    renderAchievements();
  }
}

function renderAchievements() {
  const grid = document.getElementById('achievementsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ACHIEVEMENT_DEFS.forEach(ach => {
    const unlocked = !!state.achievements[ach.id];
    const card = document.createElement('div');
    card.className = `achievement-card glass ${unlocked ? 'unlocked' : 'locked'}`;
    card.innerHTML = `
      ${unlocked ? '<span class="ach-unlocked-badge">✓</span>' : ''}
      <div class="ach-glow"></div>
      <span class="ach-icon">${ach.icon}</span>
      <div class="ach-name">${ach.name}</div>
      <div class="ach-desc">${ach.desc}</div>
    `;
    grid.appendChild(card);
  });
}

function showAchievementToast(ach) {
  const toast = document.getElementById('achievementToast');
  const name = document.getElementById('toastName');
  if (!toast || !name) return;
  name.textContent = ach.name + ' ' + ach.icon;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ============================================
   TASK MANAGEMENT
   ============================================ */
let dragSrcId = null;

function createTask(data) {
  return {
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2),
    title: data.title.trim(),
    subjectId: data.subjectId || '',
    dueDate: data.dueDate || '',
    priority: data.priority || 'medium',
    estimatedMinutes: parseInt(data.estimatedMinutes) || 0,
    completed: false,
    createdAt: Date.now(),
  };
}

function addTask(data) {
  if (!data.title || !data.title.trim()) return false;
  const task = createTask(data);
  state.tasks.push(task);
  saveState();
  checkStreak();
  renderAllTasks();
  updateAnalytics();
  checkAchievements();
  populateTaskSelects();
  return true;
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveState();
  renderAllTasks();
  updateAnalytics();
  populateTaskSelects();
}

function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  if (task.completed) {
    addXP(XP_PER_TASK[task.priority] || 20);
    if (task.estimatedMinutes) {
      const week = getWeekKey();
      state.player.weeklyMinutes[week] = (state.player.weeklyMinutes[week] || 0) + task.estimatedMinutes;
    }
  }
  saveState();
  renderAllTasks();
  updateAnalytics();
  checkAchievements();
}

function renderAllTasks() {
  renderSubjectsView();
  renderRecentTasks();
  updateStatCards();
}

function renderRecentTasks() {
  const container = document.getElementById('recentTaskList');
  if (!container) return;
  const recent = [...state.tasks]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);
  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state">No tasks yet. Add your first task above!</div>';
    return;
  }
  container.innerHTML = '';
  recent.forEach(task => container.appendChild(buildTaskEl(task, true)));
}

function getFilteredSortedTasks(subjectId) {
  let tasks = state.tasks.filter(t => t.subjectId === subjectId);
  if (state.filter === 'completed') tasks = tasks.filter(t => t.completed);
  if (state.filter === 'pending') tasks = tasks.filter(t => !t.completed);
  if (state.sort === 'priority') {
    const order = { high: 0, medium: 1, low: 2 };
    tasks.sort((a, b) => (order[a.priority] || 1) - (order[b.priority] || 1));
  } else {
    tasks.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  }
  return tasks;
}

function renderSubjectsView() {
  const container = document.getElementById('subjectsContainer');
  if (!container) return;
  if (state.subjects.length === 0) {
    container.innerHTML = '<div class="empty-state glass">No subjects yet. Add a subject to get started!</div>';
    return;
  }
  container.innerHTML = '';
  state.subjects.forEach(subj => {
    const tasks = getFilteredSortedTasks(subj.id);
    const group = document.createElement('div');
    group.className = 'subject-group';
    group.dataset.subjectId = subj.id;
    const allTasks = state.tasks.filter(t => t.subjectId === subj.id);
    group.innerHTML = `
      <div class="subject-header">
        <div class="subject-color-dot" style="background:${subj.color}"></div>
        <span class="subject-name">${escHtml(subj.name)}</span>
        <span class="subject-task-count">${allTasks.filter(t=>t.completed).length}/${allTasks.length} done</span>
        <button class="subject-delete-btn" data-subject-id="${subj.id}" aria-label="Delete subject">✕</button>
      </div>
      <div class="subject-tasks" id="subjectTasks_${subj.id}"></div>
    `;
    container.appendChild(group);
    const taskList = group.querySelector(`#subjectTasks_${subj.id}`);
    if (tasks.length === 0) {
      taskList.innerHTML = '<div class="empty-state" style="padding:16px">No tasks here yet.</div>';
    } else {
      tasks.forEach(task => {
        const el = buildTaskEl(task, false);
        el.setAttribute('draggable', true);
        taskList.appendChild(el);
      });
    }
  });
}

function buildTaskEl(task, compact) {
  const el = document.createElement('div');
  el.className = `task-item ${task.completed ? 'completed' : ''}`;
  el.dataset.id = task.id;

  const subject = state.subjects.find(s => s.id === task.subjectId);
  const subjectDot = subject ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${subject.color};flex-shrink:0"></span>` : '';

  el.innerHTML = `
    <button class="task-check ${task.completed ? 'checked' : ''}" data-task-id="${task.id}" aria-label="Toggle task completion">
      ${task.completed ? '✓' : ''}
    </button>
    <div class="task-content">
      <div class="task-title">${escHtml(task.title)}</div>
      <div class="task-meta">
        ${subjectDot}
        ${task.dueDate ? `<span class="task-due">📅 ${formatDate(task.dueDate)}</span>` : ''}
        ${task.estimatedMinutes ? `<span class="task-time">⏱ ${task.estimatedMinutes}m</span>` : ''}
        <span class="priority-badge priority-${task.priority}">${task.priority}</span>
      </div>
    </div>
    ${!compact ? `
    <div class="task-actions">
      <button class="task-action-btn delete" data-delete-task="${task.id}" aria-label="Delete task">✕</button>
    </div>` : ''}
  `;

  // Drag events
  el.addEventListener('dragstart', e => {
    dragSrcId = task.id;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    document.querySelectorAll('.task-item').forEach(t => t.classList.remove('drag-over'));
  });
  el.addEventListener('dragover', e => {
    e.preventDefault();
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (dragSrcId && dragSrcId !== task.id) reorderTasks(dragSrcId, task.id);
  });

  return el;
}

function reorderTasks(srcId, destId) {
  const srcIdx = state.tasks.findIndex(t => t.id === srcId);
  const destIdx = state.tasks.findIndex(t => t.id === destId);
  if (srcIdx < 0 || destIdx < 0) return;
  const [moved] = state.tasks.splice(srcIdx, 1);
  state.tasks.splice(destIdx, 0, moved);
  saveState();
  renderAllTasks();
}

/* ============================================
   SUBJECTS
   ============================================ */
let selectedSubjectColor = '#7c6af7';

function addSubject(name, color) {
  if (!name.trim()) return false;
  const subject = {
    id: 'subj_' + Date.now(),
    name: name.trim(),
    color: color || '#7c6af7',
  };
  state.subjects.push(subject);
  saveState();
  renderAllTasks();
  populateSubjectSelects();
  checkAchievements();
  return true;
}

function deleteSubject(id) {
  state.subjects = state.subjects.filter(s => s.id !== id);
  state.tasks = state.tasks.filter(t => t.subjectId !== id);
  saveState();
  renderAllTasks();
  populateSubjectSelects();
  populateTaskSelects();
}

function populateSubjectSelects() {
  const opts = '<option value="">Select subject...</option>' +
    state.subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
  ['quickTaskSubject', 'modalTaskSubjectSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

function populateTaskSelects() {
  const pendingTasks = state.tasks.filter(t => !t.completed);
  const opts = '<option value="">— Select a task —</option>' +
    pendingTasks.map(t => `<option value="${t.id}">${escHtml(t.title)}</option>`).join('');
  const el = document.getElementById('pomoTaskSelect');
  if (el) el.innerHTML = opts;
}

/* ============================================
   ANALYTICS
   ============================================ */
function calcProductivityScore() {
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.completed).length;
  const completionRate = total > 0 ? done / total : 0;
  const streakBonus = Math.min(state.player.streak / 30, 1);
  const pomoBonus = Math.min(state.player.totalPomodoros / 50, 1);
  return Math.round((completionRate * 60 + streakBonus * 20 + pomoBonus * 20) * 100) / 1;
}

function getWeekKey() {
  const d = new Date();
  const week = Math.floor(d.getTime() / (7 * 86400000));
  return 'w_' + week;
}

function updateAnalytics() {
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const score = calcProductivityScore();
  const weekMinutes = state.player.weeklyMinutes[getWeekKey()] || 0;

  setEl('completionRate', el => animateNumber(el, pct, '%'));
  setEl('completionFill', el => el.style.width = pct + '%');
  setEl('completionSub', el => el.textContent = `${done} of ${total} tasks complete`);
  setEl('productivityScore', el => animateNumber(el, score));
  setEl('productivityFill', el => el.style.width = Math.min(score, 100) + '%');
  setEl('weeklyMinutes', el => animateNumber(el, weekMinutes));

  // Priority breakdown
  const high = state.tasks.filter(t => t.priority === 'high').length;
  const med = state.tasks.filter(t => t.priority === 'medium').length;
  const low = state.tasks.filter(t => t.priority === 'low').length;
  const maxP = Math.max(high, med, low, 1);

  setEl('highCount', el => el.textContent = high);
  setEl('medCount', el => el.textContent = med);
  setEl('lowCount', el => el.textContent = low);
  setEl('highFill', el => el.style.width = (high / maxP * 100) + '%');
  setEl('medFill', el => el.style.width = (med / maxP * 100) + '%');
  setEl('lowFill', el => el.style.width = (low / maxP * 100) + '%');
}

function updateStatCards() {
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.completed).length;
  setEl('statTotalTasks', el => animateNumber(el, total));
  setEl('statCompletedTasks', el => animateNumber(el, done));
  setEl('statPomodoros', el => animateNumber(el, state.player.totalPomodoros));
  setEl('streakCount', el => el.textContent = state.player.streak);
}

/* ============================================
   POMODORO TIMER
   ============================================ */
let pomoState = {
  workMin: 25,
  breakMin: 5,
  isWork: true,
  running: false,
  remaining: 25 * 60,
  totalSec: 25 * 60,
  interval: null,
};

const CIRCUMFERENCE = 2 * Math.PI * 85; // r=85

function updatePomoUI() {
  const min = String(Math.floor(pomoState.remaining / 60)).padStart(2, '0');
  const sec = String(pomoState.remaining % 60).padStart(2, '0');
  setEl('pomoTime', el => el.textContent = `${min}:${sec}`);
  setEl('pomoMode', el => el.textContent = pomoState.isWork ? 'FOCUS' : 'BREAK');
  setEl('pomoStartPause', el => el.textContent = pomoState.running ? 'Pause' : 'Start');

  const ring = document.getElementById('ringProgress');
  if (ring) {
    const progress = pomoState.remaining / pomoState.totalSec;
    const offset = CIRCUMFERENCE * (1 - progress);
    ring.style.strokeDasharray = CIRCUMFERENCE;
    ring.style.strokeDashoffset = offset;
  }
}

function startPomo() {
  if (pomoState.interval) return;
  pomoState.running = true;
  pomoState.interval = setInterval(() => {
    pomoState.remaining -= 1;
    updatePomoUI();
    if (pomoState.remaining <= 0) {
      clearInterval(pomoState.interval);
      pomoState.interval = null;
      pomoState.running = false;
      onPomoComplete();
    }
  }, 1000);
  updatePomoUI();
}

function pausePomo() {
  clearInterval(pomoState.interval);
  pomoState.interval = null;
  pomoState.running = false;
  updatePomoUI();
}

function resetPomo() {
  pausePomo();
  pomoState.isWork = true;
  pomoState.remaining = pomoState.workMin * 60;
  pomoState.totalSec = pomoState.workMin * 60;
  updatePomoUI();
}

function skipPomo() {
  pausePomo();
  pomoState.isWork = !pomoState.isWork;
  const sec = (pomoState.isWork ? pomoState.workMin : pomoState.breakMin) * 60;
  pomoState.remaining = sec;
  pomoState.totalSec = sec;
  updatePomoUI();
}

function onPomoComplete() {
  const ring = document.getElementById('ringProgress');
  if (ring) {
    ring.classList.add('complete-pulse');
    setTimeout(() => ring.classList.remove('complete-pulse'), 2500);
  }
  if (pomoState.isWork) {
    state.player.totalPomodoros += 1;
    state.player.pomoXpTotal += XP_PER_POMO;

    const today = new Date().toDateString();
    if (state.player.pomoDayDate !== today) {
      state.player.pomoDayDate = today;
      state.player.pomoDayCount = 0;
    }
    state.player.pomoDayCount += 1;

    addXP(XP_PER_POMO);
    saveState();
    updatePomoStats();
    checkAchievements();
  }
  // Switch mode
  pomoState.isWork = !pomoState.isWork;
  const sec = (pomoState.isWork ? pomoState.workMin : pomoState.breakMin) * 60;
  pomoState.remaining = sec;
  pomoState.totalSec = sec;
  updatePomoUI();
}

function updatePomoStats() {
  setEl('totalPomoSessions', el => animateNumber(el, state.player.totalPomodoros));
  setEl('totalPomoMinutes', el => animateNumber(el, state.player.totalPomodoros * pomoState.workMin));
  setEl('pomoXpEarned', el => animateNumber(el, state.player.pomoXpTotal));
  setEl('statPomodoros', el => animateNumber(el, state.player.totalPomodoros));
  const today = new Date().toDateString();
  const dayCount = state.player.pomoDayDate === today ? (state.player.pomoDayCount || 0) : 0;
  setEl('pomoDaySessions', el => el.textContent = dayCount);
}

function setPomoPreset(work, brk) {
  pomoState.workMin = work;
  pomoState.breakMin = brk;
  resetPomo();
}

/* ============================================
   LEVEL UP MODAL & CONFETTI
   ============================================ */
function showLevelUpModal(level) {
  setEl('levelUpNum', el => el.textContent = level);
  setEl('levelUpName', el => el.textContent = getLevelName(level));
  openModal('levelUpModal');
  runConfetti();
}

function runConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  const particles = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    r: 4 + Math.random() * 6,
    d: 2 + Math.random() * 3,
    color: ['#7c6af7','#45d9a0','#f7716a','#f7c76a','#6ab8f7','#f76ab8'][Math.floor(Math.random()*6)],
    tilt: Math.random() * 10 - 5,
    tiltSpeed: 0.1 + Math.random() * 0.2,
    tiltAngle: 0,
  }));

  let frame = 0;
  const maxFrames = 150;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.tiltAngle += p.tiltSpeed;
      p.y += p.d;
      p.tilt = Math.sin(p.tiltAngle) * 12;
      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
      ctx.stroke();
    });
    frame++;
    if (frame < maxFrames) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(draw);
}

/* ============================================
   MODALS
   ============================================ */
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

/* ============================================
   PARTICLES BACKGROUND
   ============================================ */
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = window.innerWidth, H = window.innerHeight;
  canvas.width = W; canvas.height = H;

  const count = Math.min(Math.floor(W * H / 12000), 60);
  const pts = Array.from({ length: count }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    r: 1 + Math.random() * 1.5,
  }));

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(124, 106, 247, 0.5)';
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();

  window.addEventListener('resize', () => {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W; canvas.height = H;
  });
}

/* ============================================
   PARALLAX EFFECT
   ============================================ */
function initParallax() {
  document.addEventListener('mousemove', e => {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    const blobs = document.querySelectorAll('.blob');
    blobs.forEach((b, i) => {
      const factor = (i + 1) * 0.4;
      b.style.transform = `translate(${x * factor}px, ${y * factor}px)`;
    });
  });
}

/* ============================================
   NAVIGATION / VIEW MANAGEMENT
   ============================================ */
const VIEW_TITLES = {
  dashboard: ['Dashboard', 'Your learning command center'],
  tasks: ['Task Manager', 'Organize and conquer'],
  pomodoro: ['Pomodoro Timer', 'Deep work, one session at a time'],
  analytics: ['Analytics', 'Track your progress'],
  achievements: ['Achievements', 'Unlock your potential'],
};

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById('view-' + name);
  if (view) view.classList.add('active');

  document.querySelectorAll(`[data-view="${name}"]`).forEach(n => n.classList.add('active'));

  const [title, subtitle] = VIEW_TITLES[name] || [name, ''];
  setEl('pageTitle', el => el.textContent = title);
  setEl('pageSubtitle', el => el.textContent = subtitle);

  // Refresh view data
  if (name === 'analytics') updateAnalytics();
  if (name === 'achievements') renderAchievements();
  if (name === 'pomodoro') updatePomoStats();
}

/* ============================================
   THEME TOGGLE
   ============================================ */
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('studyos_theme', next);
  const icon = document.getElementById('themeIcon');
  if (icon) icon.textContent = next === 'dark' ? '◑' : '◐';
}

function loadTheme() {
  const saved = localStorage.getItem('studyos_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = saved === 'dark' ? '◑' : '◐';
  }
}

/* ============================================
   UTILITY HELPERS
   ============================================ */
function setEl(id, fn) {
  const el = document.getElementById(id);
  if (el) fn(el);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function animateNumber(el, target, suffix = '') {
  const start = parseInt(el.textContent) || 0;
  const duration = 500;
  const startTime = performance.now();
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (target - start) * eased);
    el.textContent = current + suffix;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target + suffix;
  }
  requestAnimationFrame(step);
}

/* ============================================
   SVG GRADIENT FOR POMODORO
   ============================================ */
function injectPomoGradient() {
  const svg = document.querySelector('.pomo-ring');
  if (!svg) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', 'pomoGrad');
  grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
  grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '0%');
  const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop1.setAttribute('offset', '0%'); stop1.setAttribute('stop-color', '#7c6af7');
  const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop2.setAttribute('offset', '100%'); stop2.setAttribute('stop-color', '#45d9a0');
  grad.appendChild(stop1); grad.appendChild(stop2);
  defs.appendChild(grad);
  svg.insertBefore(defs, svg.firstChild);
}

/* ============================================
   EVENT DELEGATION
   ============================================ */
function initEvents() {
  // Sidebar nav
  document.addEventListener('click', e => {
    const navBtn = e.target.closest('[data-view]');
    if (navBtn) {
      switchView(navBtn.dataset.view);
      return;
    }

    // Sidebar toggle
    if (e.target.closest('#sidebarToggle')) {
      const sidebar = document.getElementById('sidebar');
      const wrapper = document.getElementById('mainWrapper');
      sidebar.classList.toggle('collapsed');
      wrapper.classList.toggle('expanded');
      return;
    }

    // Theme toggle
    if (e.target.closest('#themeToggle')) {
      toggleTheme();
      return;
    }

    // Modal close buttons
    const closeBtn = e.target.closest('[data-modal]');
    if (closeBtn) {
      closeModal(closeBtn.dataset.modal);
      return;
    }

    // Overlay close
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('open');
      return;
    }

    // Open add task modal
    if (e.target.closest('#openAddTaskModal')) {
      openModal('addTaskModal');
      return;
    }

    // Open add subject modal
    if (e.target.closest('#openAddSubjectModal')) {
      selectedSubjectColor = '#7c6af7';
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      const first = document.querySelector('.color-dot[data-color="#7c6af7"]');
      if (first) first.classList.add('active');
      openModal('addSubjectModal');
      return;
    }

    // Color picker
    const colorDot = e.target.closest('.color-dot');
    if (colorDot) {
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      colorDot.classList.add('active');
      selectedSubjectColor = colorDot.dataset.color;
      return;
    }

    // Task check toggle
    const taskCheck = e.target.closest('.task-check');
    if (taskCheck && taskCheck.dataset.taskId) {
      const taskItem = taskCheck.closest('.task-item');
      if (taskItem) taskItem.classList.add('just-completed');
      toggleTask(taskCheck.dataset.taskId);
      return;
    }

    // Delete task
    const delTask = e.target.closest('[data-delete-task]');
    if (delTask) {
      deleteTask(delTask.dataset.deleteTask);
      return;
    }

    // Delete subject
    const delSubj = e.target.closest('[data-subject-id]');
    if (delSubj && e.target.closest('.subject-delete-btn')) {
      deleteSubject(delSubj.dataset.subjectId);
      return;
    }

    // Filter buttons
    const filterBtn = e.target.closest('.filter-btn');
    if (filterBtn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      filterBtn.classList.add('active');
      state.filter = filterBtn.dataset.filter;
      renderAllTasks();
      return;
    }

    // Pomodoro controls
    if (e.target.closest('#pomoStartPause')) {
      if (pomoState.running) pausePomo(); else startPomo();
      return;
    }
    if (e.target.closest('#pomoReset')) { resetPomo(); return; }
    if (e.target.closest('#pomoSkip')) { skipPomo(); return; }

    // Pomo presets
    const preset = e.target.closest('.preset-btn');
    if (preset) {
      document.querySelectorAll('.preset-btn').forEach(p => p.classList.remove('active'));
      preset.classList.add('active');
      setPomoPreset(parseInt(preset.dataset.work), parseInt(preset.dataset.break));
      return;
    }
  });

  // Quick add task
  document.getElementById('quickAddBtn')?.addEventListener('click', () => {
    const title = document.getElementById('quickTaskTitle')?.value;
    const subjectId = document.getElementById('quickTaskSubject')?.value;
    const dueDate = document.getElementById('quickTaskDue')?.value;
    const priority = document.getElementById('quickTaskPriority')?.value;
    const estimatedMinutes = document.getElementById('quickTaskTime')?.value;
    if (addTask({ title, subjectId, dueDate, priority, estimatedMinutes })) {
      ['quickTaskTitle','quickTaskDue','quickTaskTime'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    }
  });

  // Modal add task
  document.getElementById('modalAddTaskBtn')?.addEventListener('click', () => {
    const title = document.getElementById('modalTaskTitle')?.value;
    const subjectId = document.getElementById('modalTaskSubjectSelect')?.value;
    const dueDate = document.getElementById('modalTaskDue')?.value;
    const priority = document.getElementById('modalTaskPriority')?.value;
    const estimatedMinutes = document.getElementById('modalTaskTime')?.value;
    if (addTask({ title, subjectId, dueDate, priority, estimatedMinutes })) {
      closeModal('addTaskModal');
      ['modalTaskTitle','modalTaskDue','modalTaskTime'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    }
  });

  // Add subject
  document.getElementById('addSubjectBtn')?.addEventListener('click', () => {
    const name = document.getElementById('subjectName')?.value;
    if (addSubject(name, selectedSubjectColor)) {
      closeModal('addSubjectModal');
      const el = document.getElementById('subjectName');
      if (el) el.value = '';
    }
  });

  // Sort select
  document.getElementById('sortSelect')?.addEventListener('change', e => {
    state.sort = e.target.value;
    renderAllTasks();
  });

  // Enter key shortcuts
  document.getElementById('quickTaskTitle')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('quickAddBtn')?.click();
  });
  document.getElementById('subjectName')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('addSubjectBtn')?.click();
  });
  document.getElementById('modalTaskTitle')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('modalAddTaskBtn')?.click();
  });
}

/* ============================================
   INIT
   ============================================ */
function init() {
  loadTheme();
  initParticles();
  initParallax();
  injectPomoGradient();
  initEvents();

  // Initial data render
  checkStreak();
  populateSubjectSelects();
  populateTaskSelects();
  renderAllTasks();
  updateAnalytics();
  updatePlayerUI();
  updatePomoStats();
  renderAchievements();
  updatePomoUI();

  // Set today as min date for inputs
  const today = new Date().toISOString().split('T')[0];
  document.querySelectorAll('input[type="date"]').forEach(el => el.setAttribute('min', today));
}

document.addEventListener('DOMContentLoaded', init);
