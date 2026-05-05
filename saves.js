/* =====================================================
   saves.js v3 — Sauvegarde avec 3 historiques + skills
   ===================================================== */

const SAVE_KEY = 'rpg_claude_v3_save';
const SUMMARY_THRESHOLD = 10;

/* ──────────────────────────────────────────────────────
   SAUVEGARDE
────────────────────────────────────────────────────── */
function saveGame() {
  const state = {
    pc: window.pc,
    charBackground: window.charBackground,
    univers: window.univers,
    currentMode: window.currentMode,
    currentPNJ: window.currentPNJ,
    activeSkills: window.activeSkills,
    histNarrateur: window.histNarrateur,
    histCombat: window.histCombat,
    histDialogue: window.histDialogue,
    storySummary: window.storySummary,
    actionCount: window.actionCount,
    storyHTML: document.getElementById('story-box').innerHTML,
    savedAt: Date.now(),
    version: 3
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    showSaveIndicator();
  } catch(e) {
    console.warn('Sauvegarde impossible:', e);
  }
}

function showSaveIndicator() {
  const si = document.getElementById('save-indicator');
  if (!si) return;
  si.className = 'save-indicator saved';
  si.textContent = '✓ Sauvegardé';
  setTimeout(() => { si.className='save-indicator'; si.textContent='○ Sauvegardé'; }, 2000);
}

/* ──────────────────────────────────────────────────────
   CHARGEMENT
────────────────────────────────────────────────────── */
function checkSavedGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  try {
    const state = JSON.parse(raw);
    if (!state.pc?.name) return;
    const resumeBar  = document.getElementById('resume-bar');
    const resumeName = document.getElementById('resume-name');
    const resumeDate = document.getElementById('resume-date');
    if (resumeBar)  resumeBar.classList.remove('hidden');
    if (resumeName) resumeName.textContent = state.pc.name;
    if (resumeDate && state.savedAt) {
      const d = new Date(state.savedAt);
      resumeDate.textContent = d.toLocaleDateString('fr-FR', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' });
    }
  } catch(e) {}
}

function resumeGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  try {
    const state = JSON.parse(raw);
    window.pc             = state.pc;
    window.charBackground = state.charBackground || '';
    window.univers        = state.univers || '';
    window.currentMode    = state.currentMode || 'exploration';
    window.currentPNJ     = state.currentPNJ || { nom:'', description:'' };
    window.activeSkills   = state.activeSkills || { exploration:[], combat:[], dialogue:[] };
    window.histNarrateur  = state.histNarrateur || [];
    window.histCombat     = state.histCombat || [];
    window.histDialogue   = state.histDialogue || [];
    window.storySummary   = state.storySummary || '';
    window.actionCount    = state.actionCount || 0;

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('story-box').innerHTML = state.storyHTML || '';
    document.getElementById('story-box').scrollTop = document.getElementById('story-box').scrollHeight;
    document.getElementById('save-indicator').textContent = '○ Sauvegardé';

    updateSheet();
    updateInvPanel();
    updateModeBar();
    document.getElementById('player-input').focus();
  } catch(e) {
    alert('Impossible de reprendre la partie sauvegardée.');
  }
}

function clearSave() {
  if (!confirm('Effacer la partie sauvegardée ?')) return;
  localStorage.removeItem(SAVE_KEY);
  document.getElementById('resume-bar').classList.add('hidden');
}

function confirmRestart() {
  if (!confirm('Commencer une nouvelle partie ? La partie actuelle sera perdue.')) return;
  localStorage.removeItem(SAVE_KEY);
  restartGame();
}

/* ──────────────────────────────────────────────────────
   RÉSUMÉ GLISSANT
────────────────────────────────────────────────────── */
async function maybeSummarize() {
  const hist = window.histNarrateur;
  if (hist.length < 8) return;

  try {
    addStory('<p class="story-summary">— Le Maître du Jeu grave les événements dans sa mémoire... —</p>');

    const summaryPrompt = `Résume en 5-8 phrases concises et narratives ce qui s'est passé dans cette aventure. Mentionne : lieux visités, ennemis affrontés, alliés rencontrés, objets importants, décisions clés. Français, au passé, immersif.`;
    const toSummarize = hist.slice(0, -4);
    const summaryText = await callRaw(summaryPrompt + '\n\nHistorique à résumer:\n' + toSummarize.map(m=>`${m.role}: ${m.content.slice(0,200)}`).join('\n'));

    window.storySummary = window.storySummary
      ? window.storySummary + '\n\n' + summaryText
      : summaryText;

    // Compresser les 3 historiques
    window.histNarrateur = hist.slice(-4);
    window.histCombat    = window.histCombat.slice(-4);
    window.histDialogue  = window.histDialogue.slice(-4);

    saveGame();
  } catch(e) {
    console.warn('Résumé impossible:', e);
  }
}
