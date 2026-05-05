/* =====================================================
   game.js — Logique principale du jeu
   ===================================================== */

/* ──────────────────────────────────────────────────────
   STATE GLOBAL
────────────────────────────────────────────────────── */
window.apiKey = '';
window.pc = {
  name:'', classe:'', talent:'Normal', talentMult:1.0,
  pvMax:80, pvCur:80, pfMax:80, pfCur:80, pmMax:40, pmCur:40,
  chance:10, competences:[], affinites:[], etat:'normal',
  inventaire:[], or:0, argent:0, cuivre:0
};
window.charBackground = '';
window.univers = '';
window.conversationHistory = [];
window.storySummary = '';
window.actionCount = 0;

let isLoading = false;
let panelOpen = false;

/* ──────────────────────────────────────────────────────
   INIT
────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  // Clé API
  const saved = localStorage.getItem('rpg_api_key');
  if (saved) {
    window.apiKey = saved;
    document.getElementById('api-input').value = saved;
    const s = document.getElementById('api-status');
    s.className = 'api-status ok';
    s.textContent = '✓ Clé chargée.';
  }

  // Events
  document.getElementById('player-input').addEventListener('keydown', e => { if(e.key==='Enter') sendAction(); });
  document.getElementById('api-input').addEventListener('keydown', e => { if(e.key==='Enter') saveApiKey(); });

  // Vérifier sauvegarde existante
  checkSavedGame();
});

/* ──────────────────────────────────────────────────────
   API KEY
────────────────────────────────────────────────────── */
function saveApiKey() {
  const val = document.getElementById('api-input').value.trim();
  const s = document.getElementById('api-status');
  if (!val.startsWith('sk-ant-')) {
    s.className = 'api-status err';
    s.textContent = 'Clé invalide (doit commencer par sk-ant-)';
    return;
  }
  window.apiKey = val;
  localStorage.setItem('rpg_api_key', val);
  s.className = 'api-status ok';
  s.textContent = '✓ Clé sauvegardée.';
}

/* ──────────────────────────────────────────────────────
   UNIVERS
────────────────────────────────────────────────────── */
function buildUnivers() {
  const epoque   = document.getElementById('uni-epoque').value;
  const etat     = document.getElementById('uni-etat').value;
  const magie    = document.getElementById('uni-magie').value;
  const ambiance = document.getElementById('uni-ambiance').value;
  const details  = document.getElementById('uni-details').value.trim();
  let u = `Époque: ${epoque} | État du monde: ${etat} | Magie: ${magie} | Ambiance: ${ambiance}`;
  if (details) u += ` | Détails: ${details}`;
  return u;
}

