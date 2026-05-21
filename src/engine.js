import radicalsData from './data/radicals.json';

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

export const STAGE_KEY = (lessonId, stageId) => `L${lessonId}.${stageId}`;

export function stagesFor(lesson) {
  return lesson.stages
    ? STAGES.filter((s) => lesson.stages.includes(s.id))
    : STAGES;
}

export function nextStageOf(lessonId, stageId) {
  const lesson = LESSONS[lessonId];
  if (!lesson) return null;
  const stages = stagesFor(lesson);
  const idx = stages.findIndex((s) => s.id === stageId);
  if (idx >= 0 && idx + 1 < stages.length) {
    return { lessonId, stageId: stages[idx + 1].id };
  }
  const nextLesson = LESSONS[lessonId + 1];
  if (!nextLesson) return null;
  return { lessonId: nextLesson.id, stageId: stagesFor(nextLesson)[0].id };
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

function buildRandomLines(pool, rowCount) {
  const lineLength = pool.length;
  return Array.from({ length: rowCount }, () => randomLine(pool, lineLength));
}

function crossoverPool(lessonId) {
  return LESSONS.filter((l) => l.id <= lessonId).flatMap((l) => l.keys);
}

export function buildSequence({ lessonId, stageId, settings }) {
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
