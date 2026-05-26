import './style.css';
import { mountMenu } from './modes/letters.js';
import { mountPractice } from './practice.js';
import { mountSettings } from './settings.js';
import { load, save } from './storage.js';

const app = document.getElementById('app');
const SECTION_KEY = 'section';
let currentSection = load(SECTION_KEY, 'radical');
if (currentSection !== 'radical' && currentSection !== 'aux') {
  currentSection = 'radical';
}

function setSection(section) {
  currentSection = section;
  save(SECTION_KEY, section);
}

function showMenu() {
  mountMenu(app, {
    section: currentSection,
    onSelect: ({ lessonId, stageId, section }) => showPractice(lessonId, stageId, section),
    onSwitchSection: (section) => {
      setSection(section);
      showMenu();
    },
    onOpenSettings: () => showSettings(),
  });
}

function showPractice(lessonId, stageId, section) {
  mountPractice(app, {
    lessonId,
    stageId,
    section,
    onExit: () => showMenu(),
    onNavigate: ({ lessonId, stageId, section: nextSection }) =>
      showPractice(lessonId, stageId, nextSection),
  });
}

function showSettings() {
  mountSettings(app, { onBack: () => showMenu() });
}

showMenu();
