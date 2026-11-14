'use strict';

const STORAGE_KEY = 'studyPlannerData_v1';
const today = new Date();
let currentView = 'day';
let timelineMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDay = localDateString(today);
let data = loadData();
let activeTimelineDrag = null;
let suppressTimelineClickForTaskId = null;

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

function addDays(value, amount) {
  const date = parseDate(value);
  if (!date) return value;
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

function daysBetween(startValue, endValue) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end) return 0;
  return Math.round((end - start) / 86400000);
}

function updateTaskPeriod(task, mode, amount, originalStart, originalEnd) {
  let start = originalStart;
  let end = originalEnd;
  if (mode === 'move') {
    start = addDays(originalStart, amount);
    end = addDays(originalEnd, amount);
  } else if (mode === 'resize-start') {
    start = addDays(originalStart, amount);
    if (start > end) start = end;
  } else if (mode === 'resize-end') {
    end = addDays(originalEnd, amount);
    if (end < start) end = start;
  }
  task.startDate = start;
  task.dueDate = end;
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

function isTaskScheduledOn(task, dateValue) {
  const start = task.startDate || task.dueDate;
  const end = task.dueDate || start;
  return Boolean(start && end && start <= dateValue && dateValue <= end);
}

function renderStats() {
  const todayString = localDateString(today);
  const daily = data.tasks.filter((task) => isTaskScheduledOn(task, todayString));
  const weekly = data.tasks.filter((task) => task.scope === 'week' && isInCurrentWeek(task.dueDate));
  const monthly = data.tasks.filter((task) => task.scope === 'month' && isInCurrentMonth(task.dueDate));
  setProgress('today', daily);
  setProgress('week', weekly);
  setProgress('month', monthly);
}

function populateGoalSelect(select, selectedValue) {
  if (!select) return;
  select.innerHTML = '<option value="">目標に紐づけない</option>';
  [...data.goals]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((goal) => {
      const option = document.createElement('option');
      option.value = goal.id;
      option.textContent = `${goal.name}（${formatDate(goal.date)}）`;
      select.append(option);
    });
  if (data.goals.some((goal) => goal.id === selectedValue)) select.value = selectedValue;
}

function renderGoalOptions() {
  populateGoalSelect($('#taskGoal'), $('#taskGoal').value);
  const editorGoal = $('#editTaskGoal');
  if (editorGoal) populateGoalSelect(editorGoal, editorGoal.value);
}

function getTasksForView() {
  if (currentView === 'day') {
    // 学習計画表と同じタスクデータを、選択した日に実施するタスクとして表示する。
    return data.tasks.filter((task) => isTaskScheduledOn(task, selectedDay));
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
  const subjectPill = document.createElement('span');
  subjectPill.className = 'pill subject-tag';
  subjectPill.textContent = task.subject || 'その他';
  meta.append(subjectPill);
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
    milestone: '中間目標までのタスク', exam: '受験当日までのタスク', timeline: '教科別学習計画表'
  };
  const descriptions = {
    day: '選択した日に期間が重なるタスクを表示します。学習計画表で日付を変更すると、ここにも反映されます。',
    week: '今週（月曜日〜日曜日）が期限の「1週間ごと」タスクを表示しています。',
    month: '今月が期限の「1か月ごと」タスクを表示しています。',
    milestone: '登録した模試・定期テストなどに紐づくタスクをまとめています。',
    exam: '「受験当日」として登録した目標に紐づくタスクをまとめています。',
    timeline: '横軸が日にち、縦軸が教科です。横棒をドラッグして日程変更、クリックして内容の編集・削除ができます。'
  };
  $('#viewTitle').textContent = titles[currentView];
  $('#viewDescription').textContent = descriptions[currentView];
  const dayControls = $('#dayDateControls');
  dayControls.hidden = currentView !== 'day';
  if (currentView === 'day') {
    const selectedDayLabel = selectedDay === localDateString(today) ? '今日' : formatDate(selectedDay);
    $('#viewTitle').textContent = `${selectedDayLabel}のタスク`;
    $('#dayDateInput').value = selectedDay;
    $('#viewDescription').textContent = `${selectedDayLabel}に実施するタスクを表示します。開始日〜終了日の期間が選択日に重なるタスクは、学習計画表と連動します。`;
  }
document.querySelectorAll('.tab').forEach((tab) => {
    const active = tab.dataset.view === currentView;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  });

  const list = $('#taskList');
  const timelinePanel = $('#timelinePanel');
  list.replaceChildren();
  timelinePanel.hidden = currentView !== 'timeline';
  list.hidden = currentView === 'timeline';

  if (currentView === 'timeline') {
    renderTimeline();
    return;
  }

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


const SUBJECTS = ['数学', '英語', '国語', '物理', '化学', '地理・歴史', '情報', 'その他'];
const SUBJECT_CLASSES = {
  '数学': 'math', '英語': 'english', '国語': 'japanese', '物理': 'physics',
  '化学': 'chemistry', '地理・歴史': 'social', '情報': 'information', 'その他': 'other'
};

function shiftMonth(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function renderTimeline() {
  const year = timelineMonth.getFullYear();
  const month = timelineMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  $('#timelineMonthLabel').textContent = `${year}年${month + 1}月`;

  const grid = $('#timelineGrid');
  grid.replaceChildren();
  grid.style.setProperty('--day-count', daysInMonth);

  const header = document.createElement('div');
  header.className = 'timeline-header';
  header.style.gridTemplateColumns = `104px repeat(${daysInMonth}, 38px)`;
  const corner = document.createElement('div');
  corner.className = 'timeline-corner';
  corner.textContent = '教科';
  header.append(corner);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const cell = document.createElement('div');
    cell.className = 'timeline-day-heading';
    if (date.getDay() === 0) cell.classList.add('is-sunday');
    if (date.getDay() === 6) cell.classList.add('is-saturday');
    const number = document.createElement('strong');
    number.textContent = String(day);
    const weekday = document.createElement('small');
    weekday.textContent = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
    cell.append(number, weekday);
    header.append(cell);
  }
  grid.append(header);

  const monthTasks = data.tasks.filter((task) => {
    const end = task.dueDate;
    const start = task.startDate || task.dueDate;
    return end && start && start <= monthEnd && end >= monthStart;
  });
  const tasksBySubject = new Map(SUBJECTS.map((subject) => [subject, []]));
  monthTasks.forEach((task) => {
    const subject = SUBJECTS.includes(task.subject) ? task.subject : 'その他';
    tasksBySubject.get(subject).push(task);
  });

  SUBJECTS.forEach((subject) => {
    const subjectTasks = tasksBySubject.get(subject).slice().sort((a, b) => {
      const aStart = a.startDate || a.dueDate;
      const bStart = b.startDate || b.dueDate;
      return aStart.localeCompare(bStart) || a.dueDate.localeCompare(b.dueDate);
    });

    // Same-subject tasks that overlap in time are placed on separate lanes.
    const laneEnds = [];
    const placedTasks = subjectTasks.map((task) => {
      const start = task.startDate || task.dueDate;
      const clippedStart = start < monthStart ? monthStart : start;
      const clippedEnd = task.dueDate > monthEnd ? monthEnd : task.dueDate;
      let lane = laneEnds.findIndex((endDate) => endDate < clippedStart);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = clippedEnd;
      const startDay = Number(clippedStart.slice(8, 10));
      const endDay = Number(clippedEnd.slice(8, 10));
      return { task, lane, startDay, endDay };
    });

    const laneCount = Math.max(1, laneEnds.length);
    const subjectRow = document.createElement('div');
    subjectRow.className = `timeline-subject-row subject-${SUBJECT_CLASSES[subject]}`;
    subjectRow.style.gridTemplateColumns = `104px repeat(${daysInMonth}, 38px)`;
    subjectRow.style.gridTemplateRows = `repeat(${laneCount}, 40px)`;
    subjectRow.style.minHeight = `${laneCount * 40}px`;

    const subjectLabel = document.createElement('div');
    subjectLabel.className = 'timeline-subject-label';
    subjectLabel.style.gridColumn = '1';
    subjectLabel.style.gridRow = `1 / span ${laneCount}`;
    subjectLabel.textContent = subject;
    subjectRow.append(subjectLabel);

    for (let lane = 0; lane < laneCount; lane += 1) {
      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day);
        const cell = document.createElement('div');
        cell.className = 'timeline-cell';
        if (date.getDay() === 0) cell.classList.add('is-sunday');
        if (date.getDay() === 6) cell.classList.add('is-saturday');
        cell.style.gridColumn = String(day + 1);
        cell.style.gridRow = String(lane + 1);
        subjectRow.append(cell);
      }
    }

    placedTasks.forEach(({ task, lane, startDay, endDay }) => {
      const actualStart = task.startDate || task.dueDate;
      const actualEnd = task.dueDate;
      const bar = document.createElement('div');
      bar.className = `timeline-bar${task.done ? ' is-completed' : ''}`;
      bar.style.gridColumn = `${startDay + 1} / ${endDay + 2}`;
      bar.style.gridRow = String(lane + 1);
      bar.dataset.taskId = task.id;
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', `${subject}：${task.title}。${formatDate(actualStart)}から${formatDate(actualEnd)}`);
      bar.title = `${task.title}
${formatDate(actualStart)}〜${formatDate(actualEnd)}
中央をドラッグ：期間全体を移動
左端・右端をドラッグ：開始日・終了日を変更
クリック：内容を編集・削除`;

      if (actualStart >= monthStart) {
        const startHandle = document.createElement('button');
        startHandle.type = 'button';
        startHandle.className = 'timeline-handle timeline-handle-start';
        startHandle.dataset.edge = 'resize-start';
        startHandle.setAttribute('aria-label', `${task.title}の開始日を変更（現在 ${formatDate(actualStart)}）`);
        startHandle.title = 'ドラッグまたは左右キーで開始日を変更';
        startHandle.addEventListener('click', (event) => event.stopPropagation());
        startHandle.addEventListener('keydown', (event) => handleTimelineKeyboardResize(event, task, 'resize-start'));
        bar.append(startHandle);
      }

      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'timeline-bar-label';
      label.textContent = task.title;
      label.setAttribute('aria-label', `${task.title}を編集`);
      label.title = 'クリックしてタスクを編集・削除';
      label.addEventListener('click', () => {
        if (suppressTimelineClickForTaskId === task.id) {
          suppressTimelineClickForTaskId = null;
          return;
        }
        openTaskEditor(task);
      });
      bar.append(label);

      if (actualEnd <= monthEnd) {
        const endHandle = document.createElement('button');
        endHandle.type = 'button';
        endHandle.className = 'timeline-handle timeline-handle-end';
        endHandle.dataset.edge = 'resize-end';
        endHandle.setAttribute('aria-label', `${task.title}の終了日を変更（現在 ${formatDate(actualEnd)}）`);
        endHandle.title = 'ドラッグまたは左右キーで終了日を変更';
        endHandle.addEventListener('click', (event) => event.stopPropagation());
        endHandle.addEventListener('keydown', (event) => handleTimelineKeyboardResize(event, task, 'resize-end'));
        bar.append(endHandle);
      }

      bar.addEventListener('pointerdown', (event) => {
        if (event.target.closest('.timeline-handle')) {
          beginTimelineDrag(event, task, event.target.closest('.timeline-handle').dataset.edge);
        } else if (event.target.closest('.timeline-bar-label')) {
          beginTimelineDrag(event, task, 'move');
        }
      });
      subjectRow.append(bar);
    });

    grid.append(subjectRow);
  });

  const taskCount = monthTasks.length;
  $('#taskCount').textContent = `${taskCount}件`;
}

