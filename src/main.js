import './style.css';
import { mountMenu } from './modes/letters.js';
import { mountPractice } from './practice.js';
import { mountSettings } from './settings.js';

const app = document.getElementById('app');

function showMenu() {
  mountMenu(app, {
    onSelect: ({ lessonId, stageId }) => showPractice(lessonId, stageId),
    onOpenSettings: () => showSettings(),
  });
}

function showPractice(lessonId, stageId) {
  mountPractice(app, {
    lessonId,
    stageId,
    onExit: () => showMenu(),
    onNavigate: ({ lessonId, stageId }) => showPractice(lessonId, stageId),
  });
}

function showSettings() {
  mountSettings(app, { onBack: () => showMenu() });
}

showMenu();
