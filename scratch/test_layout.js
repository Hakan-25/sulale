const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./data/family.json', 'utf8'));

const STATE = { members: data.members };
const NODE_W     = 158;
const NODE_H     = 150;
const GEN_Y      = 270;   
const SIB_X      = 240;   
const COUPLE_GAP = NODE_W + 52; 
const C          = 2500;  

function computeLayout() {
  const members = Object.values(STATE.members);
  if (!members.length) return;

  const allIds = new Set(members.map(m => m.id));
  const childrenOf = {};
  members.forEach(m => { childrenOf[m.id] = []; });
  members.forEach(m => {
    (m.parentIds || []).filter(pid => allIds.has(pid)).forEach(pid => {
      if (!childrenOf[pid].includes(m.id)) childrenOf[pid].push(m.id);
    });
  });

  const hasParentInTree = new Set();
  members.forEach(m => {
    (m.parentIds || []).forEach(pid => { if (allIds.has(pid)) hasParentInTree.add(m.id); });
  });
  const roots = members.filter(m => !hasParentInTree.has(m.id)).map(m => m.id);

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
      bfsQ.unshift([m.spouseId, g]); 
    }
    (childrenOf[id] || []).forEach(cid => {
      if (!vis.has(cid)) bfsQ.push([cid, g + 1]);
    });
  }
  members.forEach(m => { if (genOf[m.id] === undefined) genOf[m.id] = 0; });

  const isPrimary = id => {
    const m = STATE.members[id];
    if (!m?.spouseId || !allIds.has(m.spouseId)) return true;
    return Number(id) < Number(m.spouseId);
  };

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

  // First pass: calculate widths of subtrees
  const treeWidth = {};
  const computeWidth = id => {
    if (!isPrimary(id)) return 0;
    const ch = coupleChildren(id);
    let childW = 0;
    ch.forEach(cid => {
      childW += computeWidth(cid);
    });
    
    const m = STATE.members[id];
    const hasSpouse = !!(m?.spouseId && allIds.has(m.spouseId));
    const selfW = hasSpouse ? (COUPLE_GAP + SIB_X) : SIB_X;
    
    treeWidth[id] = Math.max(selfW, childW);
    return treeWidth[id];
  };
  
  roots.filter(isPrimary).forEach(computeWidth);

  // Second pass: assign X based on widths
  const assignX2 = (id, startX) => {
    if (!isPrimary(id)) return;
    
    const m = STATE.members[id];
    const hasSpouse = !!(m?.spouseId && allIds.has(m.spouseId));
    const tw = treeWidth[id];
    
    // The center of this family unit
    const center = startX + tw / 2;
    
    if (hasSpouse) {
      posX[id] = center - COUPLE_GAP / 2;
      posX[m.spouseId] = center + COUPLE_GAP / 2;
    } else {
      posX[id] = center;
    }

    const ch = coupleChildren(id);
    let childX = startX + (tw - ch.reduce((sum, cid) => sum + treeWidth[cid], 0)) / 2;
    ch.forEach(cid => {
      assignX2(cid, childX);
      childX += treeWidth[cid];
    });
  };

  let currentX = 0;
  roots.filter(isPrimary).forEach(rid => {
    assignX2(rid, currentX);
    currentX += treeWidth[rid];
  });

  members.forEach(m => {
    if (posX[m.id] === undefined) {
      posX[m.id] = currentX;
      currentX += SIB_X;
    }
    m.x = posX[m.id];
    m.y = genOf[m.id] * GEN_Y;
  });

  console.log(members.map(m => `${m.id} (${m.name}): x=${m.x}, y=${m.y}`));
}

computeLayout();
