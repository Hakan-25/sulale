// =============================================
// FAMILY TREE - Web Version (API-based)
// =============================================

// ─── STATE ───────────────────────────────────
const STATE = {
  isAdmin: false,
  members: {},
  familyName: '',
  nextId: 1,
  transform: { x: 0, y: 0, scale: 1 },
  dragging: false,
  dragStart: { x: 0, y: 0 },
  dragTStart: { x: 0, y: 0 },
  editingId: null,
  selectedId: null,
  currentPhotoData: null,
  currentPhotoUrl: null,
  selectedGender: 'male',
  presetParentId: null,
  presetSpouseId: null,
  initialLoadDone: false,   // ← prevents view-jump on reload
  multiSelectedIds: new Set(),
  nodeDragging: false,
  nodeDragStart: { x: 0, y: 0 },
  nodeStartPositions: {}, 
  lassoDragging: false,
  lassoStart: { x: 0, y: 0 },
};

// ─── DOM ─────────────────────────────────────
const $ = id => document.getElementById(id);
const canvasContainer = $('canvas-container');
const canvasWorld     = $('canvas-world');
const svg             = $('connections-svg');
const nodesLayer      = $('nodes-layer');

// ─── LAYOUT CONFIG ───────────────────────────
const NODE_W     = 158;
const NODE_H     = 150;
const GEN_Y      = 250;   // vertical gap between generations
const SIB_X      = 180;   // minimum horizontal distance between sibling centers
const COUPLE_GAP = NODE_W + 22; // horizontal distance between couple member centers
const C          = 2500;  // canvas logical center

// =============================================
// PARTICLE SYSTEM
// =============================================
function initParticles() {
  const canvas = document.createElement('canvas');
  canvas.id = 'particles-canvas';
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');

  const COLORS = [
    [245, 158,  11],  // gold
    [ 96, 165, 250],  // blue
    [244, 114, 182],  // rose
    [167, 139, 250],  // purple
    [ 52, 211, 153],  // green
  ];

  let W, H, particles = [];

  const resize = () => {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  };

  const mkParticle = () => {
    const c = COLORS[Math.floor(Math.random() * COLORS.length)];
    return {
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.38,
      vy: (Math.random() - 0.5) * 0.38,
      r:  Math.random() * 2.2 + 0.6,
      c,
      a:  Math.random() * 0.55 + 0.18,
      pulse: Math.random() * Math.PI * 2,
      ps:   0.012 + Math.random() * 0.016,
    };
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);

    // Lines between nearby particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 145) {
          const alpha = (1 - d / 145) * 0.20;
          const ci = particles[i].c, cj = particles[j].c;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(${(ci[0]+cj[0])>>1},${(ci[1]+cj[1])>>1},${(ci[2]+cj[2])>>1},${alpha})`;
          ctx.lineWidth = 0.9;
          ctx.stroke();
        }
      }
    }

    // Draw & move particles
    particles.forEach(p => {
      p.pulse += p.ps;
      const pr = p.r + Math.sin(p.pulse) * 0.5;

      // Glow
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pr * 4.5);
      g.addColorStop(0, `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${p.a})`);
      g.addColorStop(1, `rgba(${p.c[0]},${p.c[1]},${p.c[2]},0)`);
      ctx.beginPath();
      ctx.arc(p.x, p.y, pr * 4.5, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${p.a + 0.32})`;
      ctx.fill();

      p.x += p.vx; p.y += p.vy;
      if (p.x < -20) p.x = W + 20;
      if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20;
      if (p.y > H + 20) p.y = -20;
    });

    requestAnimationFrame(draw);
  };

  window.addEventListener('resize', resize);
  resize();
  particles = Array.from({ length: 90 }, mkParticle);
  requestAnimationFrame(draw);
}

// =============================================
// API HELPERS
// =============================================
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Bir hata oluştu.');
  return data;
}

// =============================================
// AUTH
// =============================================
async function checkAuth() {
  const data = await api('GET', '/api/auth-status');
  setAdminMode(data.isAdmin);
}

function setAdminMode(isAdmin) {
  STATE.isAdmin = isAdmin;

  const visitorBanner = $('visitor-banner');
  const adminBanner   = $('admin-banner');
  visitorBanner.style.display = isAdmin ? 'none' : 'flex';
  adminBanner.style.display   = isAdmin ? 'flex'  : 'none';
  document.body.classList.add('has-banner');

  $('auth-btn-text').textContent = isAdmin ? 'Admin Aktif' : 'Admin Girişi';
  $('auth-btn').classList.toggle('logged-in', isAdmin);
  $('auth-btn').onclick = isAdmin ? null : () => openModal($('login-modal'));

  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? (el.tagName === 'BUTTON' ? 'inline-flex' : 'flex') : 'none';
  });

  render();
}

