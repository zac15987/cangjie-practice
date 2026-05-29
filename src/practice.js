import {
  lessonsFor,
  stagesFor,
  STAGE_KEY,
  buildSequence,
  nextStageOf,
} from './engine.js';
import { getSettings } from './settings.js';
import { load, save } from './storage.js';
import { playError } from './audio.js';

const VISITED_KEY = 'visited';

function markVisited(lessonId, stageId, section) {
  const visited = load(VISITED_KEY, {});
  visited[STAGE_KEY(lessonId, stageId, section)] = true;
  save(VISITED_KEY, visited);
}

function formatInt(n) {
  if (!Number.isFinite(n)) return '—';
  return String(Math.round(n));
}

function formatPct(p) {
  if (!Number.isFinite(p)) return '—';
  return `${Math.round(p)}%`;
}

function mean(arr) {
  if (arr.length === 0) return NaN;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function stdDev(arr) {
  if (arr.length < 2) return NaN;
  const m = mean(arr);
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// Monkeytype's kogasa function: smooth 0–100 from coefficient of variation.
function kogasa(cv) {
  return 100 * (1 - Math.tanh(cv + (cv ** 3) / 3 + (cv ** 5) / 5));
}

// Need enough per-second samples for the CV to be meaningful.
const MIN_SECONDS_FOR_CONSISTENCY = 3;

export function mountPractice(root, { lessonId, stageId, section = 'radical', onExit, onNavigate }) {
  const lesson = lessonsFor(section)[lessonId];
  const stage = stagesFor(lesson, section).find((s) => s.id === stageId);
  const settings = getSettings();

  markVisited(lessonId, stageId, section);

  let seq = buildSequence({ lessonId, stageId, settings, section });
  const nextTarget = nextStageOf(lessonId, stageId, section);
  let cursorLine = 0;
  let cursorCol = 0;
  let hintShown = false;
  let finished = false;

  // Monkeytype-style stats.
  //  - correctChars: every correct keypress (advances cursor)
  //  - incorrectChars: every wrong keypress (rejected, cursor stays)
  //  - rawHistory: per-second count of *all* keypresses, for consistency CV
  //  - timer pauses when window is hidden or blurred (AFK)
  const stats = { correctChars: 0, incorrectChars: 0 };
  let secondCounter = 0;
  let rawHistory = [];
  let testStartedAt = 0;
  let totalPausedMs = 0;
  let pauseStartedAt = 0;
  let secondInterval = null;

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
        <span>速度 <strong data-stat="cpm">—</strong></span>
        <span>原始 <strong data-stat="raw">—</strong></span>
        <span>正確率 <strong data-stat="accuracy">—</strong></span>
        <span>穩定度 <strong data-stat="consistency">—</strong></span>
      </div>
      <div class="sequence" data-sequence></div>
      <input
        class="capture-input"
        data-capture-input
        type="password"
        inputmode="text"
        autocomplete="new-password"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        aria-label="輸入答案"
        tabindex="-1"
      />
      <div class="hint-row" data-hint hidden>對應鍵：<strong data-hint-key></strong></div>
      <div class="peek-overlay" data-peek hidden>
        <div class="peek-card"><strong data-peek-content></strong></div>
      </div>
      <div class="controls">
        <button type="button" data-action="hint">顯示提示</button>
        <button type="button" data-action="regenerate" ${seq.canRegenerate ? '' : 'disabled'}>換新隨機批次</button>
      </div>
      <p class="kbd-hint">按下對應的英文字母鍵（A – Y）依序作答；手機請點擊字元區開啟鍵盤</p>
      <div class="finish-overlay" data-finish hidden>
        <div class="finish-card">
          <h3>練習完成</h3>
          <div class="finish-stats">
            <div><span>題數</span><strong data-finish-total>—</strong></div>
            <div><span>速度</span><strong data-finish-cpm>—</strong></div>
            <div><span>原始</span><strong data-finish-raw>—</strong></div>
            <div><span>正確率</span><strong data-finish-acc>—</strong></div>
            <div><span>穩定度</span><strong data-finish-consistency>—</strong></div>
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
  const peekEl = root.querySelector('[data-peek]');
  const peekContentEl = root.querySelector('[data-peek-content]');
  const statProgress = root.querySelector('[data-stat="progress"]');
  const statCpm = root.querySelector('[data-stat="cpm"]');
  const statRaw = root.querySelector('[data-stat="raw"]');
  const statAcc = root.querySelector('[data-stat="accuracy"]');
  const statConsistency = root.querySelector('[data-stat="consistency"]');
  const finishEl = root.querySelector('[data-finish]');
  const finishTotal = root.querySelector('[data-finish-total]');
  const finishCpm = root.querySelector('[data-finish-cpm]');
  const finishRaw = root.querySelector('[data-finish-raw]');
  const finishAcc = root.querySelector('[data-finish-acc]');
  const finishConsistency = root.querySelector('[data-finish-consistency]');
  const regenBtn = root.querySelector('[data-action="regenerate"]');
  const newBatchBtn = root.querySelector('[data-action="new-batch"]');
  const captureInput = root.querySelector('[data-capture-input]');

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
        if (item.svg) {
          cell.classList.add('char--svg');
          const img = document.createElement('img');
          img.src = `auxiliary/${item.svg}`;
          img.alt = item.key;
          img.className = 'char-img';
          cell.appendChild(img);
        } else {
          cell.textContent = item.radical;
        }
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

  function getElapsedSeconds() {
    if (!testStartedAt) return 0;
    const now = performance.now();
    let elapsed = now - testStartedAt - totalPausedMs;
    if (pauseStartedAt) elapsed -= (now - pauseStartedAt);
    return Math.max(0, elapsed / 1000);
  }

  function computeStats() {
    const elapsed = getElapsedSeconds();
    const total = stats.correctChars + stats.incorrectChars;
    const cpm = elapsed > 0 ? (stats.correctChars * 60) / elapsed : NaN;
    const rawCpm = elapsed > 0 ? (total * 60) / elapsed : NaN;
    const accuracy = total > 0 ? (stats.correctChars / total) * 100 : NaN;
    let cons = NaN;
    if (rawHistory.length >= MIN_SECONDS_FOR_CONSISTENCY) {
      const m = mean(rawHistory);
      if (m > 0) cons = kogasa(stdDev(rawHistory) / m);
    }
    return { cpm, rawCpm, accuracy, consistency: cons };
  }

  function updateStats() {
    statProgress.textContent = `${stats.correctChars} / ${totalChars()}`;
    const s = computeStats();
    statCpm.textContent = formatInt(s.cpm);
    statRaw.textContent = formatInt(s.rawCpm);
    statAcc.textContent = formatPct(s.accuracy);
    statConsistency.textContent = formatPct(s.consistency);
  }

  function setCursorClass() {
    const cell = currentCell();
    if (cell) cell.classList.add('current');
    updateHintForCursor();
    scrollCursorIntoView();
  }

  function scrollCursorIntoView() {
    const cell = currentCell();
    if (!cell) return;
    const rect = cell.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewTop = vv ? vv.offsetTop : 0;
    const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const margin = 100;
    if (rect.bottom > viewBottom - margin) {
      window.scrollBy({ top: rect.bottom - (viewBottom - margin), behavior: 'smooth' });
    } else if (rect.top < viewTop + margin) {
      window.scrollBy({ top: rect.top - (viewTop + margin), behavior: 'smooth' });
    }
  }

  function adjustBottomPadding() {
    const vv = window.visualViewport;
    if (!vv) return;
    const keyboardHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.body.style.paddingBottom = keyboardHeight > 0 ? keyboardHeight + 'px' : '';
  }

  function onViewportResize() {
    adjustBottomPadding();
    if (!finished) scrollCursorIntoView();
  }

  function updateHintForCursor() {
    if (hintShown && currentItem()) {
      const item = currentItem();
      hintKeyEl.textContent = section === 'aux' ? item.radical : item.key;
      hintEl.hidden = false;
    } else {
      hintEl.hidden = true;
      hintKeyEl.textContent = '';
    }
  }

  function resetCellState() {
    hintShown = false;
    updateHintForCursor();
  }

  function tickSecond() {
    rawHistory.push(secondCounter);
    secondCounter = 0;
  }

  function startSecondInterval() {
    if (secondInterval) return;
    secondInterval = setInterval(tickSecond, 1000);
  }

  function stopSecondInterval() {
    if (secondInterval) {
      clearInterval(secondInterval);
      secondInterval = null;
    }
  }

  function ensureTestStarted() {
    if (testStartedAt || finished) return;
    testStartedAt = performance.now();
    startSecondInterval();
  }

  function pauseRun() {
    if (!testStartedAt || finished || pauseStartedAt) return;
    pauseStartedAt = performance.now();
    stopSecondInterval();
  }

  function resumeRun() {
    if (!testStartedAt || finished || !pauseStartedAt) return;
    totalPausedMs += performance.now() - pauseStartedAt;
    pauseStartedAt = 0;
    startSecondInterval();
  }

  function stopAllTimers() {
    stopSecondInterval();
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
      stopAllTimers();
      showFinish();
      return;
    }
    setCursorClass();
    resetCellState();
  }

  function showFinish() {
    const s = computeStats();
    finishTotal.textContent = stats.correctChars;
    finishCpm.textContent = formatInt(s.cpm);
    finishRaw.textContent = formatInt(s.rawCpm);
    finishAcc.textContent = formatPct(s.accuracy);
    finishConsistency.textContent = formatPct(s.consistency);
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
    stats.correctChars = 0;
    stats.incorrectChars = 0;
    secondCounter = 0;
    rawHistory = [];
    testStartedAt = 0;
    totalPausedMs = 0;
    pauseStartedAt = 0;
    stopAllTimers();
    renderSequence();
    window.scrollTo(0, 0);
    setCursorClass();
    resetCellState();
    updateStats();
    finishEl.hidden = true;
  }

  function processKey(key) {
    if (finished) return;
    const item = currentItem();
    if (!item) return;

    ensureTestStarted();
    secondCounter++;

    if (key === item.key) {
      stats.correctChars++;
      const cell = currentCell();
      cell.classList.remove('current', 'wrong-flash');
      cell.classList.add('correct');
      updateStats();
      advanceCursor();
    } else {
      stats.incorrectChars++;
      flashWrong();
      playError();
      updateStats();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Alt') {
      e.preventDefault(); // 防止 Windows 把焦點移到視窗選單列
      showPeek();
      return;
    }
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
    if (document.activeElement === captureInput) return;
    e.preventDefault();
    processKey(key);
  }

  function onKeyUp(e) {
    if (e.key === 'Alt') hidePeek();
  }

  function onCaptureBeforeInput(e) {
    e.preventDefault();
    const data = e.data || '';
    for (const ch of data) {
      const k = ch.toUpperCase();
      if (/^[A-Z]$/.test(k)) processKey(k);
    }
  }

  function onCaptureInput() {
    const val = captureInput.value;
    captureInput.value = '';
    if (!val) return;
    for (const ch of val) {
      const k = ch.toUpperCase();
      if (/^[A-Z]$/.test(k)) processKey(k);
    }
  }

  function focusCapture() {
    if (finished) return;
    captureInput.focus({ preventScroll: true });
  }

  function onHint() {
    if (finished) return;
    hintShown = true;
    updateHintForCursor();
  }

  function showPeek() {
    if (finished) return;
    const item = currentItem();
    if (!item) return;
    peekContentEl.textContent = section === 'aux' ? item.radical : item.key;
    peekEl.hidden = false;
  }
  function hidePeek() {
    peekEl.hidden = true;
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      hidePeek();
      pauseRun();
    } else {
      resumeRun();
    }
  }
  function onWindowBlur() {
    hidePeek();
    pauseRun();
  }
  function onWindowFocus() {
    resumeRun();
  }

  function onRegenerate() {
    if (!seq.canRegenerate) return;
    seq = buildSequence({ lessonId, stageId, settings, section });
    startRun();
  }

  function cleanup() {
    stopAllTimers();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('focus', onWindowFocus);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', onViewportResize);
    }
    document.body.style.paddingBottom = '';
  }
  function exit() {
    cleanup();
    onExit();
  }
  function navigate(target) {
    cleanup();
    onNavigate({ ...target, section });
  }

  const nextBtn = root.querySelector('[data-action="next"]');

  root.querySelector('.back-btn').addEventListener('click', exit);
  root.querySelector('[data-action="hint"]').addEventListener('click', onHint);
  regenBtn.addEventListener('click', onRegenerate);
  root.querySelector('[data-action="replay"]').addEventListener('click', () => { startRun(); focusCapture(); });
  nextBtn.addEventListener('click', () => { if (nextTarget) navigate(nextTarget); });
  newBatchBtn.addEventListener('click', () => { onRegenerate(); focusCapture(); });
  root.querySelector('[data-action="back"]').addEventListener('click', exit);
  sequenceEl.addEventListener('click', focusCapture);
  captureInput.addEventListener('beforeinput', onCaptureBeforeInput);
  captureInput.addEventListener('input', onCaptureInput);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('focus', onWindowFocus);
  document.addEventListener('visibilitychange', onVisibilityChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportResize);
  }

  startRun();
  focusCapture();
}
