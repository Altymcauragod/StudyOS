/* ============================================
   StudyOS — Gamified Study Planner
   script.js v2 — Supabase Auth + Onboarding
   ============================================ */

'use strict';

/* ============================================
   SUPABASE CONFIG
   ============================================ */
const SUPABASE_URL = 'https://dnaiqweeicfnsdfpwfvk.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuYWlxd2VlaWNmbnNkZnB3ZnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDU2MTUsImV4cCI6MjA4NzcyMTYxNX0.Lx_4rzt9NAJx8Xjs9iws5olkEIrlXPA2LmVHPrKXk68';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ============================================
   APP STATE
   ============================================ */
let currentUser = null;
let appState = {
  tasks: [],
  subjects: [],
  player: {
    name: 'Scholar',
    username: 'scholar',
    avatarColor: '#7c6af7',
    dailyGoalHours: 2,
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
};

let syncTimeout = null;
let isSyncing = false;

/* ============================================
   SUPABASE DB HELPERS
   ============================================ */
async function loadUserData(userId) {
  try {
    // Load profile
    const { data: profile } = await db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profile) {
      appState.player = { ...appState.player, ...(profile.player || {}) };
      appState.achievements = profile.achievements || {};
    }

    // Load subjects
    const { data: subjects } = await db
      .from('subjects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at');

    if (subjects) {
      appState.subjects = subjects.map(s => ({
        id: s.id, name: s.name, color: s.color
      }));
    }

    // Load tasks
    const { data: tasks } = await db
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at');

    if (tasks) {
      appState.tasks = tasks.map(t => ({
        id: t.id,
        title: t.title,
        subjectId: t.subject_id || '',
        dueDate: t.due_date || '',
        priority: t.priority || 'medium',
        estimatedMinutes: t.estimated_minutes || 0,
        completed: t.completed || false,
        createdAt: new Date(t.created_at).getTime(),
      }));
    }

    return true;
  } catch (e) {
    console.error('Load error:', e);
    return false;
  }
}

async function saveProfile() {
  if (!currentUser) return;
  try {
    await db.from('profiles').upsert({
      id: currentUser.id,
      player: appState.player,
      achievements: appState.achievements,
      updated_at: new Date().toISOString(),
    });
  } catch (e) { console.error('Save profile error:', e); }
}

async function saveTask(task) {
  if (!currentUser) return;
  try {
    await db.from('tasks').upsert({
      id: task.id,
      user_id: currentUser.id,
      title: task.title,
      subject_id: task.subjectId || null,
      due_date: task.dueDate || null,
      priority: task.priority,
      estimated_minutes: task.estimatedMinutes || null,
      completed: task.completed,
      created_at: new Date(task.createdAt).toISOString(),
    });
  } catch (e) { console.error('Save task error:', e); }
}

async function deleteTaskDB(taskId) {
  if (!currentUser) return;
  try {
    await db.from('tasks').delete().eq('id', taskId).eq('user_id', currentUser.id);
  } catch (e) { console.error('Delete task error:', e); }
}

async function saveSubject(subject) {
  if (!currentUser) return;
  try {
    await db.from('subjects').upsert({
      id: subject.id,
      user_id: currentUser.id,
      name: subject.name,
      color: subject.color,
    });
  } catch (e) { console.error('Save subject error:', e); }
}

async function deleteSubjectDB(subjectId) {
  if (!currentUser) return;
  try {
    await db.from('subjects').delete().eq('id', subjectId).eq('user_id', currentUser.id);
  } catch (e) { console.error('Delete subject error:', e); }
}

function scheduleSyncProfile() {
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => saveProfile(), 1500);
}