// Login
$('login-submit').onclick = async () => {
  const pw    = $('admin-password').value;
  const errEl = $('login-error');
  errEl.style.display = 'none';
  $('login-submit').textContent = 'Giriş Yapılıyor...';
  try {
    await api('POST', '/api/login', { password: pw });
    closeModal($('login-modal'));
    $('admin-password').value = '';
    setAdminMode(true);
    showToast('✅ Admin olarak giriş yapıldı', 'success');
  } catch (err) {
    errEl.textContent   = '❌ ' + err.message;
    errEl.style.display = 'block';
    $('admin-password').value = '';
    $('admin-password').focus();
  }
  $('login-submit').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Giriş Yap`;
};

$('admin-password').addEventListener('keydown', e => { if (e.key === 'Enter') $('login-submit').click(); });

$('logout-btn').onclick = async () => {
  await api('POST', '/api/logout');
  setAdminMode(false);
  showToast('👋 Çıkış yapıldı', 'info');
};

$('login-close').onclick  = () => closeModal($('login-modal'));
$('login-cancel').onclick = () => closeModal($('login-modal'));
$('login-modal').addEventListener('click', e => { if (e.target === $('login-modal')) closeModal($('login-modal')); });

$('toggle-pw').onclick = () => {
  const input = $('admin-password');
  input.type = input.type === 'password' ? 'text' : 'password';
  $('toggle-pw').textContent = input.type === 'password' ? '👁' : '🙈';
};

$('auth-btn').onclick = () => openModal($('login-modal'));

// =============================================
// DATA LOADING
// =============================================
/**
 * Load family data from server or fallback to static data.
 * @param {boolean} preserveView  - if true, keep current pan/zoom (used after add/edit/delete)
 */
async function loadFamily(preserveView = false) {
  try {
    let data;
    try {
      data = await api('GET', '/api/family');
    } catch (e) {
      // Fallback for GitHub Pages static hosting
      console.log('API not available, falling back to static data/family.json');
      const res = await fetch('./data/family.json');
      if (!res.ok) throw new Error('Cannot load static data');
      data = await res.json();
    }
    
    // Fix photo paths for static hosting (convert absolute /uploads/... to relative ./uploads/...)
    if (data && data.members) {
      Object.values(data.members).forEach(m => {
        if (m.photo && m.photo.startsWith('/')) {
          m.photo = '.' + m.photo;
        }
      });
    }

    STATE.members    = data.members    || {};
    STATE.familyName = data.familyName || 'Ailem';
    STATE.nextId     = data.nextId     || 1;
    $('family-name-display').textContent = STATE.familyName;
    $('loading-state').classList.add('hidden');
    render();

    // Only reset view on the very first load or explicit request
    if (!preserveView && !STATE.initialLoadDone) {
      STATE.initialLoadDone = true;
      setTimeout(() => {
        STATE.transform = { x: 0, y: 0, scale: 0.72 };
        applyTransform();
      }, 120);
    } else if (!preserveView) {
      setTimeout(() => {
        STATE.transform = { x: 0, y: 0, scale: 0.72 };
        applyTransform();
      }, 120);
    }
  } catch (e) {
    $('loading-state').innerHTML = '<p style="color:#fca5a5">⚠️ Veri yüklenirken hata oluştu. Sayfayı yenileyin.</p>';
  }
}

// =============================================
// LAYOUT ENGINE  (Knuth-style symmetric tree)
// =============================================
function computeLayout() {
  const members = Object.values(STATE.members);
  if (!members.length) return;

  const allIds = new Set(members.map(m => m.id));

  // ── 1. Build parent → children map ───────────
  const childrenOf = {};
  members.forEach(m => { childrenOf[m.id] = []; });
  members.forEach(m => {
    (m.parentIds || []).filter(pid => allIds.has(pid)).forEach(pid => {
      if (!childrenOf[pid].includes(m.id)) childrenOf[pid].push(m.id);
    });
  });

  // ── 1.5 Couple helpers ──────────────────────────
  // "Primary" = the member who dictates the layout of the couple.
  const isPrimary = id => {
    const m = STATE.members[id];
    if (!m?.spouseId || !allIds.has(m.spouseId)) return true;
    
    const sp = STATE.members[m.spouseId];
    const myP = m.parentIds?.length || 0;
    const spP = sp.parentIds?.length || 0;
    
    // The one with parents is always primary
    if (myP > 0 && spP === 0) return true;
    if (spP > 0 && myP === 0) return false;
    
    // Fallback to lower ID
    return Number(id) < Number(m.spouseId);
  };

  // ── 2. Assign generations via BFS ─────────────
  const hasParentInTree = new Set();
  members.forEach(m => {
    (m.parentIds || []).forEach(pid => { if (allIds.has(pid)) hasParentInTree.add(m.id); });
  });
  const roots = members.filter(m => !hasParentInTree.has(m.id) && isPrimary(m.id)).map(m => m.id);

  const genOf = {};
  const bfsQ  = roots.map(id => [id, 0]);
  const vis   = new Set();

  while (bfsQ.length) {
    const [id, g] = bfsQ.shift();
    if (vis.has(id)) continue;
    vis.add(id);
    genOf[id] = Math.max(genOf[id] ?? 0, g);
    const m = STATE.members[id];
    if (m?.spouseId && allIds.has(m.spouseId) && !vis.has(m.spouseId)) {
      bfsQ.unshift([m.spouseId, g]); // spouse → same generation
    }
    (childrenOf[id] || []).forEach(cid => {
      if (!vis.has(cid)) bfsQ.push([cid, g + 1]);
    });
  }
  members.forEach(m => { if (genOf[m.id] === undefined) genOf[m.id] = 0; });

  const maxGen = Math.max(...Object.values(genOf), 0);


  // All children of a person AND their spouse (no duplicates)
  const coupleChildren = id => {
    if (!isPrimary(id)) return [];
    const m = STATE.members[id];
    const ch = new Set(childrenOf[id] || []);
    if (m?.spouseId && allIds.has(m.spouseId)) {
      (childrenOf[m.spouseId] || []).forEach(c => ch.add(c));
    }
    return [...ch];
  };

  const posX = {};

  // ── 4. First pass: Calculate width of each subtree
  const treeWidth = {};
  const computeWidth = id => {
    if (!isPrimary(id)) return 0;
    const ch = coupleChildren(id);
    let childW = 0;
    ch.forEach(cid => { childW += computeWidth(cid); });
    
    const m = STATE.members[id];
    const hasSpouse = !!(m?.spouseId && allIds.has(m.spouseId));
    const selfW = hasSpouse ? (COUPLE_GAP + SIB_X) : SIB_X;
    
    treeWidth[id] = Math.max(selfW, childW);
    return treeWidth[id];
  };
  
  roots.filter(isPrimary).forEach(computeWidth);

  // ── 5. Second pass: Distribute X coords top-down
  const assignX = (id, startX) => {
    if (!isPrimary(id)) return;
    
    const m = STATE.members[id];
    const hasSpouse = !!(m?.spouseId && allIds.has(m.spouseId));
    const tw = treeWidth[id];
    
    // The visual center for this parent / couple
    const center = startX + tw / 2;
    
    if (hasSpouse) {
      posX[id]         = center - COUPLE_GAP / 2;
      posX[m.spouseId] = center + COUPLE_GAP / 2;
    } else {
      posX[id] = center;
    }

    const ch = coupleChildren(id);
    // Center the children block under the parent
    const childrenTotalWidth = ch.reduce((sum, cid) => sum + treeWidth[cid], 0);
    let childX = startX + (tw - childrenTotalWidth) / 2;
    
    ch.forEach(cid => {
      assignX(cid, childX);
      childX += treeWidth[cid];
    });
  };

  let currentX = 0;
  roots.filter(isPrimary).forEach(rid => {
    assignX(rid, currentX);
    currentX += treeWidth[rid];
  });

  // ── 6. Center the entire tree on canvas ───────
  const xs = Object.values(posX);
  const shift = xs.length ? C - (Math.min(...xs) + Math.max(...xs)) / 2 : 0;

  // 1. Assign auto positions
  members.forEach(m => {
    if (posX[m.id] === undefined) {
      posX[m.id] = currentX;
      currentX += SIB_X;
    }
    m.x = posX[m.id] + shift;
    m.y = C + (genOf[m.id] - maxGen / 2) * GEN_Y;
  });

  // 2. Apply locked positions (if manually dragged)
  members.forEach(m => {
    if (m.lockedX !== undefined && m.lockedX !== null && m.lockedY !== undefined && m.lockedY !== null) {
      m.x = m.lockedX;
      m.y = m.lockedY;
    }
  });

  // 3. Snap unlocked spouses to their locked partners
  members.forEach(m => {
    if (m.lockedX === undefined || m.lockedX === null) {
      if (m.spouseId && STATE.members[m.spouseId]) {
        const sp = STATE.members[m.spouseId];
        if (sp.lockedX !== undefined && sp.lockedX !== null) {
          if (isPrimary(m.id)) {
            m.x = sp.x - COUPLE_GAP;
          } else {
            m.x = sp.x + COUPLE_GAP;
          }
          m.y = sp.y;
        }
      }
    }
  });
}

// =============================================
// RENDER
// =============================================
function render() {
  const members = Object.values(STATE.members);
  const hasMems = members.length > 0;

  $('empty-state').style.display = hasMems ? 'none' : 'flex';
  if (!hasMems) { nodesLayer.innerHTML = ''; svg.innerHTML = ''; return; }

  computeLayout();
  renderConnections();
  renderNodes();
  renderMinimap();
}

function renderNodes() {
  const currentIds = new Set(Object.keys(STATE.members));
  nodesLayer.querySelectorAll('.family-node').forEach(el => {
    if (!currentIds.has(el.dataset.id)) el.remove();
  });

  Object.values(STATE.members).forEach(m => {
    let el = nodesLayer.querySelector(`.family-node[data-id="${m.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className  = 'family-node';
      el.dataset.id = m.id;
      nodesLayer.appendChild(el);
    }
    el.style.left = m.x + 'px';
    el.style.top  = m.y + 'px';
    el.innerHTML  = buildNodeHTML(m);
    el.classList.toggle('selected', STATE.selectedId === m.id || STATE.multiSelectedIds.has(m.id));

    el.onclick = e => {
      if (e.target.closest('.node-add-child')) return;
      e.stopPropagation();
      if (STATE.isAdmin && e.shiftKey) {
        if (STATE.multiSelectedIds.has(m.id)) STATE.multiSelectedIds.delete(m.id);
        else STATE.multiSelectedIds.add(m.id);
        renderNodes();
        return;
      }
      if (!STATE.nodeDragging) showProfileCard(m.id, el);
    };

    el.onmousedown = e => {
      if (!STATE.isAdmin || e.target.closest('.node-add-child') || e.button !== 0) return;
      e.stopPropagation();
      
      if (!STATE.multiSelectedIds.has(m.id)) {
        if (!e.shiftKey) STATE.multiSelectedIds.clear();
        STATE.multiSelectedIds.add(m.id);
        renderNodes();
      }

      STATE.nodeDragging = true;
      STATE.nodeDragStart = { x: e.clientX, y: e.clientY };
      STATE.nodeStartPositions = {};
      STATE.multiSelectedIds.forEach(sid => {
        const sm = STATE.members[sid];
        if (sm) STATE.nodeStartPositions[sid] = { x: sm.x, y: sm.y };
      });
      closeProfileCard();
    };
    const addBtn = el.querySelector('.node-add-child');
    if (addBtn) addBtn.onclick = e => { e.stopPropagation(); openAddModal(null, m.id); };
  });
}