/* ──────────────────────────────────────────────────────
   START GAME
────────────────────────────────────────────────────── */
async function startGame() {
  if (!window.apiKey) {
    const s = document.getElementById('api-status');
    s.className = 'api-status err';
    s.textContent = '⚠ Veuillez sauvegarder votre clé API avant de commencer.';
    document.getElementById('api-input').focus();
    return;
  }
  const name = document.getElementById('char-name-input').value.trim();
  const bg   = document.getElementById('char-background-input').value.trim();
  if (!name) { document.getElementById('char-name-input').style.borderColor='var(--danger)'; document.getElementById('char-name-input').focus(); return; }
  if (!bg)   { document.getElementById('char-background-input').style.borderColor='var(--danger)'; document.getElementById('char-background-input').focus(); return; }

  window.pc.name = name;
  window.charBackground = bg;
  window.univers = buildUnivers();

  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('generation-screen').classList.remove('hidden');
  const genLog = document.getElementById('gen-log');

  try {
    // ÉTAPE 1 : Générer la fiche personnage
    genLog.textContent = 'Analyse du background par l\'IA...';
    const fichePrompt = `Tu es un générateur de fiche de personnage pour un JDR. Analyse ce background et génère UNIQUEMENT un objet JSON valide, sans texte avant ou après, sans balises markdown :
{"classe":"Nom court","talent":"Normal","talentMult":1.0,"pvMax":80,"pfMax":80,"pmMax":40,"chance":10,"competences":[{"nom":"Nom","val":30},{"nom":"Nom","val":25},{"nom":"Nom","val":20},{"nom":"Nom","val":15},{"nom":"Nom","val":10}],"affinites":[]}
Règles : talentMult(Normal=1.0,Doué=1.5,Très doué=2.0,Prodige=2.5,Légende=3.0), pvMax(60-120), pfMax(50-120), pmMax(0-100, 0 si non-mage), chance(5-30), 5 compétences cohérentes (val 10-60), affinites(0-2 parmi Feu/Eau/Terre/Vent/Lumière/Ombre), personnage mystérieux/ancien/puissant=Prodige ou Légende.
Background: "${bg}" | Nom: ${name} | Univers: ${window.univers}`;

    const ficheResp = await callRaw(fichePrompt);
    genLog.textContent = 'Construction de la fiche...';

    let fd;
    try { fd = JSON.parse(ficheResp.replace(/```json|```/g,'').trim()); }
    catch(e) { fd = {classe:'Aventurier',talent:'Normal',talentMult:1.0,pvMax:80,pfMax:80,pmMax:30,chance:10,competences:[{nom:'Combat',val:25},{nom:'Survie',val:20},{nom:'Perception',val:18},{nom:'Furtivité',val:15},{nom:'Volonté',val:12}],affinites:[]}; }

    window.pc = {
      name, classe:fd.classe||'Aventurier', talent:fd.talent||'Normal', talentMult:fd.talentMult||1.0,
      pvMax:fd.pvMax||80, pvCur:fd.pvMax||80, pfMax:fd.pfMax||80, pfCur:fd.pfMax||80,
      pmMax:fd.pmMax||30, pmCur:fd.pmMax||30, chance:fd.chance||10,
      competences:fd.competences||[], affinites:fd.affinites||[], etat:'normal',
      inventaire:[], or:0, argent:0, cuivre:0
    };

    // ÉTAPE 2 : Scène d'ouverture
    genLog.textContent = 'Le monde prend forme...';
    window.conversationHistory = [];
    window.storySummary = '';
    window.actionCount = 0;

    // Premier appel : system statique + contexte dynamique + demande d'ouverture
    const openingMsg = buildDynamicContext() + `\n\n[ACTION DU JOUEUR]\nJe commence l'aventure. Présente la scène d'ouverture en tenant compte de mon background, mes compétences et l'univers décrit.`;
    const opening = await callClaude(openingMsg);

    // Afficher l'écran de jeu
    document.getElementById('generation-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    updateSheet();
    updateInvPanel();
    parseDisplay(opening, null);
    saveGame();
    document.getElementById('player-input').focus();

  } catch(e) {
    document.getElementById('generation-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('start-btn').disabled = false;
    document.getElementById('start-btn').textContent = '⚔ Forger le Personnage & Commencer ⚔';
    genLog.style.color = 'var(--danger)';
    genLog.textContent = e.message.toLowerCase().includes('overload')
      ? '⏳ Serveurs surchargés. Réessayez dans quelques instants.'
      : '⚠ Erreur : ' + e.message;
  }
}

/* ──────────────────────────────────────────────────────
   API CALLS OPTIMISÉS
   - SYSTEM_STATIC envoyé une seule fois via param "system"
   - Contexte dynamique injecté dans chaque message joueur
   - Historique gardé court grâce au résumé glissant
────────────────────────────────────────────────────── */
async function fetchWithRetry(body, maxRetries=3) {
  for(let attempt=1; attempt<=maxRetries; attempt++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': window.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });
    if (r.ok) return r;
    const e = await r.json().catch(() => ({}));
    const msg = e.error?.message || `HTTP ${r.status}`;
    const isOverload = r.status === 529 || msg.toLowerCase().includes('overload');
    if (isOverload && attempt < maxRetries) {
      const wait = attempt * 4000;
      showRetryMsg(`Serveurs surchargés — nouvelle tentative dans ${wait/1000}s... (${attempt}/${maxRetries})`);
      await sleep(wait);
      continue;
    }
    throw new Error(msg);
  }
}

/* Appel principal : system statique + historique court + message avec contexte dynamique */
async function callClaude(userMsg) {
  window.conversationHistory.push({ role: 'user', content: userMsg });

  const r = await fetchWithRetry({
    model: 'claude-sonnet-4-5',
    max_tokens: 800,
    system: SYSTEM_STATIC,          // ← règles statiques, jamais répétées
    messages: window.conversationHistory
  });

  clearRetryMsg();
  const d = await r.json();
  const text = d.content.find(b => b.type === 'text')?.text || '';
  window.conversationHistory.push({ role: 'assistant', content: text });
  return text;
}

/* Appel simple sans historique (génération fiche) */
async function callRaw(prompt) {
  const r = await fetchWithRetry({
    model: 'claude-sonnet-4-5',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }]
  });
  clearRetryMsg();
  const d = await r.json();
  return d.content.find(b => b.type === 'text')?.text || '';
}