function showSyncIndicator() {
  let el = document.getElementById('syncIndicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'syncIndicator';
    el.className = 'sync-indicator';
    el.innerHTML = '<div class="sync-dot"></div><span>Saving...</span>';
    document.body.appendChild(el);
  }
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

/* ============================================
   AUTH
   ============================================ */
async function handleLogin() {
  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;
  const errEl = document.getElementById('loginError');

  if (!email || !password) { showAuthError(errEl, 'Please fill in all fields.'); return; }

  setLoading('loginBtn', true, 'Signing in...');
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  setLoading('loginBtn', false, 'Sign In');

  if (error) { showAuthError(errEl, error.message); return; }
  // onAuthStateChange will handle the rest
}

async function handleSignup() {
  const email = document.getElementById('signupEmail')?.value?.trim();
  const password = document.getElementById('signupPassword')?.value;
  const confirm = document.getElementById('signupConfirm')?.value;
  const errEl = document.getElementById('signupError');

  if (!email || !password || !confirm) { showAuthError(errEl, 'Please fill in all fields.'); return; }
  if (password.length < 6) { showAuthError(errEl, 'Password must be at least 6 characters.'); return; }
  if (password !== confirm) { showAuthError(errEl, 'Passwords do not match.'); return; }

  setLoading('signupBtn', true, 'Creating account...');
  const { data, error } = await db.auth.signUp({ email, password });
  setLoading('signupBtn', false, 'Create Account');

  if (error) { showAuthError(errEl, error.message); return; }
  if (data.user) {
    // New user — show onboarding
    currentUser = data.user;
    showOnboarding();
  }
}

async function handleSignOut() {
  await db.auth.signOut();
  currentUser = null;
  appState = resetAppState();
  showAuthScreen();
}

function showAuthError(el, msg) {
  if (el) { el.textContent = msg; setTimeout(() => { if (el) el.textContent = ''; }, 4000); }
}

function setLoading(btnId, loading, text) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? text : text;
  if (loading) btn.style.opacity = '0.7';
  else btn.style.opacity = '1';
}

function resetAppState() {
  return {
    tasks: [], subjects: [],
    player: {
      name: 'Scholar', username: 'scholar', avatarColor: '#7c6af7',
      dailyGoalHours: 2, xp: 0, level: 1, streak: 0, lastActiveDate: null,
      totalPomodoros: 0, weeklyMinutes: {}, pomoDayCount: 0,
      pomoDayDate: null, pomoXpTotal: 0,
    },
    achievements: {}, filter: 'all', sort: 'date',
  };
}

/* ============================================
   SCREEN MANAGEMENT
   ============================================ */
function showLoadingScreen() {
  document.getElementById('loadingOverlay')?.classList.remove('hidden', 'fade-out');
}

function hideLoadingScreen() {
  const el = document.getElementById('loadingOverlay');
  if (!el) return;
  el.classList.add('fade-out');
  setTimeout(() => el.classList.add('hidden'), 500);
}

function showAuthScreen() {
  hideEl('appWrapper');
  hideEl('onboardingScreen');
  showEl('authScreen');
  hideLoadingScreen();
}

function showOnboarding() {
  hideEl('authScreen');
  hideEl('appWrapper');
  showEl('onboardingScreen');
  hideLoadingScreen();
}

function showApp() {
  hideEl('authScreen');
  hideEl('onboardingScreen');
  showEl('appWrapper');
  hideLoadingScreen();
  initAppUI();
}

function showEl(id) { document.getElementById(id)?.classList.remove('hidden'); }
function hideEl(id) { document.getElementById(id)?.classList.add('hidden'); }

/* ============================================
   ONBOARDING LOGIC
   ============================================ */
let obStep = 0;
let obGoal = 2;
let obColor = '#7c6af7';
let obTheme = 'dark';

function goToObStep(step) {
  document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.ob-dot').forEach(d => d.classList.remove('active'));
  const stepEl = document.querySelector(`.ob-step[data-step="${step}"]`);
  const dotEl = document.querySelector(`.ob-dot[data-step="${step}"]`);
  if (stepEl) stepEl.classList.add('active');
  if (dotEl) dotEl.classList.add('active');
  obStep = step;
}

function validateObStep(step) {
  if (step === 0) {
    const name = document.getElementById('obName')?.value?.trim();
    const username = document.getElementById('obUsername')?.value?.trim();
    const err = document.getElementById('obError0');
    if (!name) { if (err) err.textContent = 'Please enter your name.'; return false; }
    if (!username) { if (err) err.textContent = 'Please choose a username.'; return false; }
    if (err) err.textContent = '';
    return true;
  }
  return true;
}

async function finishOnboarding() {
  const name = document.getElementById('obName')?.value?.trim() || 'Scholar';
  const username = document.getElementById('obUsername')?.value?.trim() || 'scholar';
  const subjectsRaw = document.getElementById('obSubjects')?.value || '';

  appState.player.name = name;
  appState.player.username = username;
  appState.player.avatarColor = obColor;
  appState.player.dailyGoalHours = obGoal;

  // Set theme
  document.documentElement.setAttribute('data-theme', obTheme);
  localStorage.setItem('studyos_theme', obTheme);

  // Create initial subjects from onboarding
  const subjectNames = subjectsRaw.split(',').map(s => s.trim()).filter(Boolean);
  const colors = ['#7c6af7','#f7716a','#45d9a0','#f7c76a','#6ab8f7','#f76ab8'];
  for (let i = 0; i < subjectNames.length; i++) {
    const subj = {
      id: 'subj_' + Date.now() + '_' + i,
      name: subjectNames[i],
      color: colors[i % colors.length],
    };
    appState.subjects.push(subj);
    await saveSubject(subj);
  }

  // Save profile to DB
  await saveProfile();
  showApp();
}