function buildNodeHTML(m) {
  const gender = m.gender === 'female' ? 'female' : 'male';
  const years  = getYears(m);
  const photo  = m.photo
    ? `<img src="${m.photo}" alt="${escHtml(m.name)}" />`
    : `<div class="node-photo-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`;
  const addBtn = STATE.isAdmin ? `<div class="node-add-child" title="Çocuk Ekle">+</div>` : '';
  return `
    <div class="node-card ${gender} ${m.deathDate ? 'deceased' : ''}">
      <div class="node-photo-wrap">${photo}</div>
      <div class="node-name">${escHtml(m.name)}</div>
      ${years ? `<div class="node-years">${years}</div>` : ''}
      ${m.deathDate ? `<div class="node-badge"><span class="badge deceased">Merhum</span></div>` : ''}
    </div>
    ${addBtn}
  `;
}

function getYears(m) {
  const b = m.birthDate ? new Date(m.birthDate).getFullYear() : null;
  const d = m.deathDate ? new Date(m.deathDate).getFullYear() : null;
  if (b && d) return `${b} – ${d}`;
  if (b) return `d. ${b}`;
  return '';
}

function renderConnections() {
  svg.innerHTML = '';
  Object.values(STATE.members).forEach(m => {
    (m.parentIds || []).forEach(pid => {
      const p = STATE.members[pid];
      if (!p || !p.x || !m.x) return;
      drawLine(p.x, p.y, m.x, m.y);
    });
    if (m.spouseId && m.id < m.spouseId) {
      const s = STATE.members[m.spouseId];
      if (!s || !s.x || !m.x) return;
      drawSpouse(m.x, m.y, s.x, s.y);
    }
  });
}

