import { LESSONS, STAGE_KEY, stagesFor } from '../engine.js';
import { load } from '../storage.js';

const VISITED_KEY = 'visited';

export function mountMenu(root, { onSelect, onOpenSettings }) {
  const visited = load(VISITED_KEY, {});

  const lessonBlocks = LESSONS.map((lesson) => {
    const radicalsStr = lesson.keys.map((k) => k.radical).join('');
    const keysStr = lesson.keys.map((k) => k.key).join(' ');
    const stages = stagesFor(lesson).map((stage) => {
      const key = STAGE_KEY(lesson.id, stage.id);
      const done = visited[key] ? ' visited' : '';
      return `
        <button type="button" class="stage-cell${done}"
                data-lesson="${lesson.id}" data-stage="${stage.id}">
          <span class="stage-name">${stage.name}</span>
          ${visited[key] ? '<span class="visited-mark">●</span>' : ''}
        </button>
      `;
    }).join('');
    return `
      <section class="lesson-block">
        <header class="lesson-header">
          <h2><span class="lesson-id">L${lesson.id + 1}</span> ${lesson.name}</h2>
          <div class="lesson-radicals">${radicalsStr}</div>
          <div class="lesson-keys">${keysStr}</div>
        </header>
        <div class="stage-grid">${stages}</div>
      </section>
    `;
  }).join('');

  root.innerHTML = `
    <section class="menu">
      <header class="menu-header">
        <h1>24 字母練習</h1>
        <button class="settings-btn" type="button" aria-label="設定">⚙</button>
      </header>
      <p class="menu-intro">選擇分組與練習關卡。所有關卡自由選，無解鎖限制。</p>
      ${lessonBlocks}
    </section>
  `;

  root.querySelector('.settings-btn').addEventListener('click', onOpenSettings);

  for (const btn of root.querySelectorAll('.stage-cell')) {
    btn.addEventListener('click', () => {
      const lessonId = parseInt(btn.dataset.lesson, 10);
      const stageId = btn.dataset.stage;
      onSelect({ lessonId, stageId });
    });
  }
}
