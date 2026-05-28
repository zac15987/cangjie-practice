import radicalsData from './data/radicals.json';
import auxiliaryData from './data/auxiliary.json';

export const LESSONS = [
  ...radicalsData.categories.map((cat, idx) => ({
    id: idx,
    name: cat.name,
    keys: cat.keys,
  })),
  {
    id: radicalsData.categories.length,
    name: '全 24 字',
    keys: radicalsData.categories.flatMap((c) => c.keys),
    stages: ['warmup', 'forwardReverse', 'shuffle'],
  },
];

export const STAGES = [
  { id: 'warmup', name: '單字熱身' },
  { id: 'forwardReverse', name: '順逆序' },
  { id: 'shuffle', name: '亂序混打' },
  { id: 'crossover', name: '交叉混打' },
];

function buildAuxPools(letters) {
  const pool = [];
  for (const { key, radical } of letters) {
    const groups = auxiliaryData[key] || [];
    for (const group of groups) {
      for (const svg of group.examples) {
        pool.push({ key, radical, svg });
      }
    }
  }
  return { pool };
}

export const AUX_LESSONS = (() => {
  const categorized = radicalsData.categories.map((cat, idx) => ({
    id: idx,
    name: cat.name,
    keys: cat.keys,
    ...buildAuxPools(cat.keys),
  }));
  const allKeys = radicalsData.categories.flatMap((c) => c.keys);
  return [
    ...categorized,
    {
      id: categorized.length,
      name: '全 24 字',
      keys: allKeys,
      ...buildAuxPools(allKeys),
    },
  ];
})();

export const AUX_STAGES = [
  { id: 'all', name: '練習' },
];

export const STAGE_KEY = (lessonId, stageId, section = 'radical') =>
  section === 'aux'
    ? `aux:L${lessonId}.${stageId}`
    : `L${lessonId}.${stageId}`;

export function lessonsFor(section) {
  return section === 'aux' ? AUX_LESSONS : LESSONS;
}

export function stagesFor(lesson, section = 'radical') {
  if (section === 'aux') return AUX_STAGES;
  return lesson.stages
    ? STAGES.filter((s) => lesson.stages.includes(s.id))
    : STAGES;
}

export function nextStageOf(lessonId, stageId, section = 'radical') {
  const lessons = lessonsFor(section);
  const lesson = lessons[lessonId];
  if (!lesson) return null;
  const stages = stagesFor(lesson, section);
  const idx = stages.findIndex((s) => s.id === stageId);
  if (idx >= 0 && idx + 1 < stages.length) {
    return { lessonId, stageId: stages[idx + 1].id };
  }
  const nextLesson = lessons[lessonId + 1];
  if (!nextLesson) return null;
  return { lessonId: nextLesson.id, stageId: stagesFor(nextLesson, section)[0].id };
}

function buildWarmupLines(keys, n) {
  return keys.map((k) => Array.from({ length: n }, () => k));
}

function buildForwardReverseLines(keys, rounds) {
  const lines = [];
  const reversed = [...keys].reverse();
  for (let i = 0; i < rounds; i++) {
    lines.push([...keys]);
    lines.push([...reversed]);
  }
  return lines;
}

function randomLine(pool, length) {
  const line = [];
  let last = null;
  for (let i = 0; i < length; i++) {
    let k;
    do {
      k = pool[Math.floor(Math.random() * pool.length)];
    } while (pool.length > 1 && k.key === last);
    line.push(k);
    last = k.key;
  }
  return line;
}

function buildRandomLines(pool, rowCount, lineLength) {
  const length = lineLength ?? pool.length;
  return Array.from({ length: rowCount }, () => randomLine(pool, length));
}

function crossoverPool(lessonId) {
  return LESSONS.filter((l) => l.id <= lessonId).flatMap((l) => l.keys);
}

function buildAuxSequence({ lessonId, stageId, settings }) {
  const lesson = AUX_LESSONS[lessonId];
  if (!lesson) throw new Error(`unknown aux lesson ${lessonId}`);
  if (stageId !== 'all') throw new Error(`unknown aux stage ${stageId}`);

  const pool = lesson.pool;
  if (pool.length === 0) {
    return { lines: [], canRegenerate: false };
  }

  const lineLength = lesson.keys.length;
  return {
    lines: buildRandomLines(pool, settings.auxRows, lineLength),
    canRegenerate: true,
  };
}

export function buildSequence({ lessonId, stageId, settings, section = 'radical' }) {
  if (section === 'aux') {
    return buildAuxSequence({ lessonId, stageId, settings });
  }

  const lesson = LESSONS[lessonId];
  if (!lesson) throw new Error(`unknown lesson ${lessonId}`);

  let lines;
  let canRegenerate = false;

  if (stageId === 'warmup') {
    lines = buildWarmupLines(lesson.keys, settings.warmupRepeat);
  } else if (stageId === 'forwardReverse') {
    lines = buildForwardReverseLines(lesson.keys, settings.forwardReverseRounds);
  } else if (stageId === 'shuffle') {
    lines = buildRandomLines(lesson.keys, settings.shuffleRows);
    canRegenerate = true;
  } else if (stageId === 'crossover') {
    lines = buildRandomLines(crossoverPool(lessonId), settings.crossoverRows);
    canRegenerate = true;
  } else {
    throw new Error(`unknown stage ${stageId}`);
  }

  return { lines, canRegenerate };
}