function openTaskEditor(task) {
  if (!task) return;
  renderGoalOptions();
  $('#editTaskId').value = task.id;
  $('#editTaskTitle').value = task.title || '';
  $('#editTaskSubject').value = SUBJECTS.includes(task.subject) ? task.subject : 'その他';
  $('#editTaskScope').value = task.scope || 'day';
  $('#editTaskStartDate').value = task.startDate || task.dueDate || localDateString(today);
  $('#editTaskDueDate').value = task.dueDate || task.startDate || localDateString(today);
  $('#editTaskGoal').value = task.goalId || '';
  $('#editTaskNote').value = task.note || '';
  $('#editTaskDone').checked = Boolean(task.done);
  $('#editTaskGoal').required = $('#editTaskScope').value === 'goal';
  const dialog = $('#taskEditorDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  $('#editTaskTitle').focus();
}

function closeTaskEditor() {
  const dialog = $('#taskEditorDialog');
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function beginTimelineDrag(event, task, mode) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (activeTimelineDrag) return;
  const bar = event.currentTarget;
  const captureTarget = event.target && typeof event.target.setPointerCapture === 'function' ? event.target : bar;
  const originalStart = task.startDate || task.dueDate;
  const originalEnd = task.dueDate;
  activeTimelineDrag = {
    pointerId: event.pointerId,
    task,
    mode,
    bar,
    captureTarget,
    startX: event.clientX,
    originalStart,
    originalEnd,
    deltaDays: 0,
    moved: false
  };
  bar.classList.add('is-dragging');
  try {
    captureTarget.setPointerCapture(event.pointerId);
  } catch (error) {
    // Document-level pointer listeners still handle browsers without pointer capture.
  }
}

function previewTimelineDrag(state, deltaDays) {
  const pixels = deltaDays * 38;
  const sign = pixels >= 0 ? '-' : '+';
  const amount = Math.abs(pixels);
  if (state.mode === 'move') {
    state.bar.style.transform = `translateX(${pixels}px)`;
  } else if (state.mode === 'resize-start') {
    state.bar.style.transform = `translateX(${pixels}px)`;
    state.bar.style.width = `calc(100% ${sign} ${amount}px)`;
  } else if (state.mode === 'resize-end') {
    const endSign = pixels >= 0 ? '+' : '-';
    state.bar.style.width = `calc(100% ${endSign} ${amount}px)`;
  }
}

function clearTimelineDragPreview(state) {
  state.bar.classList.remove('is-dragging');
  state.bar.style.transform = '';
  state.bar.style.width = '';
}

function finishTimelineDrag(event, commit) {
  const state = activeTimelineDrag;
  if (!state || event.pointerId !== state.pointerId) return;
  activeTimelineDrag = null;
  clearTimelineDragPreview(state);
  if (!commit || state.deltaDays === 0) return;

  updateTaskPeriod(state.task, state.mode, state.deltaDays, state.originalStart, state.originalEnd);
  suppressTimelineClickForTaskId = state.task.id;
  // Let the browser dispatch the click generated after pointerup before replacing the bar.
  window.setTimeout(() => {
    saveData();
    renderAll();
    if (suppressTimelineClickForTaskId === state.task.id) {
      suppressTimelineClickForTaskId = null;
    }
  }, 0);
}

function handleTimelineKeyboardResize(event, task, mode) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  event.stopPropagation();
  const amount = event.key === 'ArrowLeft' ? -1 : 1;
  const start = task.startDate || task.dueDate;
  const end = task.dueDate;
  updateTaskPeriod(task, mode, amount, start, end);
  saveData();
  renderAll();
  const nextHandle = [...document.querySelectorAll('.timeline-handle')]
    .find((handle) => handle.closest('.timeline-bar')?.dataset.taskId === task.id && handle.dataset.edge === mode);
  nextHandle?.focus();
}

