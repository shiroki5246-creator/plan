'use strict';

const STORAGE_KEY = 'studyPlannerData_v1';
const today = new Date();
let currentView = 'day';
let data = loadData();

const $ = (selector) => document.querySelector(selector);
const taskForm = $('#taskForm');
const goalForm = $('#goalForm');

function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return '日付未設定';
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { tasks: [], goals: [] };
    const parsed = JSON.parse(saved);
    return {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : []
    };
  } catch (error) {
    console.error('保存データを読み込めませんでした:', error);
    return { tasks: [], goals: [] };
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    $('#saveStatus').textContent = '保存済み';
  } catch (error) {
    console.error('保存に失敗しました:', error);
    $('#saveStatus').textContent = '保存できませんでした';
  }
}

function getWeekRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: localDateString(start), end: localDateString(end) };
}

function isInCurrentWeek(value) {
  const range = getWeekRange(today);
  return value >= range.start && value <= range.end;
}

function isInCurrentMonth(value) {
  const date = parseDate(value);
  return date && date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
}

function getGoal(goalId) {
  return data.goals.find((goal) => goal.id === goalId);
}

function getGoalTasks(goalId) {
  return data.tasks.filter((task) => task.goalId === goalId);
}

function getProgress(tasks) {
  const done = tasks.filter((task) => task.done).length;
  const total = tasks.length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

function setProgress(prefix, tasks) {
  const progress = getProgress(tasks);
  $(`#${prefix}Progress`).textContent = `${progress.done}/${progress.total}`;
  $(`#${prefix}Percent`).textContent = `${progress.percent}%`;
  $(`#${prefix}Bar`).style.width = `${progress.percent}%`;
}

function renderStats() {
  const todayString = localDateString(today);
  const daily = data.tasks.filter((task) => task.scope === 'day' && task.dueDate === todayString);
  const weekly = data.tasks.filter((task) => task.scope === 'week' && isInCurrentWeek(task.dueDate));
  const monthly = data.tasks.filter((task) => task.scope === 'month' && isInCurrentMonth(task.dueDate));
  setProgress('today', daily);
  setProgress('week', weekly);
  setProgress('month', monthly);
}

function renderGoalOptions() {
  const select = $('#taskGoal');
  const selected = select.value;
  select.innerHTML = '<option value="">目標に紐づけない</option>';
  [...data.goals]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((goal) => {
      const option = document.createElement('option');
      option.value = goal.id;
      option.textContent = `${goal.name}（${formatDate(goal.date)}）`;
      select.append(option);
    });
  if (data.goals.some((goal) => goal.id === selected)) select.value = selected;
}

function getTasksForView() {
  const todayString = localDateString(today);
  if (currentView === 'day') {
    return data.tasks.filter((task) => task.scope === 'day' && task.dueDate === todayString);
  }
  if (currentView === 'week') {
    return data.tasks.filter((task) => task.scope === 'week' && isInCurrentWeek(task.dueDate));
  }
  if (currentView === 'month') {
    return data.tasks.filter((task) => task.scope === 'month' && isInCurrentMonth(task.dueDate));
  }
  if (currentView === 'milestone') {
    const ids = data.goals.filter((goal) => goal.type === 'milestone').map((goal) => goal.id);
    return data.tasks.filter((task) => ids.includes(task.goalId));
  }
  const examIds = data.goals.filter((goal) => goal.type === 'exam').map((goal) => goal.id);
  return data.tasks.filter((task) => examIds.includes(task.goalId));
}

function renderTask(task) {
  const item = document.createElement('article');
  item.className = `task-item${task.done ? ' completed' : ''}`;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-check';
  checkbox.checked = Boolean(task.done);
  checkbox.setAttribute('aria-label', `${task.title}を完了にする`);
  checkbox.addEventListener('change', () => {
    task.done = checkbox.checked;
    saveData();
    renderAll();
  });

  const main = document.createElement('div');
  main.className = 'task-main';
  const title = document.createElement('p');
  title.className = 'task-title';
  title.textContent = task.title;
  main.append(title);

  if (task.note) {
    const note = document.createElement('p');
    note.className = 'task-note';
    note.textContent = task.note;
    main.append(note);
  }

  const meta = document.createElement('div');
  meta.className = 'task-meta';
  const scopeNames = { day: '1日', week: '週間', month: '月間', goal: '目標' };
  const scopePill = document.createElement('span');
  scopePill.className = `pill ${task.scope}`;
  scopePill.textContent = scopeNames[task.scope] || 'タスク';
  meta.append(scopePill);
  const goal = getGoal(task.goalId);
  if (goal) {
    const goalPill = document.createElement('span');
    goalPill.className = 'pill';
    goalPill.textContent = goal.name;
    meta.append(goalPill);
  }
  main.append(meta);

  const actions = document.createElement('div');
  actions.className = 'task-actions';
  const date = document.createElement('span');
  date.className = 'task-date';
  date.textContent = formatDate(task.dueDate);
  actions.append(date);
  const remove = document.createElement('button');
  remove.className = 'delete-button';
  remove.type = 'button';
  remove.textContent = '×';
  remove.setAttribute('aria-label', `${task.title}を削除`);
  remove.addEventListener('click', () => {
    if (!window.confirm(`「${task.title}」を削除しますか？`)) return;
    data.tasks = data.tasks.filter((item) => item.id !== task.id);
    saveData();
    renderAll();
  });
  actions.append(remove);
  item.append(checkbox, main, actions);
  return item;
}

function renderTaskView() {
  const titles = {
    day: '今日のタスク', week: '今週のタスク', month: '今月のタスク',
    milestone: '中間目標までのタスク', exam: '受験当日までのタスク'
  };
  const descriptions = {
    day: '今日が期限の「1日ごと」タスクを表示しています。',
    week: '今週（月曜日〜日曜日）が期限の「1週間ごと」タスクを表示しています。',
    month: '今月が期限の「1か月ごと」タスクを表示しています。',
    milestone: '登録した模試・定期テストなどに紐づくタスクをまとめています。',
    exam: '「受験当日」として登録した目標に紐づくタスクをまとめています。'
  };
  $('#viewTitle').textContent = titles[currentView];
  $('#viewDescription').textContent = descriptions[currentView];
  $('#taskScope').addEventListener('change', () => {
  const needsGoal = $('#taskScope').value === 'goal';
  $('#taskGoal').required = needsGoal;
});

document.querySelectorAll('.tab').forEach((tab) => {
    const active = tab.dataset.view === currentView;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  });

  const list = $('#taskList');
  list.replaceChildren();

  if (currentView === 'milestone' || currentView === 'exam') {
    const type = currentView === 'milestone' ? 'milestone' : 'exam';
    const goals = data.goals.filter((goal) => goal.type === type).sort((a, b) => a.date.localeCompare(b.date));
    if (goals.length) {
      goals.forEach((goal) => {
        const card = document.createElement('div');
        card.className = 'goal-view-card';
        const name = document.createElement('strong');
        name.textContent = goal.name;
        const date = document.createElement('p');
        const days = Math.ceil((parseDate(goal.date) - parseDate(localDateString(today))) / 86400000);
        const relative = days < 0 ? `${Math.abs(days)}日経過` : days === 0 ? '今日が目標日' : 'あと' + days + '日';
        date.textContent = `${formatDate(goal.date)}（${relative}）`;
        card.append(name, date);
        list.append(card);
        const associatedTasks = getGoalTasks(goal.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        associatedTasks.forEach((task) => list.append(renderTask(task)));
        if (!associatedTasks.length) {
          const empty = document.createElement('div');
          empty.className = 'empty-state';
          empty.textContent = 'この目標に紐づくタスクはまだありません。上のフォームから追加できます。';
          list.append(empty);
        }
      });
      $('#taskCount').textContent = `${data.tasks.filter((task) => goals.some((goal) => goal.id === task.goalId)).length}件`;
      return;
    }
  }

  const tasks = getTasksForView().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  $('#taskCount').textContent = `${tasks.length}件`;
  if (!tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = currentView === 'exam' && !data.goals.some((goal) => goal.type === 'exam')
      ? 'まず「受験当日」の目標を登録しましょう。'
      : 'まだタスクがありません。上のフォームから追加してみましょう。';
    list.append(empty);
    return;
  }
  tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).forEach((task) => list.append(renderTask(task)));
}

function renderGoals() {
  const list = $('#goalList');
  list.replaceChildren();
  $('#goalCount').textContent = `${data.goals.length}件`;
  const goals = [...data.goals].sort((a, b) => a.date.localeCompare(b.date));
  if (!goals.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '模試・定期テスト・受験日などを登録しましょう。';
    list.append(empty);
    return;
  }
  goals.forEach((goal) => {
    const tasks = getGoalTasks(goal.id);
    const progress = getProgress(tasks);
    const card = document.createElement('article');
    card.className = 'goal-card';
    const top = document.createElement('div');
    top.className = 'goal-card-top';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = goal.name;
    const date = document.createElement('small');
    date.textContent = formatDate(goal.date);
    info.append(name, date);
    const kind = document.createElement('span');
    kind.className = `goal-kind${goal.type === 'exam' ? ' exam' : ''}`;
    kind.textContent = goal.type === 'exam' ? '受験' : '中間目標';
    top.append(info, kind);
    const progressLabel = document.createElement('div');
    progressLabel.className = 'goal-progress';
    const label = document.createElement('span');
    label.textContent = '紐づくタスクの達成率';
    const value = document.createElement('span');
    value.textContent = `${progress.done}/${progress.total}（${progress.percent}%）`;
    progressLabel.append(label, value);
    const track = document.createElement('div');
    track.className = 'goal-progress-track';
    const fill = document.createElement('div');
    fill.className = 'goal-progress-fill';
    fill.style.width = `${progress.percent}%`;
    track.append(fill);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'goal-delete';
    remove.textContent = '目標を削除';
    remove.addEventListener('click', () => {
      if (!window.confirm(`「${goal.name}」と、この目標に紐づくタスクを削除しますか？`)) return;
      data.goals = data.goals.filter((item) => item.id !== goal.id);
      data.tasks = data.tasks.filter((task) => task.goalId !== goal.id);
      saveData();
      renderAll();
    });
    card.append(top, progressLabel, track, remove);
    list.append(card);
  });
}

function renderExamCountdown() {
  const exams = data.goals.filter((goal) => goal.type === 'exam').sort((a, b) => a.date.localeCompare(b.date));
  const nextExam = exams.find((goal) => goal.date >= localDateString(today));
  if (!nextExam) {
    $('#examCountdown').textContent = '—';
    $('#examDateLabel').textContent = '受験日を登録してください';
    return;
  }
  const days = Math.ceil((parseDate(nextExam.date) - parseDate(localDateString(today))) / 86400000);
  $('#examCountdown').innerHTML = `${days}<small>日</small>`;
  $('#examDateLabel').textContent = `${nextExam.name}・${formatDate(nextExam.date)}`;
}

function renderAll() {
  renderGoalOptions();
  renderStats();
  renderTaskView();
  renderGoals();
  renderExamCountdown();
}

function initializeDates() {
  const todayString = localDateString(today);
  $('#todayLabel').textContent = today.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  $('#taskDate').value = todayString;
  $('#goalDate').value = todayString;
}

taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = $('#taskTitle').value.trim();
  const dueDate = $('#taskDate').value;
  const scope = $('#taskScope').value;
  const goalId = $('#taskGoal').value || null;
  if (!title || !dueDate) return;
  if (scope === 'goal' && !goalId) {
    window.alert('「目標までのタスク」を選んだ場合は、関連する目標も選んでください。');
    $('#taskGoal').focus();
    return;
  }
  data.tasks.push({
    id: makeId(),
    title,
    scope,
    dueDate,
    goalId,
    note: $('#taskNote').value.trim(),
    done: false
  });
  saveData();
  taskForm.reset();
  $('#taskGoal').required = false;
  $('#taskDate').value = localDateString(today);
  currentView = scope === 'goal' ? (getGoal(goalId)?.type === 'exam' ? 'exam' : 'milestone') : scope;
  renderAll();
  $('#taskTitle').focus();
});

goalForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#goalName').value.trim();
  const date = $('#goalDate').value;
  if (!name || !date) return;
  data.goals.push({ id: makeId(), name, type: $('#goalType').value, date });
  saveData();
  goalForm.reset();
  $('#goalDate').value = localDateString(today);
  renderAll();
});

$('#taskScope').addEventListener('change', () => {
  const needsGoal = $('#taskScope').value === 'goal';
  $('#taskGoal').required = needsGoal;
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    currentView = tab.dataset.view;
    renderTaskView();
  });
});

$('#backupButton').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `study-planner-backup-${localDateString(today)}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

initializeDates();
renderAll();
