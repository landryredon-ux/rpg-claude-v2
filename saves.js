/* =====================================================
   saves.js — Gestion des sauvegardes et résumé glissant
   ===================================================== */

const SAVE_KEY = 'rpg_claude_v2_save';
const ACTION_SUMMARY_THRESHOLD = 10; // résumer tous les X échanges

/* ──────────────────────────────────────────────────────
   SAUVEGARDE
────────────────────────────────────────────────────── */
function saveGame() {
  const state = {
    pc: window.pc,
    charBackground: window.charBackground,
    univers: window.univers,
    conversationHistory: window.conversationHistory,
    storySummary: window.storySummary,
    actionCount: window.actionCount,
    storyHTML: document.getElementById('story-box').innerHTML,
    savedAt: Date.now(),
    version: 2
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
  setTimeout(() => {
    si.className = 'save-indicator';
    si.textContent = '○ Sauvegardé';
  }, 2000);
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
    const resumeBar = document.getElementById('resume-bar');
    const resumeName = document.getElementById('resume-name');
    const resumeDate = document.getElementById('resume-date');
    if (resumeBar) resumeBar.classList.remove('hidden');
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
    window.pc = state.pc;
    window.charBackground = state.charBackground || '';
    window.univers = state.univers || '';
    window.conversationHistory = state.conversationHistory || [];
    window.storySummary = state.storySummary || '';
    window.actionCount = state.actionCount || 0;

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('story-box').innerHTML = state.storyHTML || '';
    document.getElementById('story-box').scrollTop = document.getElementById('story-box').scrollHeight;

    updateSheet();
    updateInvPanel();
    document.getElementById('save-indicator').textContent = '○ Sauvegardé';
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
   Principe : tous les ACTION_SUMMARY_THRESHOLD échanges,
   on demande à Claude de résumer l'histoire jusqu'ici,
   puis on vide l'historique en ne gardant que
   - le résumé (injecté dans le prochain message)
   - les 4 derniers échanges (contexte récent)
────────────────────────────────────────────────────── */
async function maybeSummarize() {
  window.actionCount = (window.actionCount || 0) + 1;
  if (window.actionCount % ACTION_SUMMARY_THRESHOLD !== 0) return;
  if (window.conversationHistory.length < 8) return;

  try {
    addStory('<p class="story-summary">— Le Maître du Jeu grave les événements dans sa mémoire... —</p>');

    const summaryPrompt = `Résume en 5-8 phrases concises et narratives ce qui s'est passé dans cette aventure jusqu'ici. Mentionne : les lieux visités, les ennemis affrontés, les alliés rencontrés, les objets importants trouvés, les décisions clés prises. Écris en français, au passé, de façon immersive.`;

    const historyToSummarize = window.conversationHistory.slice(0, -4);
    const summaryText = await callClaudeOneShot(summaryPrompt, historyToSummarize);

    // Mettre à jour le résumé cumulatif
    window.storySummary = window.storySummary
      ? window.storySummary + '\n\n' + summaryText
      : summaryText;

    // Garder seulement les 4 derniers échanges
    window.conversationHistory = window.conversationHistory.slice(-4);

    console.log('Résumé généré, historique compressé.');
    saveGame();
  } catch(e) {
    console.warn('Résumé impossible:', e);
  }
}

/* Appel Claude sans modifier l'historique principal */
async function callClaudeOneShot(instruction, history) {
  const messages = [
    ...history,
    { role: 'user', content: instruction }
  ];
  const r = await fetchWithRetry({
    model: 'claude-sonnet-4-5',
    max_tokens: 400,
    messages
  });
  const d = await r.json();
  return d.content.find(b => b.type === 'text')?.text || '';
}

/* ──────────────────────────────────────────────────────
   CONSTRUCTION DU CONTEXTE DYNAMIQUE
   Injecté AVANT chaque message joueur — petit et ciblé
────────────────────────────────────────────────────── */
function buildDynamicContext() {
  const p = window.pc;
  const comp = p.competences.map(c => `${c.nom} ${c.val}`).join(' | ');
  const aff = p.affinites.length ? p.affinites.join(', ') : 'aucune';
  const inv = p.inventaire.length ? p.inventaire.map(i => `${i.nom}${i.qte > 1 ? ' x' + i.qte : ''}`).join(', ') : 'vide';
  const money = `${p.or}po ${p.argent}pa ${p.cuivre}pc`;
  const etat = p.etat !== 'normal' ? `⚠ ÉTAT: ${p.etat}` : 'Normal';

  let ctx = `[ÉTAT ACTUEL DU PERSONNAGE]
Nom: ${p.name} | Classe: ${p.classe} | Talent: ${p.talent} (×${p.talentMult})
PV: ${p.pvCur}/${p.pvMax} | PF: ${p.pfCur}/${p.pfMax} | PM: ${p.pmCur}/${p.pmMax} | Chance: ${p.chance}
État: ${etat} | Univers: ${window.univers}
Compétences: ${comp}
Affinités: ${aff} | Inventaire: ${inv} | Bourse: ${money}
Background: ${window.charBackground}`;

  if (window.storySummary) {
    ctx += `\n\n[RÉSUMÉ DE L'AVENTURE JUSQU'ICI]\n${window.storySummary}`;
  }

  return ctx;
}
