import { load, save } from './storage.js';

const KEY = 'settings';
const DEFAULTS = {
  warmupRepeat: 5,
  forwardReverseRounds: 1,
  shuffleRows: 4,
  crossoverRows: 3,
  auxBaseRows: 4,
  auxVariantsRows: 4,
  auxMixedRows: 4,
};
const BOUNDS = {
  warmupRepeat: { min: 3, max: 20 },
  forwardReverseRounds: { min: 1, max: 10 },
  shuffleRows: { min: 1, max: 10 },
  crossoverRows: { min: 1, max: 10 },
  auxBaseRows: { min: 1, max: 10 },
  auxVariantsRows: { min: 1, max: 10 },
  auxMixedRows: { min: 1, max: 10 },
};

export function getSettings() {
  const stored = load(KEY, {});
  return { ...DEFAULTS, ...stored };
}

function clamp(value, key) {
  const { min, max } = BOUNDS[key];
  const n = Number.isFinite(value) ? Math.round(value) : DEFAULTS[key];
  return Math.max(min, Math.min(max, n));
}

export function updateSettings(patch) {
  const next = { ...getSettings(), ...patch };
  for (const k of Object.keys(BOUNDS)) next[k] = clamp(next[k], k);
  save(KEY, next);
  return next;
}

export function mountSettings(root, { onBack }) {
  const s = getSettings();
  root.innerHTML = `
    <section class="settings">
      <header class="settings-header">
        <button class="back-btn" type="button">← 返回</button>
        <h2>設定</h2>
      </header>
      <form class="settings-form">
        <label class="field">
          <span class="label-text">單字熱身 每字重複次數</span>
          <input type="number" name="warmupRepeat" min="3" max="20" step="1" value="${s.warmupRepeat}" />
          <span class="hint">範圍 3 – 20</span>
        </label>
        <label class="field">
          <span class="label-text">順逆序 輪數（一輪 = 1 順 + 1 逆）</span>
          <input type="number" name="forwardReverseRounds" min="1" max="10" step="1" value="${s.forwardReverseRounds}" />
          <span class="hint">範圍 1 – 10</span>
        </label>
        <label class="field">
          <span class="label-text">亂序混打 行數</span>
          <input type="number" name="shuffleRows" min="1" max="10" step="1" value="${s.shuffleRows}" />
          <span class="hint">範圍 1 – 10</span>
        </label>
        <label class="field">
          <span class="label-text">交叉混打 行數</span>
          <input type="number" name="crossoverRows" min="1" max="10" step="1" value="${s.crossoverRows}" />
          <span class="hint">範圍 1 – 10</span>
        </label>
        <label class="field">
          <span class="label-text">輔助字形 基本形 行數</span>
          <input type="number" name="auxBaseRows" min="1" max="10" step="1" value="${s.auxBaseRows}" />
          <span class="hint">範圍 1 – 10</span>
        </label>
        <label class="field">
          <span class="label-text">輔助字形 變形 行數</span>
          <input type="number" name="auxVariantsRows" min="1" max="10" step="1" value="${s.auxVariantsRows}" />
          <span class="hint">範圍 1 – 10</span>
        </label>
        <label class="field">
          <span class="label-text">輔助字形 混合 行數</span>
          <input type="number" name="auxMixedRows" min="1" max="10" step="1" value="${s.auxMixedRows}" />
          <span class="hint">範圍 1 – 10</span>
        </label>
        <p class="settings-note">設定會立即儲存，下次練習生效。</p>
      </form>
    </section>
  `;

  root.querySelector('.back-btn').addEventListener('click', () => onBack());

  for (const input of root.querySelectorAll('input[type="number"]')) {
    input.addEventListener('change', () => {
      const value = parseInt(input.value, 10);
      const next = updateSettings({ [input.name]: value });
      input.value = next[input.name];
    });
  }
}