function drawLine(x1, y1, x2, y2) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const my   = (y1 + y2) / 2;
  path.setAttribute('d', `M ${x1} ${y1 + NODE_H / 2} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2 - NODE_H / 2}`);
  path.setAttribute('class', 'connection-line connection-parent');
  svg.appendChild(path);
}

function drawSpouse(x1, y1, x2, y2) {
  const leftX = Math.min(x1, x2);
  const rightX = Math.max(x1, x2);
  
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', leftX + NODE_W / 2); line.setAttribute('y1', y1);
  line.setAttribute('x2', rightX - NODE_W / 2); line.setAttribute('y2', y2);
  line.setAttribute('class', 'connection-line connection-spouse');
  svg.appendChild(line);

  const midX = (leftX + NODE_W / 2 + rightX - NODE_W / 2) / 2;
  const midY = (y1 + y2) / 2;
  
  const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  txt.setAttribute('x', midX); txt.setAttribute('y', midY + 6);
  txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', '14');
  txt.style.filter  = 'drop-shadow(0 0 5px rgba(245,158,11,0.7))';
  txt.textContent   = '💑';
  svg.appendChild(txt);
}

// =============================================
// MINIMAP
// =============================================
function renderMinimap() {
  const canvas  = $('minimap-canvas');
  const ctx     = canvas.getContext('2d');
  const W = 160, H = 100;
  ctx.clearRect(0, 0, W, H);

  const members = Object.values(STATE.members).filter(m => m.x);
  if (!members.length) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  members.forEach(m => {
    minX = Math.min(minX, m.x); maxX = Math.max(maxX, m.x);
    minY = Math.min(minY, m.y); maxY = Math.max(maxY, m.y);
  });

  const pad = 28;
  const rx  = Math.max(maxX - minX + NODE_W, 1) + pad * 2;
  const ry  = Math.max(maxY - minY + NODE_H, 1) + pad * 2;
  const sc  = Math.min(W / rx, H / ry);
  const toX = x => (x - minX + pad) * sc + (W - rx * sc) / 2;
  const toY = y => (y - minY + pad) * sc + (H - ry * sc) / 2;

  members.forEach(m => {
    ctx.beginPath();
    ctx.arc(toX(m.x), toY(m.y), Math.max(3, NODE_W * sc / 2), 0, Math.PI * 2);
    ctx.fillStyle = m.gender === 'female'
      ? 'rgba(244,114,182,0.80)' : 'rgba(96,165,250,0.80)';
    ctx.fill();
  });
}

// =============================================
// PAN & ZOOM  (corrected anchor formula)
// =============================================
function applyTransform() {
  canvasWorld.style.transform =
    `translate(calc(-50% + ${STATE.transform.x}px), calc(-50% + ${STATE.transform.y}px)) scale(${STATE.transform.scale})`;
}

/**
 * Zoom around cursor (cx, cy in page coordinates).
 * Correct formula keeps the world-point under the cursor fixed:
 *   new_tx = (cursorInContainer - containerW/2) * (1 - sc) + old_tx * sc
 */
function zoom(factor, cx, cy) {
  const rect  = canvasContainer.getBoundingClientRect();
  const px    = (cx !== undefined ? cx : rect.left + rect.width  / 2) - rect.left;
  const py    = (cy !== undefined ? cy : rect.top  + rect.height / 2) - rect.top;
  const halfW = rect.width  / 2;
  const halfH = rect.height / 2;

  const oldS = STATE.transform.scale;
  const newS = Math.min(Math.max(oldS * factor, 0.10), 4);
  const sc   = newS / oldS;

  STATE.transform.x     = (px - halfW) * (1 - sc) + STATE.transform.x * sc;
  STATE.transform.y     = (py - halfH) * (1 - sc) + STATE.transform.y * sc;
  STATE.transform.scale = newS;
  applyTransform();
}

// ─── Mouse drag & Lasso & Node Drag ──────────────────────────────
canvasContainer.addEventListener('mousedown', e => {
  if (e.target.closest('.family-node') || e.target.closest('#profile-card') || e.button !== 0) return;
  
  if (STATE.isAdmin && e.shiftKey) {
    STATE.lassoDragging = true;
    STATE.lassoStart = { x: e.clientX, y: e.clientY };
    const rect = canvasContainer.getBoundingClientRect();
    const lasso = $('lasso-box');
    lasso.style.display = 'block';
    lasso.style.left = (e.clientX - rect.left) + 'px';
    lasso.style.top  = (e.clientY - rect.top) + 'px';
    lasso.style.width = '0px';
    lasso.style.height = '0px';
  } else {
    STATE.dragging   = true;
    STATE.dragStart  = { x: e.clientX, y: e.clientY };
    STATE.dragTStart = { ...STATE.transform };
    if (!e.shiftKey) { STATE.multiSelectedIds.clear(); renderNodes(); }
  }
  closeProfileCard();
});

