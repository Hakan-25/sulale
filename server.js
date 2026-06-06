// =============================================
// FAMILY TREE WEB SERVER
// =============================================
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIG ─────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bayrak25';
const DATA_FILE = path.join(__dirname, 'data', 'family.json');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure directories exist
[path.join(__dirname, 'data'), UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── MIDDLEWARE ──────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'sulale-gizli-anahtar-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Multer for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `photo_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Sadece resim dosyaları yüklenebilir'));
  }
});

// ─── DATA HELPERS ───────────────────────────
function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return getDefaultData();
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return getDefaultData();
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getDefaultData() {
  return {
    familyName: 'Ailem',
    nextId: 1,
    members: {}
  };
}

// ─── AUTH MIDDLEWARE ─────────────────────────
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Yetkisiz erişim. Admin girişi gerekli.' });
}

// ─── AUTH ROUTES ────────────────────────────
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.json({ success: true, message: 'Başarıyla giriş yapıldı.' });
  } else {
    res.status(401).json({ success: false, error: 'Hatalı şifre.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/auth-status', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ─── FAMILY DATA ROUTES ──────────────────────
// GET all data (public)
app.get('/api/family', (req, res) => {
  const data = readData();
  res.json(data);
});

// UPDATE family name (admin only)
app.put('/api/family/name', requireAdmin, (req, res) => {
  const { familyName } = req.body;
  const data = readData();
  data.familyName = familyName || 'Ailem';
  writeData(data);
  res.json({ success: true, familyName: data.familyName });
});

// ADD member (admin only)
app.post('/api/members', requireAdmin, (req, res) => {
  const data = readData();
  const id = String(data.nextId++);
  const member = {
    id,
    name: req.body.name,
    gender: req.body.gender || 'male',
    birthDate: req.body.birthDate || null,
    deathDate: req.body.deathDate || null,
    birthplace: req.body.birthplace || null,
    occupation: req.body.occupation || null,
    bio: req.body.bio || null,
    photo: req.body.photo || null,
    parentIds: req.body.parentIds || [],
    spouseId: req.body.spouseId || null,
    lockedX: req.body.lockedX || null,
    lockedY: req.body.lockedY || null,
    x: null,
    y: null,
  };
  data.members[id] = member;

  // Update spouse reference
  if (member.spouseId && data.members[member.spouseId]) {
    data.members[member.spouseId].spouseId = id;
  }

  writeData(data);
  res.json({ success: true, member });
});

// UPDATE member (admin only)
app.put('/api/members/:id', requireAdmin, (req, res) => {
  const data = readData();
  const { id } = req.params;
  if (!data.members[id]) return res.status(404).json({ error: 'Üye bulunamadı.' });

  const old = data.members[id];
  const member = {
    ...old,
    name: req.body.name ?? old.name,
    gender: req.body.gender ?? old.gender,
    birthDate: req.body.birthDate ?? old.birthDate,
    deathDate: req.body.deathDate ?? old.deathDate,
    birthplace: req.body.birthplace ?? old.birthplace,
    occupation: req.body.occupation ?? old.occupation,
    bio: req.body.bio ?? old.bio,
    photo: req.body.photo !== undefined ? req.body.photo : old.photo,
    parentIds: req.body.parentIds ?? old.parentIds,
    spouseId: req.body.spouseId ?? old.spouseId,
    lockedX: req.body.lockedX ?? old.lockedX,
    lockedY: req.body.lockedY ?? old.lockedY,
  };

  // Handle spouse change
  if (old.spouseId && old.spouseId !== member.spouseId && data.members[old.spouseId]) {
    data.members[old.spouseId].spouseId = null;
  }
  if (member.spouseId && data.members[member.spouseId]) {
    data.members[member.spouseId].spouseId = id;
  }

  data.members[id] = member;
  writeData(data);
  res.json({ success: true, member });
});

// DELETE member (admin only)
app.delete('/api/members/:id', requireAdmin, (req, res) => {
  const data = readData();
  const { id } = req.params;
  if (!data.members[id]) return res.status(404).json({ error: 'Üye bulunamadı.' });

  const name = data.members[id].name;

  // Clean up references
  Object.values(data.members).forEach(m => {
    if (m.spouseId === id) m.spouseId = null;
    if (m.parentIds) m.parentIds = m.parentIds.filter(p => p !== id);
  });

  delete data.members[id];
  writeData(data);
  res.json({ success: true, message: `${name} silindi.` });
});

// BULK UPDATE POSITIONS (admin only)
app.put('/api/members/positions', requireAdmin, (req, res) => {
  const data = readData();
  const updates = req.body.updates; // [{id, lockedX, lockedY}]
  
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'Geçersiz veri formatı.' });

  updates.forEach(u => {
    if (data.members[u.id]) {
      data.members[u.id].lockedX = u.lockedX;
      data.members[u.id].lockedY = u.lockedY;
    }
  });

  writeData(data);
  res.json({ success: true });
});

// RESET LAYOUT (admin only)
app.post('/api/family/reset-layout', requireAdmin, (req, res) => {
  const data = readData();
  Object.values(data.members).forEach(m => {
    m.lockedX = null;
    m.lockedY = null;
  });
  writeData(data);
  res.json({ success: true, message: 'Düzen sıfırlandı.' });
});

// UPLOAD photo (admin only)
app.post('/api/upload-photo', requireAdmin, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yüklenemedi.' });
  res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

// ─── SERVE SPA ──────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ──────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  🌳 Sülale Soy Ağacı Web Sunucusu Başladı!');
  console.log('  ═══════════════════════════════════════════');
  console.log(`  🌐 Adres:    http://localhost:${PORT}`);
  console.log(`  🔐 Admin Şifre: ${ADMIN_PASSWORD}`);
  console.log('  ─────────────────────────────────────────');
  console.log('  ℹ️  Şifreyi değiştirmek için:');
  console.log('     ADMIN_PASSWORD=yenisifre node server.js');
  console.log('');
});
