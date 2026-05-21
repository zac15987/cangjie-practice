import { LESSONS, STAGES, STAGE_KEY, buildSequence, nextStageOf } from './engine.js';
import { getSettings } from './settings.js';
import { load, save } from './storage.js';
import { playError } from './audio.js';

const VISITED_KEY = 'visited';

function markVisited(lessonId, stageId) {
  const visited = load(VISITED_KEY, {});
  visited[STAGE_KEY(lessonId, stageId)] = true;
  save(VISITED_KEY, visited);
}

function formatMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  return `${Math.round(ms)} ms`;
}

export function mountPractice(root, { lessonId, stageId, onExit, onNavigate }) {
  const lesson = LESSONS[lessonId];
  const stage = STAGES.find((s) => s.id === stageId);
  const settings = getSettings();

  markVisited(lessonId, stageId);

  let seq = buildSequence({ lessonId, stageId, settings });
  const nextTarget = nextStageOf(lessonId, stageId);
  let cursorLine = 0;
  let cursorCol = 0;
  let cellResponded = false;
  let cellFirstTryCorrect = false;
  let cellStart = 0;
  let hintShown = false;
  let finished = false;

  const stats = { total: 0, firstTryCorrect: 0, responseSum: 0 };

  root.innerHTML = `
    <section class="practice">
      <header class="practice-header">
        <button class="back-btn" type="button">← 結束</button>
        <div class="practice-title">
          <span class="lesson-label">${lesson.name}</span>
          <span class="stage-label">${stage.name}</span>
        </div>
      </header>
      <div class="stats">
        <span>進度 <strong data-stat="progress">0 / 0</strong></span>
        <span>首次正確率 <strong data-stat="accuracy">—</strong></span>
        <span>平均反應 <strong data-stat="avg">—</strong></span>
      </div>
      <div class="sequence" data-sequence></div>
      <div class="hint-row" data-hint hidden>對應鍵：<strong data-hint-key></strong></div>
      <div class="controls">
        <button type="button" data-action="hint">顯示提示</button>
        <button type="button" data-action="regenerate" ${seq.canRegenerate ? '' : 'disabled'}>換新隨機批次</button>
      </div>
      <p class="kbd-hint">按下對應的英文字母鍵（A – Y）依序作答</p>
      <div class="finish-overlay" data-finish hidden>
        <div class="finish-card">
          <h3>練習完成</h3>
          <div class="finish-stats">
            <div><span>題數</span><strong data-finish-total>—</strong></div>
            <div><span>首次正確率</span><strong data-finish-acc>—</strong></div>
            <div><span>平均反應</span><strong data-finish-avg>—</strong></div>
          </div>
          <div class="finish-buttons">
            <button type="button" data-action="replay">再來一輪 <span class="kbd">R</span></button>
            <button type="button" data-action="next" ${nextTarget ? '' : 'disabled'}>下一關 <span class="kbd">Space</span></button>
            <button type="button" data-action="new-batch" ${seq.canRegenerate ? '' : 'disabled'}>換新批次 <span class="kbd">F</span></button>
            <button type="button" data-action="back">回選單 <span class="kbd">Esc</span></button>
          </div>
        </div>
      </div>
    </section>
  `;

  const sequenceEl = root.querySelector('[data-sequence]');
  const hintEl = root.querySelector('[data-hint]');
  const hintKeyEl = root.querySelector('[data-hint-key]');
  const statProgress = root.querySelector('[data-stat="progress"]');
  const statAcc = root.querySelector('[data-stat="accuracy"]');
  const statAvg = root.querySelector('[data-stat="avg"]');
  const finishEl = root.querySelector('[data-finish]');
  const finishTotal = root.querySelector('[data-finish-total]');
  const finishAcc = root.querySelector('[data-finish-acc]');
  const finishAvg = root.querySelector('[data-finish-avg]');
  const regenBtn = root.querySelector('[data-action="regenerate"]');
  const newBatchBtn = root.querySelector('[data-action="new-batch"]');

  let cellMatrix = [];

  function renderSequence() {
    sequenceEl.innerHTML = '';
    cellMatrix = [];
    seq.lines.forEach((line, li) => {
      const row = document.createElement('div');
      row.className = 'seq-line';
      const rowCells = [];
      line.forEach((item, ci) => {
        const cell = document.createElement('span');
        cell.className = 'char';
        cell.textContent = item.radical;
        cell.dataset.line = li;
        cell.dataset.col = ci;
        row.appendChild(cell);
        rowCells.push(cell);
      });
      sequenceEl.appendChild(row);
      cellMatrix.push(rowCells);
    });
  }

  function currentItem() {
    if (finished) return null;
    return seq.lines[cursorLine][cursorCol];
  }
  function currentCell() {
    if (finished) return null;
    return cellMatrix[cursorLine][cursorCol];
  }

  function totalChars() {
    return seq.lines.reduce((n, line) => n + line.length, 0);
  }

  function updateStats() {
    statProgress.textContent = `${stats.total} / ${totalChars()}`;
    if (stats.total === 0) {
      statAcc.textContent = '—';
      statAvg.textContent = '—';
    } else {
      statAcc.textContent = `${Math.round((stats.firstTryCorrect / stats.total) * 100)}%`;
      statAvg.textContent = formatMs(stats.responseSum / stats.total);
    }
  }

  function setCursorClass() {
    const cell = currentCell();
    if (cell) cell.classList.add('current');
    updateHintForCursor();
  }

  function updateHintForCursor() {
    if (hintShown && currentItem()) {
      hintKeyEl.textContent = currentItem().key;
      hintEl.hidden = false;
    } else {
      hintEl.hidden = true;
      hintKeyEl.textContent = '';
    }
  }

  function resetCellState() {
    cellResponded = false;
    cellFirstTryCorrect = false;
    cellStart = performance.now();
    hintShown = false;
    updateHintForCursor();
  }

  function advanceCursor() {
    const line = seq.lines[cursorLine];
    if (cursorCol + 1 < line.length) {
      cursorCol++;
    } else if (cursorLine + 1 < seq.lines.length) {
      cursorLine++;
      cursorCol = 0;
    } else {
      finished = true;
      showFinish();
      return;
    }
    setCursorClass();
    resetCellState();
  }

  function showFinish() {
    finishTotal.textContent = stats.total;
    finishAcc.textContent = stats.total ? `${Math.round((stats.firstTryCorrect / stats.total) * 100)}%` : '—';
    finishAvg.textContent = stats.total ? formatMs(stats.responseSum / stats.total) : '—';
    finishEl.hidden = false;
  }

  function flashWrong() {
    const cell = currentCell();
    if (!cell) return;
    cell.classList.remove('wrong-flash');
    void cell.offsetWidth;
    cell.classList.add('wrong-flash');
    setTimeout(() => cell.classList.remove('wrong-flash'), 500);
  }

  function startRun() {
    cursorLine = 0;
    cursorCol = 0;
    finished = false;
    stats.total = 0;
    stats.firstTryCorrect = 0;
    stats.responseSum = 0;
    renderSequence();
    setCursorClass();
    resetCellState();
    updateStats();
    finishEl.hidden = true;
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (finished) {
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); startRun(); return; }
      if (e.key === ' ') {
        e.preventDefault();
        if (nextTarget) navigate(nextTarget);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); exit(); return; }
      if ((e.key === 'f' || e.key === 'F') && seq.canRegenerate) {
        e.preventDefault();
        onRegenerate();
        return;
      }
      return;
    }

    const key = e.key.toUpperCase();
    if (!/^[A-Z]$/.test(key)) return;
    e.preventDefault();

    const item = currentItem();
    if (!item) return;

    if (!cellResponded) {
      cellResponded = true;
      const dt = performance.now() - cellStart;
      stats.responseSum += dt;
      cellFirstTryCorrect = key === item.key;
    }

    if (key === item.key) {
      const cell = currentCell();
      cell.classList.remove('current', 'wrong-flash');
      cell.classList.add('correct');
      stats.total++;
      if (cellFirstTryCorrect) stats.firstTryCorrect++;
      updateStats();
      advanceCursor();
    } else {
      flashWrong();
      playError();
    }
  }

  function onHint() {
    if (finished) return;
    hintShown = true;
    updateHintForCursor();
  }

  function onRegenerate() {
    if (!seq.canRegenerate) return;
    seq = buildSequence({ lessonId, stageId, settings });
    startRun();
  }

  function cleanup() {
    window.removeEventListener('keydown', onKeyDown);
  }
  function exit() {
    cleanup();
    onExit();
  }
  function navigate(target) {
    cleanup();
    onNavigate(target);
  }

  const nextBtn = root.querySelector('[data-action="next"]');

  root.querySelector('.back-btn').addEventListener('click', exit);
  root.querySelector('[data-action="hint"]').addEventListener('click', onHint);
  regenBtn.addEventListener('click', onRegenerate);
  root.querySelector('[data-action="replay"]').addEventListener('click', () => startRun());
  nextBtn.addEventListener('click', () => { if (nextTarget) navigate(nextTarget); });
  newBatchBtn.addEventListener('click', onRegenerate);
  root.querySelector('[data-action="back"]').addEventListener('click', exit);
  window.addEventListener('keydown', onKeyDown);

  startRun();
}