document.addEventListener('pointermove', (event) => {
  const state = activeTimelineDrag;
  if (!state || event.pointerId !== state.pointerId) return;
  let deltaDays = Math.round((event.clientX - state.startX) / 38);
  const duration = daysBetween(state.originalStart, state.originalEnd);
  if (state.mode === 'resize-start') deltaDays = Math.min(deltaDays, duration);
  if (state.mode === 'resize-end') deltaDays = Math.max(deltaDays, -duration);
  state.deltaDays = deltaDays;
  state.moved = state.moved || deltaDays !== 0;
  previewTimelineDrag(state, deltaDays);
});

document.addEventListener('pointerup', (event) => finishTimelineDrag(event, true));
document.addEventListener('pointercancel', (event) => finishTimelineDrag(event, false));

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
  $('#taskStartDate').value = todayString;
  $('#taskDate').value = todayString;
  $('#goalDate').value = todayString;
}

taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = $('#taskTitle').value.trim();
  const subject = $('#taskSubject').value;
  const startDate = $('#taskStartDate').value;
  const dueDate = $('#taskDate').value;
  const scope = $('#taskScope').value;
  const goalId = $('#taskGoal').value || null;
  if (!title || !subject || !startDate || !dueDate) return;
  if (startDate > dueDate) {
    window.alert('開始日は終了日（期限）以前の日付にしてください。');
    $('#taskStartDate').focus();
    return;
  }
  if (scope === 'goal' && !goalId) {
    window.alert('「目標までのタスク」を選んだ場合は、関連する目標も選んでください。');
    $('#taskGoal').focus();
    return;
  }
  data.tasks.push({
    id: makeId(),
    title,
    subject,
    scope,
    startDate,
    dueDate,
    goalId,
    note: $('#taskNote').value.trim(),
    done: false
  });
  saveData();
  taskForm.reset();
  $('#taskGoal').required = false;
  $('#taskStartDate').value = localDateString(today);
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