/* ============================================
   LEVEL & XP SYSTEM
   ============================================ */
const LEVEL_NAMES = ['Novice','Apprentice','Scholar','Adept','Sage','Expert','Master','Grandmaster','Legend','Mythic'];
const XP_PER_TASK = { low: 15, medium: 25, high: 40 };
const XP_PER_POMO = 30;
const XP_STREAK_BONUS = 10;

function xpForLevel(level) { return Math.floor(100 * Math.pow(1.5, level - 1)); }
function getLevelName(level) { return LEVEL_NAMES[Math.min(level - 1, LEVEL_NAMES.length - 1)] || 'Legend'; }

function addXP(amount) {
  appState.player.xp += amount;
  let leveled = false;
  while (appState.player.xp >= xpForLevel(appState.player.level)) {
    appState.player.xp -= xpForLevel(appState.player.level);
    appState.player.level += 1;
    leveled = true;
  }
  scheduleSyncProfile();
  showSyncIndicator();
  updatePlayerUI();
  if (leveled) showLevelUpModal(appState.player.level);
}

function updatePlayerUI() {
  const { xp, level, name, avatarColor } = appState.player;
  const needed = xpForLevel(level);
  const pct = Math.min((xp / needed) * 100, 100);
  const levelName = getLevelName(level);
  const initial = (name || 'S').charAt(0).toUpperCase();

  // XP bars
  setEl('xpFill', el => el.style.width = pct + '%');
  setEl('xpFillMini', el => el.style.width = pct + '%');
  setEl('xpLabel', el => el.textContent = `${xp} / ${needed}`);
  setEl('xpTextMini', el => el.textContent = `${xp} / ${needed} XP`);

  // Level
  setEl('sidebarLevel', el => el.textContent = level);
  setEl('playerCardLevel', el => el.textContent = `Level ${level} — ${levelName}`);
  setEl('pstatLevel', el => animateNumber(el, level));
  setEl('pstatStreak', el => animateNumber(el, appState.player.streak));
  setEl('pstatScore', el => el.textContent = calcProductivityScore() + '%');
  setEl('statXP', el => animateNumber(el, xp));

  // Name & avatar
  setEl('sidebarName', el => el.textContent = name || 'Scholar');
  setEl('playerCardName', el => el.textContent = name || 'Scholar');
  setEl('playerAvatarBig', el => {
    el.textContent = initial;
    el.style.background = avatarColor || '#7c6af7';
  });
  setEl('userAvatarBtn', el => {
    el.textContent = initial;
    el.style.background = avatarColor || '#7c6af7';
  });
  setEl('sidebarLevelBadge', el => el.style.background = `linear-gradient(135deg, ${avatarColor}, #9c8bf7)`);
  setEl('udName', el => el.textContent = name || 'Scholar');
  setEl('udEmail', el => el.textContent = currentUser?.email || '');

  // Streak
  setEl('streakCount', el => el.textContent = appState.player.streak);

  // Analytics
  setEl('analyticsXP', el => animateNumber(el, xp));
  setEl('analyticsLevel', el => el.textContent = `Level ${level} — ${levelName}`);
  setEl('analyticsXpFill', el => el.style.width = pct + '%');
}

/* ============================================
   STREAK
   ============================================ */
function checkStreak() {
  const today = new Date().toDateString();
  const last = appState.player.lastActiveDate;
  if (last === today) return;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (last === yesterday) {
    appState.player.streak += 1;
    if (appState.player.streak > 1) addXP(XP_STREAK_BONUS);
  } else {
    appState.player.streak = 1;
  }
  appState.player.lastActiveDate = today;
  scheduleSyncProfile();
  setEl('streakCount', el => el.textContent = appState.player.streak);
  setEl('pstatStreak', el => animateNumber(el, appState.player.streak));
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
    if (!appState.achievements[ach.id] && ach.check(appState)) {
      appState.achievements[ach.id] = Date.now();
      newUnlocks.push(ach);
    }
  });
  if (newUnlocks.length > 0) {
    scheduleSyncProfile();
    newUnlocks.forEach((ach, i) => setTimeout(() => showAchievementToast(ach), i * 1200));
    renderAchievements();
  }
}