window.addEventListener('mousemove', e => {
  if (STATE.nodeDragging) {
    const sc = STATE.transform.scale;
    const dx = (e.clientX - STATE.nodeDragStart.x) / sc;
    const dy = (e.clientY - STATE.nodeDragStart.y) / sc;
    STATE.multiSelectedIds.forEach(sid => {
      const m = STATE.members[sid];
      const start = STATE.nodeStartPositions[sid];
      if (m && start) {
        m.x = start.x + dx;
        m.y = start.y + dy;
      }
    });
    // Direct DOM update for performance without layout calc
    renderConnections();
    STATE.multiSelectedIds.forEach(sid => {
      const el = nodesLayer.querySelector(`.family-node[data-id="${sid}"]`);
      if (el) {
        el.style.left = STATE.members[sid].x + 'px';
        el.style.top = STATE.members[sid].y + 'px';
      }
    });
    return;
  }

  if (STATE.lassoDragging) {
    const rect = canvasContainer.getBoundingClientRect();
    const lx = Math.min(e.clientX, STATE.lassoStart.x) - rect.left;
    const ly = Math.min(e.clientY, STATE.lassoStart.y) - rect.top;
    const lw = Math.abs(e.clientX - STATE.lassoStart.x);
    const lh = Math.abs(e.clientY - STATE.lassoStart.y);
    const lasso = $('lasso-box');
    lasso.style.left = lx + 'px';
    lasso.style.top = ly + 'px';
    lasso.style.width = lw + 'px';
    lasso.style.height = lh + 'px';
    return;
  }

  if (STATE.dragging) {
    STATE.transform.x = STATE.dragTStart.x + (e.clientX - STATE.dragStart.x);
    STATE.transform.y = STATE.dragTStart.y + (e.clientY - STATE.dragStart.y);
    applyTransform();
  }
});

window.addEventListener('mouseup', async e => { 
  if (STATE.nodeDragging) {
    const wasDragged = Math.abs(e.clientX - STATE.nodeDragStart.x) > 3 || Math.abs(e.clientY - STATE.nodeDragStart.y) > 3;
    
    if (wasDragged) {
      const updates = [];
      STATE.multiSelectedIds.forEach(sid => {
        const m = STATE.members[sid];
        if (m) {
          m.lockedX = m.x; m.lockedY = m.y;
          updates.push({ id: sid, lockedX: m.lockedX, lockedY: m.lockedY });
        }
      });
      api('PUT', '/api/members/positions', { updates }).catch(console.error);
      setTimeout(() => { STATE.nodeDragging = false; }, 50);
    } else {
      STATE.nodeDragging = false;
    }
  }

  if (STATE.lassoDragging) {
    STATE.lassoDragging = false;
    $('lasso-box').style.display = 'none';
    
    // Calculate who is inside lasso
    const rect = canvasContainer.getBoundingClientRect();
    const lx1 = Math.min(e.clientX, STATE.lassoStart.x) - rect.left;
    const ly1 = Math.min(e.clientY, STATE.lassoStart.y) - rect.top;
    const lx2 = Math.max(e.clientX, STATE.lassoStart.x) - rect.left;
    const ly2 = Math.max(e.clientY, STATE.lassoStart.y) - rect.top;

    // Convert lasso coords from screen space to world space
    const wcx = rect.width / 2;
    const wcy = rect.height / 2;
    const w1x = (lx1 - wcx - STATE.transform.x) / STATE.transform.scale + wcx;
    const w1y = (ly1 - wcy - STATE.transform.y) / STATE.transform.scale + wcy;
    const w2x = (lx2 - wcx - STATE.transform.x) / STATE.transform.scale + wcx;
    const w2y = (ly2 - wcy - STATE.transform.y) / STATE.transform.scale + wcy;

    Object.values(STATE.members).forEach(m => {
      // Node visual center
      const nx = m.x;
      const ny = m.y;
      if (nx >= w1x && nx <= w2x && ny >= w1y && ny <= w2y) {
        STATE.multiSelectedIds.add(m.id);
      }
    });
    renderNodes();
  }

  STATE.dragging = false; 
});

// ─── Trackpad / Mouse wheel ──────────────────
// ctrlKey = true  → pinch-to-zoom on trackpad
// ctrlKey = false → two-finger scroll/pan on trackpad
canvasContainer.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey) {
    // Pinch zoom — deltaY is already scaled
    const factor  = 1 - e.deltaY * 0.006;
    const clamped = Math.min(Math.max(factor, 0.85), 1.15);
    zoom(clamped, e.clientX, e.clientY);
  } else {
    // Two-finger pan
    STATE.transform.x -= e.deltaX * 1.2;
    STATE.transform.y -= e.deltaY * 1.2;
    applyTransform();
  }
}, { passive: false });

// ─── Touch (mobile) ──────────────────────────
let lastTouchDist = null;
canvasContainer.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    STATE.dragging   = true;
    STATE.dragStart  = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    STATE.dragTStart = { ...STATE.transform };
  } else if (e.touches.length === 2) {
    lastTouchDist = Math.hypot(
      e.touches[1].clientX - e.touches[0].clientX,
      e.touches[1].clientY - e.touches[0].clientY
    );
  }
}, { passive: true });

canvasContainer.addEventListener('touchmove', e => {
  if (e.touches.length === 1 && STATE.dragging) {
    STATE.transform.x = STATE.dragTStart.x + (e.touches[0].clientX - STATE.dragStart.x);
    STATE.transform.y = STATE.dragTStart.y + (e.touches[0].clientY - STATE.dragStart.y);
    applyTransform();
  } else if (e.touches.length === 2 && lastTouchDist) {
    const d  = Math.hypot(
      e.touches[1].clientX - e.touches[0].clientX,
      e.touches[1].clientY - e.touches[0].clientY
    );
    const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    zoom(d / lastTouchDist, mx, my);
    lastTouchDist = d;
  }
}, { passive: true });
canvasContainer.addEventListener('touchend', () => { STATE.dragging = false; lastTouchDist = null; });

