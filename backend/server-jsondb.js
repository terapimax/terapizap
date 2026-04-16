const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { nanoid } = require('nanoid');

const app = express();
app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));
const upload = multer({ dest: uploadsDir });

const DB_FILE = path.join(__dirname, 'db.json');
function readDB() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { messages: [], kanban_columns: [], leads: [], midias: [] };
  }
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// init
const dbInit = readDB();
if (!dbInit.kanban_columns || dbInit.kanban_columns.length === 0) {
  dbInit.kanban_columns = [ { id: 1, title: 'Novos Leads', position: 1 }, { id: 2, title: 'Em Negociação', position: 2 }, { id: 3, title: 'Fechado', position: 3 } ];
  writeDB(dbInit);
}

// Messages
app.get('/api/messages', (req, res) => {
  const db = readDB();
  res.json((db.messages || []).slice().reverse());
});
app.post('/api/messages', (req, res) => {
  const { title, content } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const db = readDB();
  const entry = { id: nanoid(), title, content: content || '', is_favorite: false, created_at: new Date().toISOString() };
  db.messages.push(entry);
  writeDB(db);
  res.json(entry);
});
app.delete('/api/messages/:id', (req, res) => {
  const db = readDB();
  db.messages = (db.messages || []).filter(m => m.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// Kanban & leads
app.get('/api/kanban', (req, res) => {
  const db = readDB();
  const cols = (db.kanban_columns || []).sort((a,b)=>a.position-b.position);
  const leads = db.leads || [];
  const data = cols.map(c => ({ id: c.id, title: c.title, items: (leads.filter(l => l.column_id === c.id)) }));
  res.json(data);
});
app.post('/api/kanban/column', (req, res) => {
  const { title } = req.body;
  const db = readDB();
  const pos = (db.kanban_columns || []).length + 1;
  const entry = { id: pos, title, position: pos };
  db.kanban_columns = db.kanban_columns || [];
  db.kanban_columns.push(entry);
  writeDB(db);
  res.json(entry);
});
app.post('/api/leads', (req, res) => {
  const { name, phone, email, product, value } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
  const db = readDB();
  const firstCol = (db.kanban_columns || [])[0];
  const entry = { id: nanoid(), name, phone, email: email || '', product: product || '', value: value || 0, last_message: '', column_id: firstCol ? firstCol.id : null, position: (db.leads || []).length + 1 };
  db.leads = db.leads || [];
  db.leads.push(entry);
  writeDB(db);
  res.json(entry);
});

// Midias upload
app.post('/api/midias', upload.single('file'), (req, res) => {
  const file = req.file;
  const title = req.body.title || (file && file.originalname) || 'untitled';
  const caption = req.body.caption || '';
  if (!file) return res.status(400).json({ error: 'file required' });
  const url = `/uploads/${path.basename(file.path)}`;
  const db = readDB();
  db.midias = db.midias || [];
  const entry = { id: nanoid(), title, url, mime_type: file.mimetype, size: file.size, caption, is_favorite: false, created_at: new Date().toISOString() };
  db.midias.push(entry);
  writeDB(db);
  res.json(entry);
});
app.get('/api/midias', (req, res) => {
  const db = readDB();
  res.json((db.midias || []).slice().reverse());
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('ZapFlow jsondb backend running on port', port));
