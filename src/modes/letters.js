import { lessonsFor, stagesFor, STAGE_KEY } from '../engine.js';
import { load } from '../storage.js';

const VISITED_KEY = 'visited';

const SECTION_LABELS = {
  radical: '字根練習',
  aux: '輔助字形',
};

const SECTION_REFS = {
  radical: {
    href: 'https://zh.wikibooks.org/wiki/%E5%80%89%E9%A0%A1%E8%BC%B8%E5%85%A5%E6%B3%95/%E5%80%89%E9%A0%A1%E5%AD%97%E6%AF%8D%E8%88%87%E9%8D%B5%E4%BD%8D',
    title: '倉頡輸入法/倉頡字母與鍵位',
  },
  aux: {
    href: 'https://zh.wikibooks.org/wiki/%E5%80%89%E9%A0%A1%E8%BC%B8%E5%85%A5%E6%B3%95/%E8%BC%94%E5%8A%A9%E5%AD%97%E5%BD%A2',
    title: '倉頡輸入法/輔助字形',
  },
};

export function mountMenu(root, { section, onSelect, onSwitchSection, onOpenSettings }) {
  const visited = load(VISITED_KEY, {});
  const lessons = lessonsFor(section);

  const lessonBlocks = lessons.map((lesson) => {
    const radicalsStr = lesson.keys.map((k) => k.radical).join('');
    const keysStr = lesson.keys.map((k) => k.key).join(' ');
    const stages = stagesFor(lesson, section).map((stage) => {
      const key = STAGE_KEY(lesson.id, stage.id, section);
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

  const sectionToggle = Object.entries(SECTION_LABELS).map(([id, label]) => {
    const active = id === section ? ' active' : '';
    return `<button type="button" class="section-tab${active}" data-section="${id}">${label}</button>`;
  }).join('');

  const ref = SECTION_REFS[section];

  root.innerHTML = `
    <section class="menu">
      <header class="menu-header">
        <div class="menu-title-group">
          <img class="menu-logo" src="./favicon.svg" alt="" width="64" height="64" />
          <h1>倉頡練習</h1>
        </div>
        <button class="settings-btn" type="button" aria-label="設定">⚙</button>
      </header>
      <p class="menu-intro">選擇分組與練習關卡。所有關卡自由選，無解鎖限制。</p>
      <nav class="section-toggle" role="tablist" aria-label="練習類型">${sectionToggle}</nav>
      <p class="menu-reference">
        建議先讀過這篇教學再來練習，效果會更好：<a href="${ref.href}" target="_blank" rel="noopener noreferrer">${ref.title}</a>
      </p>
      ${lessonBlocks}
      <footer class="menu-footer">
        <div class="menu-version">v${import.meta.env.VITE_APP_VERSION}</div>
        <div class="menu-cangjie-version">目前為 3 代倉頡（5 代待後續評估）</div>
        <div class="menu-credits">
          輔助字形範例圖：來自
          <a href="https://commons.wikimedia.org/wiki/User:Cangjie6" target="_blank" rel="noopener noreferrer">Wikimedia Commons (Cangjie6)</a>，
          以 <a href="https://creativecommons.org/publicdomain/zero/1.0/deed.zh_TW" target="_blank" rel="noopener noreferrer">CC0 1.0</a> 釋出，
          整理自 <a href="https://zh.wikibooks.org/wiki/%E5%80%89%E9%A0%A1%E8%BC%B8%E5%85%A5%E6%B3%95/%E8%BC%94%E5%8A%A9%E5%AD%97%E5%BD%A2" target="_blank" rel="noopener noreferrer">《倉頡輸入法／輔助字形》Wikibooks</a>。
        </div>
      </footer>
    </section>
  `;

  root.querySelector('.settings-btn').addEventListener('click', onOpenSettings);

  for (const btn of root.querySelectorAll('.section-tab')) {
    btn.addEventListener('click', () => {
      const nextSection = btn.dataset.section;
      if (nextSection !== section) onSwitchSection(nextSection);
    });
  }

  for (const btn of root.querySelectorAll('.stage-cell')) {
    btn.addEventListener('click', () => {
      const lessonId = parseInt(btn.dataset.lesson, 10);
      const stageId = btn.dataset.stage;
      onSelect({ lessonId, stageId, section });
    });
  }
}