// ─── Zoom buttons ────────────────────────────
$('zoom-in-btn').onclick    = () => zoom(1.2);
$('zoom-out-btn').onclick   = () => zoom(0.83);
$('reset-view-btn').onclick = () => {
  STATE.transform = { x: 0, y: 0, scale: 0.72 };
  applyTransform();
};
$('reset-layout-btn').onclick = async () => {
  if (!confirm('Tüm serbest konumlar silinecek ve ağaç otomatik olarak yeniden dizilecektir. Onaylıyor musunuz?')) return;
  try {
    await api('POST', '/api/family/reset-layout');
    Object.values(STATE.members).forEach(m => { m.lockedX = null; m.lockedY = null; });
    STATE.multiSelectedIds.clear();
    showToast('✅ Düzen başarıyla sıfırlandı.', 'success');
    render();
  } catch(e) {
    showToast('❌ Hata: ' + e.message, 'error');
  }
};

// =============================================
// PROFILE CARD
// =============================================
function showProfileCard(id, nodeEl) {
  if (!id || !STATE.members[id]) return;
  const m = STATE.members[id];
  STATE.selectedId = id;

  nodesLayer.querySelectorAll('.node-card.selected').forEach(el => el.classList.remove('selected'));
  nodeEl.querySelector('.node-card')?.classList.add('selected');

  const pcPhoto = $('pc-photo'), pcPh = $('pc-photo-placeholder');
  if (m.photo) {
    pcPhoto.src = m.photo; pcPhoto.style.display = 'block'; pcPh.style.display = 'none';
  } else {
    pcPhoto.style.display = 'none'; pcPh.style.display = 'flex';
  }

  $('pc-name').textContent  = m.name;
  $('pc-years').textContent = getYears(m);

  const det = $('pc-details');
  det.innerHTML = '';
  [
    m.birthplace && { i: '📍', t: m.birthplace },
    m.occupation && { i: '💼', t: m.occupation },
    m.spouseId && STATE.members[m.spouseId] && { i: '💑', t: STATE.members[m.spouseId].name },
    (m.parentIds || []).map(pid => STATE.members[pid]?.name).filter(Boolean).join(' & ') &&
      { i: '👨‍👩‍👦', t: (m.parentIds || []).map(pid => STATE.members[pid]?.name).filter(Boolean).join(' & ') },
    m.bio && { i: '📝', t: m.bio.slice(0, 90) + (m.bio.length > 90 ? '…' : '') },
  ].filter(Boolean).forEach(r => {
    const d = document.createElement('div'); d.className = 'pc-detail-row';
    d.innerHTML = `<span>${r.i}</span><span>${escHtml(r.t)}</span>`;
    det.appendChild(d);
  });

  const acts = $('pc-actions');
  acts.innerHTML = '';
  if (STATE.isAdmin) {
    acts.append(
      mkBtn('btn-outline small', '✏️ Düzenle', () => { closeProfileCard(); openEditModal(id); }),
      mkBtn('btn-outline small', '👶 Çocuk',   () => { closeProfileCard(); openAddModal(null, id); }),
      mkBtn('btn-outline small', '💑 Eş Ekle', () => { closeProfileCard(); openAddModal(null, null, id); })
    );
  }

  const card = $('profile-card');
  card.style.display = 'block';
  const nr   = nodeEl.getBoundingClientRect();
  let left   = nr.right + 12;
  let top    = nr.top;
  if (left + 290 > window.innerWidth) left = nr.left - 290 - 12;
  top = Math.max(80, Math.min(top, window.innerHeight - 380));
  card.style.left = left + 'px';
  card.style.top  = top  + 'px';
}

function mkBtn(cls, text, onclick) {
  const b = document.createElement('button');
  b.className = cls; b.textContent = text; b.onclick = onclick;
  return b;
}

function closeProfileCard() {
  $('profile-card').style.display = 'none';
  STATE.selectedId = null;
  nodesLayer.querySelectorAll('.node-card.selected').forEach(el => el.classList.remove('selected'));
}

$('profile-card-close').onclick = closeProfileCard;
canvasContainer.addEventListener('click', e => {
  if (!e.target.closest('.family-node') && !e.target.closest('#profile-card')) closeProfileCard();
});

// =============================================
// MEMBER MODAL (Admin only)
// =============================================
function openAddModal(id = null, parentId = null, spouseId = null) {
  if (!STATE.isAdmin) { showToast('🔒 Bu işlem için admin girişi gerekli', 'error'); return; }
  STATE.editingId = null; STATE.presetParentId = parentId; STATE.presetSpouseId = spouseId;
  STATE.currentPhotoData = null; STATE.currentPhotoUrl = null;

  $('modal-title').textContent = 'Yeni Üye Ekle';
  $('modal-delete').style.display = 'none';
  ['member-name','member-birth','member-death','member-birthplace','member-occupation','member-bio']
    .forEach(id => $(id).value = '');
  $('photo-img').style.display = 'none';
  $('photo-placeholder').style.display = 'flex';
  $('remove-photo-btn').style.display = 'none';

  STATE.selectedGender = 'male';
  updateGenderBtns();
  populateRelationSelects();
  if (parentId) [...$('parent-select').options].forEach(o => { o.selected = o.value === String(parentId); });
  if (spouseId) $('spouse-select').value = String(spouseId);

  openModal($('member-modal'));
  $('member-name').focus();
}