function showRetryMsg(txt) {
  const box = document.getElementById('story-box');
  let el = document.getElementById('retry-msg');
  if (!el) { el = document.createElement('p'); el.id='retry-msg'; el.style.cssText='font-size:13px;color:var(--warning);font-style:italic;margin:4px 0;'; box.appendChild(el); }
  el.textContent = '⏳ ' + txt;
  box.scrollTop = box.scrollHeight;
}
function clearRetryMsg() { const el = document.getElementById('retry-msg'); if(el) el.remove(); }

/* ──────────────────────────────────────────────────────
   SEND ACTION
────────────────────────────────────────────────────── */
async function sendAction() {
  if (isLoading) return;
  const input = document.getElementById('player-input');
  const action = input.value.trim();
  if (!action) return;

  isLoading = true;
  input.value = '';
  document.getElementById('send-btn').disabled = true;
  document.getElementById('quick-actions').innerHTML = '';

  // Lancer le dé de chance
  const de20 = Math.floor(Math.random() * 20) + 1;
  if (de20 === 20) addStory('<p class="story-critical">✦ Le destin sourit — dé de chance : 20 !</p>');
  else if (de20 === 1) addStory('<p class="story-critical">✦ Le destin tourne le dos — dé de chance : 1...</p>');

  // Loading
  const loadEl = document.createElement('p');
  loadEl.className = 'story-narrator loading-dots';
  loadEl.innerHTML = '<span>.</span><span>.</span><span>.</span>';
  document.getElementById('story-box').appendChild(loadEl);
  document.getElementById('story-box').scrollTop = document.getElementById('story-box').scrollHeight;

  // Construire le message : contexte dynamique (court) + action joueur + dé
  let dieSuffix = '';
  if (de20 === 20) dieSuffix = ' [DÉ: 20 — RÉUSSITE CRITIQUE]';
  else if (de20 === 1) dieSuffix = ' [DÉ: 1 — ÉCHEC CRITIQUE]';
  else dieSuffix = ` [DÉ: ${de20}]`;

  const fullMsg = buildDynamicContext() + `\n\n[ACTION DU JOUEUR]\n${action}${dieSuffix}`;

  try {
    const resp = await callClaude(fullMsg);
    loadEl.remove();
    parseDisplay(resp, action);

    // Résumé glissant si besoin
    await maybeSummarize();

    // Sauvegarde automatique
    saveGame();
  } catch(e) {
    loadEl.remove();
    clearRetryMsg();
    const isOverload = e.message.toLowerCase().includes('overload');
    const errMsg = isOverload
      ? 'Serveurs surchargés. Réessayez dans quelques instants.'
      : 'Erreur : ' + e.message;
    addStory(`<p class="story-event" id="err-block">⚠ ${esc(errMsg)}</p>`);
    if (isOverload) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'quick-action';
      retryBtn.textContent = '↺ Réessayer';
      retryBtn.style.cssText = 'border-color:var(--warning);color:var(--warning);margin-top:4px;';
      retryBtn.onclick = () => {
        document.getElementById('err-block')?.remove();
        retryBtn.remove();
        document.getElementById('player-input').value = action;
        sendAction();
      };
      document.getElementById('story-box').appendChild(retryBtn);
      document.getElementById('story-box').scrollTop = document.getElementById('story-box').scrollHeight;
    }
  }

  isLoading = false;
  document.getElementById('send-btn').disabled = false;
  input.focus();
}