$('#previousMonth').addEventListener('click', () => {
  timelineMonth = shiftMonth(timelineMonth, -1);
  if (currentView === 'timeline') renderTimeline();
});

$('#nextMonth').addEventListener('click', () => {
  timelineMonth = shiftMonth(timelineMonth, 1);
  if (currentView === 'timeline') renderTimeline();
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


$('#editTaskScope').addEventListener('change', () => {
  $('#editTaskGoal').required = $('#editTaskScope').value === 'goal';
});

$('#taskEditorForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const task = data.tasks.find((item) => item.id === $('#editTaskId').value);
  if (!task) {
    closeTaskEditor();
    return;
  }
  const startDate = $('#editTaskStartDate').value;
  const dueDate = $('#editTaskDueDate').value;
  const scope = $('#editTaskScope').value;
  const goalId = $('#editTaskGoal').value || null;
  if (!startDate || !dueDate || startDate > dueDate) {
    window.alert('開始日は終了日（期限）以前の日付にしてください。');
    $('#editTaskStartDate').focus();
    return;
  }
  if (scope === 'goal' && !goalId) {
    window.alert('「目標までのタスク」を選んだ場合は、関連する目標を選んでください。');
    $('#editTaskGoal').focus();
    return;
  }
  task.title = $('#editTaskTitle').value.trim();
  task.subject = $('#editTaskSubject').value;
  task.scope = scope;
  task.startDate = startDate;
  task.dueDate = dueDate;
  task.goalId = goalId;
  task.note = $('#editTaskNote').value.trim();
  task.done = $('#editTaskDone').checked;
  saveData();
  closeTaskEditor();
  renderAll();
});

$('#deleteTaskFromEditor').addEventListener('click', () => {
  const task = data.tasks.find((item) => item.id === $('#editTaskId').value);
  if (!task) return closeTaskEditor();
  if (!window.confirm(`「${task.title}」を削除しますか？この操作は取り消せません。`)) return;
  data.tasks = data.tasks.filter((item) => item.id !== task.id);
  saveData();
  closeTaskEditor();
  renderAll();
});

$('#cancelTaskEdit').addEventListener('click', closeTaskEditor);
$('#closeTaskEditor').addEventListener('click', closeTaskEditor);
$('#taskEditorDialog').addEventListener('click', (event) => {
  if (event.target === $('#taskEditorDialog')) closeTaskEditor();
});

function changeSelectedDay(amount) {
  const date = parseDate(selectedDay);
  date.setDate(date.getDate() + amount);
  selectedDay = localDateString(date);
  renderTaskView();
  renderStats();
}

$('#dayDateInput').addEventListener('change', () => {
  if (!$('#dayDateInput').value) return;
  selectedDay = $('#dayDateInput').value;
  renderTaskView();
});
$('#previousDay').addEventListener('click', () => changeSelectedDay(-1));
$('#nextDay').addEventListener('click', () => changeSelectedDay(1));
$('#todayButton').addEventListener('click', () => {
  selectedDay = localDateString(today);
  renderTaskView();
});

initializeDates();
renderAll();