function openEditModal(id) {
  if (!STATE.isAdmin) return;
  const m = STATE.members[id];
  if (!m) return;
  STATE.editingId = id; STATE.currentPhotoData = null; STATE.currentPhotoUrl = m.photo || null;

  $('modal-title').textContent = 'Üyeyi Düzenle';
  $('modal-delete').style.display = 'inline-flex';
  $('member-name').value       = m.name       || '';
  $('member-birth').value      = m.birthDate  || '';
  $('member-death').value      = m.deathDate  || '';
  $('member-birthplace').value = m.birthplace || '';
  $('member-occupation').value = m.occupation || '';
  $('member-bio').value        = m.bio        || '';

  if (m.photo) {
    $('photo-img').src = m.photo; $('photo-img').style.display = 'block';
    $('photo-placeholder').style.display = 'none'; $('remove-photo-btn').style.display = 'inline-flex';
  } else {
    $('photo-img').style.display = 'none'; $('photo-placeholder').style.display = 'flex';
    $('remove-photo-btn').style.display = 'none';
  }

  STATE.selectedGender = m.gender || 'male';
  updateGenderBtns();
  populateRelationSelects(id);
  [...$('parent-select').options].forEach(o => { o.selected = (m.parentIds || []).includes(o.value); });
  $('spouse-select').value = m.spouseId || '';

  openModal($('member-modal'));
}

function populateRelationSelects(excludeId = null) {
  const members = Object.values(STATE.members).filter(m => m.id !== excludeId);
  $('parent-select').innerHTML = members.map(m =>
    `<option value="${m.id}">${escHtml(m.name)}${m.birthDate ? ` (${new Date(m.birthDate).getFullYear()})` : ''}</option>`
  ).join('');
  $('spouse-select').innerHTML = '<option value="">-- Eş seçmeyin --</option>' +
    members.map(m => `<option value="${m.id}">${escHtml(m.name)}</option>`).join('');
}

function updateGenderBtns() {
  $('gender-male').classList.toggle('active',   STATE.selectedGender === 'male');
  $('gender-female').classList.toggle('active', STATE.selectedGender === 'female');
}

$('gender-male').onclick   = () => { STATE.selectedGender = 'male';   updateGenderBtns(); };
$('gender-female').onclick = () => { STATE.selectedGender = 'female'; updateGenderBtns(); };

$('photo-input').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  $('upload-progress').style.display = 'block';
  $('upload-bar').style.width = '30%';
  try {
    const form = new FormData(); form.append('photo', file);
    const res  = await fetch('/api/upload-photo', { method: 'POST', body: form, credentials: 'same-origin' });
    $('upload-bar').style.width = '80%';
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    STATE.currentPhotoUrl = data.url;
    $('photo-img').src = data.url; $('photo-img').style.display = 'block';
    $('photo-placeholder').style.display = 'none'; $('remove-photo-btn').style.display = 'inline-flex';
    $('upload-bar').style.width = '100%';
    setTimeout(() => { $('upload-progress').style.display = 'none'; $('upload-bar').style.width = '0%'; }, 600);
  } catch (err) { showToast('❌ Fotoğraf yüklenemedi: ' + err.message, 'error'); $('upload-progress').style.display = 'none'; }
  e.target.value = '';
});

$('remove-photo-btn').onclick = () => {
  STATE.currentPhotoUrl = null;
  $('photo-img').src = ''; $('photo-img').style.display = 'none';
  $('photo-placeholder').style.display = 'flex'; $('remove-photo-btn').style.display = 'none';
};

$('modal-save').onclick   = saveMember;
$('modal-cancel').onclick = () => closeModal($('member-modal'));
$('member-modal-close').onclick = () => closeModal($('member-modal'));
$('member-modal').addEventListener('click', e => { if (e.target === $('member-modal')) closeModal($('member-modal')); });