function renderAchievements() {
  const grid = document.getElementById('achievementsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  ACHIEVEMENT_DEFS.forEach(ach => {
    const unlocked = !!appState.achievements[ach.id];
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

function createTaskObj(data) {
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

async function addTask(data) {
  if (!data.title || !data.title.trim()) return false;
  const task = createTaskObj(data);
  appState.tasks.push(task);
  await saveTask(task);
  showSyncIndicator();
  checkStreak();
  renderAllTasks();
  updateAnalytics();
  checkAchievements();
  populateTaskSelects();
  return true;
}

async function deleteTask(id) {
  appState.tasks = appState.tasks.filter(t => t.id !== id);
  await deleteTaskDB(id);
  renderAllTasks();
  updateAnalytics();
  populateTaskSelects();
}

async function toggleTask(id) {
  const task = appState.tasks.find(t => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  if (task.completed) {
    addXP(XP_PER_TASK[task.priority] || 20);
    if (task.estimatedMinutes) {
      const week = getWeekKey();
      appState.player.weeklyMinutes[week] = (appState.player.weeklyMinutes[week] || 0) + task.estimatedMinutes;
    }
  }
  await saveTask(task);
  showSyncIndicator();
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
  const recent = [...appState.tasks].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state">No tasks yet. Add your first task above!</div>';
    return;
  }
  container.innerHTML = '';
  recent.forEach(task => container.appendChild(buildTaskEl(task, true)));
}

function getFilteredSortedTasks(subjectId) {
  let tasks = appState.tasks.filter(t => t.subjectId === subjectId);
  if (appState.filter === 'completed') tasks = tasks.filter(t => t.completed);
  if (appState.filter === 'pending') tasks = tasks.filter(t => !t.completed);
  if (appState.sort === 'priority') {
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
  if (appState.subjects.length === 0) {
    container.innerHTML = '<div class="empty-state glass">No subjects yet. Add a subject to get started!</div>';
    return;
  }
  container.innerHTML = '';
  appState.subjects.forEach(subj => {
    const tasks = getFilteredSortedTasks(subj.id);
    const allTasks = appState.tasks.filter(t => t.subjectId === subj.id);
    const group = document.createElement('div');
    group.className = 'subject-group';
    group.dataset.subjectId = subj.id;
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

  const subject = appState.subjects.find(s => s.id === task.subjectId);
  const subjectDot = subject
    ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${subject.color};flex-shrink:0"></span>` : '';

  el.innerHTML = `
    <button class="task-check ${task.completed ? 'checked' : ''}" data-task-id="${task.id}" aria-label="Toggle task">
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

  el.addEventListener('dragstart', e => {
    dragSrcId = task.id;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    document.querySelectorAll('.task-item').forEach(t => t.classList.remove('drag-over'));
  });
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    if (dragSrcId && dragSrcId !== task.id) reorderTasks(dragSrcId, task.id);
  });

  return el;
}

function reorderTasks(srcId, destId) {
  const srcIdx = appState.tasks.findIndex(t => t.id === srcId);
  const destIdx = appState.tasks.findIndex(t => t.id === destId);
  if (srcIdx < 0 || destIdx < 0) return;
  const [moved] = appState.tasks.splice(srcIdx, 1);
  appState.tasks.splice(destIdx, 0, moved);
  renderAllTasks();
}

/* ============================================
   SUBJECTS
   ============================================ */
let selectedSubjectColor = '#7c6af7';

async function addSubject(name, color) {
  if (!name.trim()) return false;
  const subject = { id: 'subj_' + Date.now(), name: name.trim(), color: color || '#7c6af7' };
  appState.subjects.push(subject);
  await saveSubject(subject);
  showSyncIndicator();
  renderAllTasks();
  populateSubjectSelects();
  checkAchievements();
  return true;
}

async function deleteSubject(id) {
  appState.subjects = appState.subjects.filter(s => s.id !== id);
  const tasksToDelete = appState.tasks.filter(t => t.subjectId === id);
  appState.tasks = appState.tasks.filter(t => t.subjectId !== id);
  await deleteSubjectDB(id);
  for (const t of tasksToDelete) await deleteTaskDB(t.id);
  renderAllTasks();
  populateSubjectSelects();
  populateTaskSelects();
}

function populateSubjectSelects() {
  const opts = '<option value="">Select subject...</option>' +
    appState.subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
  ['quickTaskSubject','modalTaskSubjectSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opts;
  });
}

function populateTaskSelects() {
  const pending = appState.tasks.filter(t => !t.completed);
  const opts = '<option value="">— Select a task —</option>' +
    pending.map(t => `<option value="${t.id}">${escHtml(t.title)}</option>`).join('');
  const el = document.getElementById('pomoTaskSelect');
  if (el) el.innerHTML = opts;
}

/* ============================================
   ANALYTICS
   ============================================ */
function calcProductivityScore() {
  const total = appState.tasks.length;
  const done = appState.tasks.filter(t => t.completed).length;
  const cr = total > 0 ? done / total : 0;
  const sb = Math.min(appState.player.streak / 30, 1);
  const pb = Math.min(appState.player.totalPomodoros / 50, 1);
  return Math.round((cr * 60 + sb * 20 + pb * 20));
}

function getWeekKey() {
  return 'w_' + Math.floor(Date.now() / (7 * 86400000));
}

function updateAnalytics() {
  const total = appState.tasks.length;
  const done = appState.tasks.filter(t => t.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const score = calcProductivityScore();
  const weekMin = appState.player.weeklyMinutes[getWeekKey()] || 0;

  setEl('completionRate', el => animateNumber(el, pct, '%'));
  setEl('completionFill', el => el.style.width = pct + '%');
  setEl('completionSub', el => el.textContent = `${done} of ${total} tasks complete`);
  setEl('productivityScore', el => animateNumber(el, score));
  setEl('productivityFill', el => el.style.width = Math.min(score, 100) + '%');
  setEl('weeklyMinutes', el => animateNumber(el, weekMin));

  const high = appState.tasks.filter(t => t.priority === 'high').length;
  const med = appState.tasks.filter(t => t.priority === 'medium').length;
  const low = appState.tasks.filter(t => t.priority === 'low').length;
  const maxP = Math.max(high, med, low, 1);

  setEl('highCount', el => el.textContent = high);
  setEl('medCount', el => el.textContent = med);
  setEl('lowCount', el => el.textContent = low);
  setEl('highFill', el => el.style.width = (high / maxP * 100) + '%');
  setEl('medFill', el => el.style.width = (med / maxP * 100) + '%');
  setEl('lowFill', el => el.style.width = (low / maxP * 100) + '%');
}

function updateStatCards() {
  const total = appState.tasks.length;
  const done = appState.tasks.filter(t => t.completed).length;
  setEl('statTotalTasks', el => animateNumber(el, total));
  setEl('statCompletedTasks', el => animateNumber(el, done));
  setEl('statPomodoros', el => animateNumber(el, appState.player.totalPomodoros));
  setEl('streakCount', el => el.textContent = appState.player.streak);
}

/* ============================================
   POMODORO
   ============================================ */
let pomoState = {
  workMin: 25, breakMin: 5, isWork: true,
  running: false, remaining: 25 * 60, totalSec: 25 * 60, interval: null,
};
const CIRCUMFERENCE = 2 * Math.PI * 85;

function updatePomoUI() {
  const min = String(Math.floor(pomoState.remaining / 60)).padStart(2, '0');
  const sec = String(pomoState.remaining % 60).padStart(2, '0');
  setEl('pomoTime', el => el.textContent = `${min}:${sec}`);
  setEl('pomoMode', el => el.textContent = pomoState.isWork ? 'FOCUS' : 'BREAK');
  setEl('pomoStartPause', el => el.textContent = pomoState.running ? 'Pause' : 'Start');
  const ring = document.getElementById('ringProgress');
  if (ring) {
    const progress = pomoState.remaining / pomoState.totalSec;
    ring.style.strokeDasharray = CIRCUMFERENCE;
    ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
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
  if (ring) { ring.classList.add('complete-pulse'); setTimeout(() => ring.classList.remove('complete-pulse'), 2500); }
  if (pomoState.isWork) {
    appState.player.totalPomodoros += 1;
    appState.player.pomoXpTotal += XP_PER_POMO;
    const today = new Date().toDateString();
    if (appState.player.pomoDayDate !== today) {
      appState.player.pomoDayDate = today;
      appState.player.pomoDayCount = 0;
    }
    appState.player.pomoDayCount += 1;
    addXP(XP_PER_POMO);
    scheduleSyncProfile();
    updatePomoStats();
    checkAchievements();
  }
  pomoState.isWork = !pomoState.isWork;
  const sec = (pomoState.isWork ? pomoState.workMin : pomoState.breakMin) * 60;
  pomoState.remaining = sec;
  pomoState.totalSec = sec;
  updatePomoUI();
}

function updatePomoStats() {
  setEl('totalPomoSessions', el => animateNumber(el, appState.player.totalPomodoros));
  setEl('totalPomoMinutes', el => animateNumber(el, appState.player.totalPomodoros * pomoState.workMin));
  setEl('pomoXpEarned', el => animateNumber(el, appState.player.pomoXpTotal));
  setEl('statPomodoros', el => animateNumber(el, appState.player.totalPomodoros));
  const today = new Date().toDateString();
  const dayCount = appState.player.pomoDayDate === today ? (appState.player.pomoDayCount || 0) : 0;
  setEl('pomoDaySessions', el => el.textContent = dayCount);
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
    x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height,
    r: 4 + Math.random() * 6, d: 2 + Math.random() * 3,
    color: ['#7c6af7','#45d9a0','#f7716a','#f7c76a','#6ab8f7','#f76ab8'][Math.floor(Math.random()*6)],
    tiltAngle: 0, tiltSpeed: 0.1 + Math.random() * 0.2,
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.tiltAngle += p.tiltSpeed; p.y += p.d;
      ctx.beginPath(); ctx.lineWidth = p.r; ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + Math.sin(p.tiltAngle) * 12 + p.r / 4, p.y);
      ctx.lineTo(p.x + Math.sin(p.tiltAngle) * 12, p.y + p.r / 4);
      ctx.stroke();
    });
    if (++frame < 150) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  requestAnimationFrame(draw);
}

/* ============================================
   MODALS
   ============================================ */
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

/* ============================================
   NAVIGATION
   ============================================ */
const VIEW_TITLES = {
  dashboard:    ['Dashboard', 'Your learning command center'],
  tasks:        ['Task Manager', 'Organize and conquer'],
  pomodoro:     ['Pomodoro Timer', 'Deep work, one session at a time'],
  analytics:    ['Analytics', 'Track your progress'],
  achievements: ['Achievements', 'Unlock your potential'],
};

function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  document.querySelectorAll(`[data-view="${name}"]`).forEach(n => n.classList.add('active'));
  const [title, subtitle] = VIEW_TITLES[name] || [name, ''];
  setEl('pageTitle', el => el.textContent = title);
  setEl('pageSubtitle', el => el.textContent = subtitle);
  if (name === 'analytics') updateAnalytics();
  if (name === 'achievements') renderAchievements();
  if (name === 'pomodoro') updatePomoStats();
}

/* ============================================
   THEME
   ============================================ */
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('studyos_theme', next);
  setEl('themeIcon', el => el.textContent = next === 'dark' ? '◑' : '◐');
}

function loadTheme() {
  const saved = localStorage.getItem('studyos_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
    setEl('themeIcon', el => el.textContent = saved === 'dark' ? '◑' : '◐');
  }
}

/* ============================================
   PARTICLES + PARALLAX
   ============================================ */
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = window.innerWidth, H = window.innerHeight;
  canvas.width = W; canvas.height = H;
  const pts = Array.from({ length: Math.min(Math.floor(W * H / 12000), 60) }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
    r: 1 + Math.random() * 1.5,
  }));
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(124,106,247,0.5)';
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
  window.addEventListener('resize', () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W; canvas.height = H; });
}

function initParallax() {
  document.addEventListener('mousemove', e => {
    const x = (e.clientX / window.innerWidth - 0.5) * 20;
    const y = (e.clientY / window.innerHeight - 0.5) * 20;
    document.querySelectorAll('.blob').forEach((b, i) => {
      b.style.transform = `translate(${x * (i+1) * 0.4}px, ${y * (i+1) * 0.4}px)`;
    });
  });
}

/* ============================================
   SVG GRADIENT
   ============================================ */
function injectPomoGradient() {
  const svg = document.querySelector('.pomo-ring');
  if (!svg) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', 'pomoGrad');
  grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
  grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '0%');
  const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#7c6af7');
  const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#45d9a0');
  grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad);
  svg.insertBefore(defs, svg.firstChild);
}

/* ============================================
   UTILITY
   ============================================ */
function setEl(id, fn) { const el = document.getElementById(id); if (el) fn(el); }
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function animateNumber(el, target, suffix = '') {
  const start = parseInt(el.textContent) || 0;
  const startTime = performance.now();
  function step(now) {
    const p = Math.min((now - startTime) / 500, 1);
    el.textContent = Math.round(start + (target - start) * (1 - Math.pow(1 - p, 3))) + suffix;
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = target + suffix;
  }
  requestAnimationFrame(step);
}

/* ============================================
   APP UI INIT (called after login)
   ============================================ */
function initAppUI() {
  loadTheme();
  injectPomoGradient();
  checkStreak();
  populateSubjectSelects();
  populateTaskSelects();
  renderAllTasks();
  updateAnalytics();
  updatePlayerUI();
  updatePomoStats();
  renderAchievements();
  updatePomoUI();
  const today = new Date().toISOString().split('T')[0];
  document.querySelectorAll('input[type="date"]').forEach(el => el.setAttribute('min', today));
}

/* ============================================
   EVENT DELEGATION
   ============================================ */
function initEvents() {
  document.addEventListener('click', async e => {

    // --- Auth tabs ---
    const authTab = e.target.closest('.auth-tab');
    if (authTab) {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      authTab.classList.add('active');
      const tab = authTab.dataset.authTab;
      document.getElementById(tab === 'login' ? 'authFormLogin' : 'authFormSignup')?.classList.add('active');
      return;
    }

    // --- Login / Signup ---
    if (e.target.closest('#loginBtn')) { await handleLogin(); return; }
    if (e.target.closest('#signupBtn')) { await handleSignup(); return; }

    // --- Sign out ---
    if (e.target.closest('#signOutBtn')) { await handleSignOut(); return; }

    // --- User dropdown ---
    if (e.target.closest('#userAvatarBtn')) {
      document.getElementById('userDropdown')?.classList.toggle('open');
      return;
    }
    if (!e.target.closest('.user-menu-wrap')) {
      document.getElementById('userDropdown')?.classList.remove('open');
    }

    // --- Onboarding next/back ---
    const obNext = e.target.closest('.ob-next');
    if (obNext) {
      const next = parseInt(obNext.dataset.next);
      if (validateObStep(obStep)) goToObStep(next);
      return;
    }
    const obBack = e.target.closest('.ob-back');
    if (obBack) { goToObStep(parseInt(obBack.dataset.back)); return; }

    // Goal buttons
    const goalBtn = e.target.closest('.goal-btn');
    if (goalBtn) {
      document.querySelectorAll('.goal-btn').forEach(b => b.classList.remove('active'));
      goalBtn.classList.add('active');
      obGoal = parseInt(goalBtn.dataset.goal);
      return;
    }

    // Onboarding color picker
    if (e.target.closest('#obColorPicker')) {
      const dot = e.target.closest('.color-dot');
      if (dot) {
        document.querySelectorAll('#obColorPicker .color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        obColor = dot.dataset.color;
        const preview = document.getElementById('obAvatarPreview');
        if (preview) preview.style.background = obColor;
      }
      return;
    }

    // Onboarding theme choice
    const themeChoice = e.target.closest('.theme-choice-btn');
    if (themeChoice) {
      document.querySelectorAll('.theme-choice-btn').forEach(b => b.classList.remove('active'));
      themeChoice.classList.add('active');
      obTheme = themeChoice.dataset.themeChoice;
      document.documentElement.setAttribute('data-theme', obTheme);
      return;
    }

    // Update onboarding avatar preview with name
    if (e.target.id === 'obName') {
      const preview = document.getElementById('obAvatarPreview');
      if (preview) preview.textContent = (e.target.value || 'A').charAt(0).toUpperCase();
      return;
    }

    // Finish onboarding
    if (e.target.closest('#obFinishBtn')) { await finishOnboarding(); return; }

    // --- App navigation ---
    const navBtn = e.target.closest('[data-view]');
    if (navBtn && document.getElementById('appWrapper') && !document.getElementById('appWrapper').classList.contains('hidden')) {
      switchView(navBtn.dataset.view);
      return;
    }

    // Sidebar toggle
    if (e.target.closest('#sidebarToggle')) {
      document.getElementById('sidebar')?.classList.toggle('collapsed');
      document.getElementById('mainWrapper')?.classList.toggle('expanded');
      return;
    }

    // Theme toggle
    if (e.target.closest('#themeToggle')) { toggleTheme(); return; }

    // Modal close
    const closeBtn = e.target.closest('[data-modal]');
    if (closeBtn) { closeModal(closeBtn.dataset.modal); return; }
    if (e.target.classList.contains('modal-overlay')) { e.target.classList.remove('open'); return; }

    // Open task modal
    if (e.target.closest('#openAddTaskModal')) { openModal('addTaskModal'); return; }

    // Open subject modal
    if (e.target.closest('#openAddSubjectModal')) {
      selectedSubjectColor = '#7c6af7';
      document.querySelectorAll('#subjectColorPicker .color-dot').forEach(d => d.classList.remove('active'));
      document.querySelector('#subjectColorPicker .color-dot[data-color="#7c6af7"]')?.classList.add('active');
      openModal('addSubjectModal');
      return;
    }

    // Subject color picker
    if (e.target.closest('#subjectColorPicker')) {
      const dot = e.target.closest('.color-dot');
      if (dot) {
        document.querySelectorAll('#subjectColorPicker .color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        selectedSubjectColor = dot.dataset.color;
      }
      return;
    }

    // Task check toggle
    const taskCheck = e.target.closest('.task-check');
    if (taskCheck?.dataset.taskId) {
      taskCheck.closest('.task-item')?.classList.add('just-completed');
      await toggleTask(taskCheck.dataset.taskId);
      return;
    }

    // Delete task
    const delTask = e.target.closest('[data-delete-task]');
    if (delTask) { await deleteTask(delTask.dataset.deleteTask); return; }

    // Delete subject
    if (e.target.closest('.subject-delete-btn')) {
      const btn = e.target.closest('[data-subject-id]');
      if (btn) { await deleteSubject(btn.dataset.subjectId); return; }
    }

    // Filter buttons
    const filterBtn = e.target.closest('.filter-btn');
    if (filterBtn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      filterBtn.classList.add('active');
      appState.filter = filterBtn.dataset.filter;
      renderAllTasks();
      return;
    }

    // Pomodoro controls
    if (e.target.closest('#pomoStartPause')) { if (pomoState.running) pausePomo(); else startPomo(); return; }
    if (e.target.closest('#pomoReset')) { resetPomo(); return; }
    if (e.target.closest('#pomoSkip')) { skipPomo(); return; }

    const preset = e.target.closest('.preset-btn');
    if (preset) {
      document.querySelectorAll('.preset-btn').forEach(p => p.classList.remove('active'));
      preset.classList.add('active');
      pomoState.workMin = parseInt(preset.dataset.work);
      pomoState.breakMin = parseInt(preset.dataset.break);
      resetPomo();
      return;
    }
  });

  // Input events for onboarding avatar preview
  document.getElementById('obName')?.addEventListener('input', e => {
    const preview = document.getElementById('obAvatarPreview');
    if (preview) preview.textContent = (e.target.value || 'A').charAt(0).toUpperCase();
  });

  // Quick add task
  document.getElementById('quickAddBtn')?.addEventListener('click', async () => {
    const ok = await addTask({
      title: document.getElementById('quickTaskTitle')?.value,
      subjectId: document.getElementById('quickTaskSubject')?.value,
      dueDate: document.getElementById('quickTaskDue')?.value,
      priority: document.getElementById('quickTaskPriority')?.value,
      estimatedMinutes: document.getElementById('quickTaskTime')?.value,
    });
    if (ok) ['quickTaskTitle','quickTaskDue','quickTaskTime'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
  });

  // Modal add task
  document.getElementById('modalAddTaskBtn')?.addEventListener('click', async () => {
    const ok = await addTask({
      title: document.getElementById('modalTaskTitle')?.value,
      subjectId: document.getElementById('modalTaskSubjectSelect')?.value,
      dueDate: document.getElementById('modalTaskDue')?.value,
      priority: document.getElementById('modalTaskPriority')?.value,
      estimatedMinutes: document.getElementById('modalTaskTime')?.value,
    });
    if (ok) {
      closeModal('addTaskModal');
      ['modalTaskTitle','modalTaskDue','modalTaskTime'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
    }
  });

  // Add subject
  document.getElementById('addSubjectBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('subjectName')?.value;
    const ok = await addSubject(name, selectedSubjectColor);
    if (ok) {
      closeModal('addSubjectModal');
      const el = document.getElementById('subjectName'); if (el) el.value = '';
    }
  });

  // Sort select
  document.getElementById('sortSelect')?.addEventListener('change', e => {
    appState.sort = e.target.value; renderAllTasks();
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
  document.getElementById('loginPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('loginBtn')?.click();
  });
  document.getElementById('signupConfirm')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('signupBtn')?.click();
  });
}

/* ============================================
   INIT
   ============================================ */
async function init() {
  loadTheme();
  initParticles();
  initParallax();
  initEvents();
  showLoadingScreen();

  // Listen for auth state changes
  db.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      currentUser = session.user;

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        showLoadingScreen();

        // Check if profile exists (determines if onboarding needed)
        const { data: profile } = await db
          .from('profiles')
          .select('id')
          .eq('id', currentUser.id)
          .single();

        if (!profile) {
          // Brand new user — show onboarding
          showOnboarding();
        } else {
          // Existing user — load data and show app
          await loadUserData(currentUser.id);
          showApp();
        }
      }
    } else {
      currentUser = null;
      showAuthScreen();
    }
  });

  // Check initial session
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    showAuthScreen();
  }
  // If session exists, onAuthStateChange will fire with INITIAL_SESSION
}

document.addEventListener('DOMContentLoaded', init);