/* ──────────────────────────────────────────────────────
   PARSE & DISPLAY
────────────────────────────────────────────────────── */
function parseDisplay(text, playerAction) {
  const am = text.match(/ACTIONS:\s*(.+)/i);
  let narr = text.replace(/ACTIONS:.*/is, '').trim();

  // Traiter signaux stats
  narr = narr.replace(/HP:([+-]\d+)/gi,        (_, d) => { window.pc.pvCur = Math.max(0, Math.min(window.pc.pvMax, window.pc.pvCur + parseInt(d))); return ''; });
  narr = narr.replace(/PF:([+-]\d+)/gi,        (_, d) => { window.pc.pfCur = Math.max(0, Math.min(window.pc.pfMax, window.pc.pfCur + parseInt(d))); return ''; });
  narr = narr.replace(/PM:([+-]\d+)/gi,        (_, d) => { window.pc.pmCur = Math.max(0, Math.min(window.pc.pmMax, window.pc.pmCur + parseInt(d))); return ''; });
  narr = narr.replace(/CHANCE:\+(\d+)/gi,      (_, v) => { window.pc.chance = Math.min(100, window.pc.chance + parseInt(v)); return ''; });
  narr = narr.replace(/ETAT:(\w+)/gi,          (_, e) => { window.pc.etat = e.toLowerCase(); return ''; });
  narr = narr.replace(/ITEM_DEL:([^\n|[]+)/gi, (_, n) => { removeItem(n.trim()); addStory(`<p class="story-event">— ${esc(n.trim())} retiré de l'inventaire.</p>`); return ''; });
  narr = narr.replace(/ITEM:([^\n|[]+)/gi,     (_, n) => { addItem(n.trim()); addStory(`<p class="story-event">+ ${esc(n.trim())} ajouté à l'inventaire.</p>`); return ''; });
  narr = narr.replace(/MONEY:([+-])(\d+)(po|pa|pc)/gi, (_, sign, val, type) => {
    const v = parseInt(val) * (sign === '-' ? -1 : 1);
    if (type === 'po') window.pc.or = Math.max(0, window.pc.or + v);
    else if (type === 'pa') window.pc.argent = Math.max(0, window.pc.argent + v);
    else window.pc.cuivre = Math.max(0, window.pc.cuivre + v);
    addStory(`<p class="story-event">💰 ${sign === '-' ? '−' : '+'} ${val} ${type}</p>`);
    return '';
  });

  narr = narr.trim();

  if (playerAction) addStory(`<p class="story-player">» ${esc(playerAction)}</p>`);
  addStory(`<p class="story-narrator">${esc(narr)}</p>`);

  updateSheet();
  if (panelOpen) updateInvPanel();

  // Actions rapides
  const ar = document.getElementById('quick-actions');
  ar.innerHTML = '';
  if (am) {
    am[1].split('|').map(a => a.trim().replace(/^\[|\]$/g, '')).forEach(a => {
      if (!a) return;
      const b = document.createElement('button');
      b.className = 'quick-action';
      b.textContent = a;
      b.onclick = () => { document.getElementById('player-input').value = a; sendAction(); };
      ar.appendChild(b);
    });
  }
}

/* ──────────────────────────────────────────────────────
   INVENTAIRE
────────────────────────────────────────────────────── */
function addItem(nom, qte=1) {
  const ex = window.pc.inventaire.find(i => i.nom.toLowerCase() === nom.toLowerCase());
  if (ex) ex.qte += qte;
  else window.pc.inventaire.push({ nom, qte });
}

function removeItem(nom) {
  const idx = window.pc.inventaire.findIndex(i => i.nom.toLowerCase() === nom.toLowerCase());
  if (idx >= 0) { window.pc.inventaire[idx].qte--; if (window.pc.inventaire[idx].qte <= 0) window.pc.inventaire.splice(idx, 1); }
}

/* ──────────────────────────────────────────────────────
   UI — FICHE PERSONNAGE
────────────────────────────────────────────────────── */
function updateSheet() {
  const p = window.pc;
  document.getElementById('sheet-name').textContent = p.name;
  document.getElementById('sheet-sub').textContent = p.classe;
  document.getElementById('talent-val').textContent = `${p.talent} ×${p.talentMult}`;
  document.getElementById('etat-row').textContent = p.etat !== 'normal' ? `⚠ ${p.etat}` : '';
  setBar('bar-pv', 'val-pv', p.pvCur, p.pvMax, true);
  setBar('bar-pf', 'val-pf', p.pfCur, p.pfMax, true);
  setBar('bar-pm', 'val-pm', p.pmCur, p.pmMax, true);
  document.getElementById('bar-chance').style.width = Math.min(100, p.chance) + '%';
  document.getElementById('val-chance').textContent = p.chance;
  const block = document.getElementById('skills-block');
  block.innerHTML = '';
  p.competences.forEach(c => {
    const row = document.createElement('div'); row.className = 'skill-row';
    row.innerHTML = `<span class="skill-name">${esc(c.nom)}</span><span class="skill-val">${c.val}</span>`;
    block.appendChild(row);
  });
}

function setBar(bid, vid, cur, max, both) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  document.getElementById(bid).style.width = pct + '%';
  document.getElementById(vid).textContent = both ? `${cur}/${max}` : cur;
}

/* ──────────────────────────────────────────────────────
   UI — PANNEAU STATS / INVENTAIRE
────────────────────────────────────────────────────── */
function togglePanel() {
  panelOpen = !panelOpen;
  document.getElementById('stats-panel').classList.toggle('open', panelOpen);
  document.querySelector('.sheet-btn').textContent = panelOpen ? '▲ Stats & Inventaire' : '▼ Stats & Inventaire';
  if (panelOpen) updateInvPanel();
}

function updateInvPanel() {
  const p = window.pc;
  const invList = document.getElementById('inv-list');
  if (p.inventaire.length === 0) {
    invList.innerHTML = '<span class="empty-inv">Aucun objet pour l\'instant.</span>';
  } else {
    invList.innerHTML = '';
    p.inventaire.forEach(item => {
      const row = document.createElement('div'); row.className = 'inv-item';
      row.innerHTML = `<span>${esc(item.nom)}</span><span class="inv-qty">×${item.qte}</span>`;
      invList.appendChild(row);
    });
  }
  const hasMoney = p.or > 0 || p.argent > 0 || p.cuivre > 0;
  document.getElementById('gold-total').textContent = hasMoney ? `💰 ${p.or} po · ${p.argent} pa · ${p.cuivre} pc` : '';
  const affList = document.getElementById('aff-list');
  affList.textContent = p.affinites.length ? p.affinites.join(' · ') : 'Aucune affinité magique';
  document.getElementById('uni-summary').textContent = window.univers || '—';
  const sumEl = document.getElementById('story-summary-panel');
  if (sumEl) sumEl.textContent = window.storySummary ? '✓ Résumé de l\'aventure disponible' : 'Aucun résumé encore généré.';
}

/* ──────────────────────────────────────────────────────
   RESTART
────────────────────────────────────────────────────── */
function restartGame() {
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('story-box').innerHTML = '';
  document.getElementById('quick-actions').innerHTML = '';
  document.getElementById('start-btn').disabled = false;
  document.getElementById('start-btn').textContent = '⚔ Forger le Personnage & Commencer ⚔';
  window.conversationHistory = [];
  window.storySummary = '';
  window.actionCount = 0;
  window.univers = '';
  window.charBackground = '';
  window.pc = { name:'', classe:'', talent:'Normal', talentMult:1.0, pvMax:80, pvCur:80, pfMax:80, pfCur:80, pmMax:40, pmCur:40, chance:10, competences:[], affinites:[], etat:'normal', inventaire:[], or:0, argent:0, cuivre:0 };
  if (panelOpen) togglePanel();
  checkSavedGame();
}

/* ──────────────────────────────────────────────────────
   HELPERS
────────────────────────────────────────────────────── */
function addStory(html) {
  const b = document.getElementById('story-box');
  const d = document.createElement('div');
  d.innerHTML = html;
  b.appendChild(d);
  b.scrollTop = b.scrollHeight;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