async function saveMember() {
  const name = $('member-name').value.trim();
  if (!name) { showToast('⚠️ Lütfen bir isim girin', 'error'); $('member-name').focus(); return; }

  const parentIds = [...$('parent-select').selectedOptions].map(o => o.value).filter(Boolean);
  const spouseId  = $('spouse-select').value || null;

  const payload = {
    name,
    gender:     STATE.selectedGender,
    birthDate:  $('member-birth').value      || null,
    deathDate:  $('member-death').value      || null,
    birthplace: $('member-birthplace').value.trim() || null,
    occupation: $('member-occupation').value.trim() || null,
    bio:        $('member-bio').value.trim()        || null,
    photo:      STATE.currentPhotoUrl || null,
    parentIds,
    spouseId,
  };

  if (STATE.presetParentId && !payload.parentIds.includes(String(STATE.presetParentId)))
    payload.parentIds.push(String(STATE.presetParentId));
  if (STATE.presetSpouseId) payload.spouseId = String(STATE.presetSpouseId);

  $('modal-save').textContent = 'Kaydediliyor...';
  const wasEditing = !!STATE.editingId;
  const editId     = STATE.editingId;

  try {
    let result;
    if (wasEditing) result = await api('PUT',  `/api/members/${editId}`, payload);
    else             result = await api('POST', '/api/members', payload);

    closeModal($('member-modal'));
    // ✅ preserveView = true → sayfa sıfırlanmaz, kaldığın yerden devam edersin
    await loadFamily(true);
    showToast(`✅ ${name} ${wasEditing ? 'güncellendi' : 'eklendi'}`, 'success');

    // Auto-focus iptal edildi: yeni üye eklendikten sonra ekran kaymayacak.
  } catch (err) { showToast('❌ ' + err.message, 'error'); }

  $('modal-save').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Kaydet`;
  STATE.editingId = null; STATE.presetParentId = null; STATE.presetSpouseId = null;
}

$('modal-delete').onclick = async () => {
  const id = STATE.editingId; if (!id) return;
  const name = STATE.members[id]?.name || 'Üye';
  if (!confirm(`"${name}" kişisini silmek istediğinizden emin misiniz?`)) return;
  try {
    await api('DELETE', `/api/members/${id}`);
    closeModal($('member-modal'));
    await loadFamily(true); // preserve view after delete too
    showToast(`🗑️ ${name} silindi`, 'info');
  } catch (err) { showToast('❌ ' + err.message, 'error'); }
};

// =============================================
// NAVBAR BUTTONS
// =============================================
$('add-member-btn').onclick = () => openAddModal();
$('empty-add-btn').onclick  = () => openAddModal();

$('settings-btn').onclick = () => { $('family-name-input').value = STATE.familyName; openModal($('settings-modal')); };
$('settings-close').onclick = () => closeModal($('settings-modal'));
$('settings-modal').addEventListener('click', e => { if (e.target === $('settings-modal')) closeModal($('settings-modal')); });

$('save-family-name').onclick = async () => {
  const name = $('family-name-input').value.trim() || 'Ailem';
  await api('PUT', '/api/family/name', { familyName: name });
  STATE.familyName = name;
  $('family-name-display').textContent = name;
  showToast('✅ Aile adı güncellendi', 'success');
};

$('export-btn').onclick = async () => {
  const data = await api('GET', '/api/family');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${(STATE.familyName || 'aile').replace(/\s+/g, '_')}_soy_agaci.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('📤 Dışa aktarıldı', 'success');
};

$('import-input').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!confirm('İçe aktarma mevcut veriyi siler. Devam edilsin mi?')) return;
      const cur = await api('GET', '/api/family');
      for (const id of Object.keys(cur.members)) await api('DELETE', `/api/members/${id}`).catch(() => {});
      if (data.familyName) await api('PUT', '/api/family/name', { familyName: data.familyName });
      const sorted = [...Object.values(data.members || {})].sort((a, b) => (a.parentIds?.length || 0) - (b.parentIds?.length || 0));
      for (const m of sorted) await api('POST', '/api/members', { ...m, id: undefined }).catch(() => {});
      await loadFamily(false);
      showToast('📥 Başarıyla içe aktarıldı', 'success');
    } catch (err) { showToast('❌ Geçersiz dosya: ' + err.message, 'error'); }
  };
  reader.readAsText(file); e.target.value = '';
});

$('clear-all-btn').onclick = async () => {
  if (!confirm('TÜM VERİYİ SİL! Bu işlem geri alınamaz. Emin misiniz?')) return;
  const data = await api('GET', '/api/family');
  for (const id of Object.keys(data.members)) await api('DELETE', `/api/members/${id}`).catch(() => {});
  await loadFamily(false);
  closeModal($('settings-modal'));
  showToast('🗑️ Tüm veri silindi', 'info');
};

// =============================================
// SEARCH
// =============================================
$('search-btn').onclick = () => { $('search-bar').classList.add('visible'); $('search-input').focus(); };
$('search-close').onclick = () => {
  $('search-bar').classList.remove('visible');
  $('search-input').value = '';
  $('search-results').innerHTML = '';
};

$('search-input').addEventListener('input', e => {
  const q   = e.target.value.toLowerCase().trim();
  const res = $('search-results');
  if (!q) { res.innerHTML = ''; return; }

  const matches = Object.values(STATE.members).filter(m =>
    m.name.toLowerCase().includes(q) ||
    (m.birthDate  && m.birthDate.includes(q)) ||
    (m.occupation && m.occupation.toLowerCase().includes(q)) ||
    (m.birthplace && m.birthplace.toLowerCase().includes(q))
  );

  if (!matches.length) { res.innerHTML = '<div class="no-results">Sonuç bulunamadı</div>'; return; }

  res.innerHTML = matches.slice(0, 8).map(m => `
    <div class="search-result-item" data-id="${m.id}">
      <div class="search-result-avatar">${m.photo ? `<img src="${m.photo}" alt="${escHtml(m.name)}" />` : (m.gender === 'female' ? '👩' : '👨')}</div>
      <div class="search-result-info">
        <div class="name">${escHtml(m.name)}</div>
        <div class="detail">${[getYears(m), m.occupation].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  `).join('');

  res.querySelectorAll('.search-result-item').forEach(el => {
    el.onclick = () => { focusMember(el.dataset.id); $('search-close').click(); };
  });
});

function focusMember(id) {
  const m = STATE.members[id]; if (!m || !m.x) return;
  const rect = canvasContainer.getBoundingClientRect();
  STATE.transform.x = rect.width  / 2 - m.x * STATE.transform.scale;
  STATE.transform.y = rect.height / 2 - m.y * STATE.transform.scale;
  applyTransform();
  setTimeout(() => {
    const el = nodesLayer.querySelector(`.family-node[data-id="${id}"]`);
    if (el) { el.classList.add('highlight'); setTimeout(() => el.classList.remove('highlight'), 3500); }
  }, 300);
}

// =============================================
// MODAL UTILITIES
// =============================================
function openModal(modal)  { modal.classList.add('active'); }
function closeModal(modal) { modal.classList.remove('active'); }

// =============================================
// TOAST
// =============================================
let toastTimer;
function showToast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

// =============================================
// HELPERS
// =============================================
function escHtml(str) {
  const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}

// =============================================
// KEYBOARD SHORTCUTS
// =============================================
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeProfileCard();
    [$('member-modal'), $('settings-modal'), $('login-modal')].forEach(m => {
      if (m.classList.contains('active')) closeModal(m);
    });
    if ($('search-bar').classList.contains('visible')) $('search-close').click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f')  { e.preventDefault(); $('search-btn').click(); }
  if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoom(1.2); }
  if ((e.ctrlKey || e.metaKey) &&  e.key === '-') { e.preventDefault(); zoom(0.83); }
});

// =============================================
// INIT
// =============================================
initParticles();

(async () => {
  await checkAuth();
  await loadFamily(false); // first load → reset view
})();
