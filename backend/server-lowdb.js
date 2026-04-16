const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { nanoid } = require('nanoid');

const app = express();
app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));
const upload = multer({ dest: uploadsDir });

// LowDB setup
const dbFile = path.join(__dirname, 'db.json');
const adapter = new JSONFile(dbFile);
const db = new Low(adapter);

async function initDb() {
  await db.read();
  db.data ||= { messages: [], kanban_columns: [], leads: [], midias: [] };
  // seed default kanban columns if missing
  if (db.data.kanban_columns.length === 0) {
    db.data.kanban_columns.push({ id: 1, title: 'Novos Leads', position: 1 });
    db.data.kanban_columns.push({ id: 2, title: 'Em Negociação', position: 2 });
    db.data.kanban_columns.push({ id: 3, title: 'Fechado', position: 3 });
    await db.write();
  }
}

initDb();

// Messages
app.get('/api/messages', async (req, res) => {
  await db.read();
  res.json(db.data.messages.slice().reverse());
});
app.post('/api/messages', async (req, res) => {
  const { title, content } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const entry = { id: nanoid(), title, content: content || '', is_favorite: false, created_at: new Date().toISOString() };
  db.data.messages.push(entry);
  await db.write();
  res.json(entry);
});
app.delete('/api/messages/:id', async (req, res) => {
  await db.read();
  db.data.messages = db.data.messages.filter(m => m.id !== req.params.id);
  await db.write();
  res.json({ ok: true });
});

// Kanban & leads
app.get('/api/kanban', async (req, res) => {
  await db.read();
  const cols = db.data.kanban_columns.sort((a,b)=>a.position-b.position);
  const leads = db.data.leads;
  const data = cols.map(c => ({ id: c.id, title: c.title, items: leads.filter(l => l.column_id === c.id) }));
  res.json(data);
});
app.post('/api/kanban/column', async (req, res) => {
  const { title } = req.body;
  await db.read();
  const pos = db.data.kanban_columns.length + 1;
  const entry = { id: pos, title, position: pos };
  db.data.kanban_columns.push(entry);
  await db.write();
  res.json(entry);
});
app.post('/api/leads', async (req, res) => {
  const { name, phone, email, product, value } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
  await db.read();
  const firstCol = db.data.kanban_columns[0];
  const entry = { id: nanoid(), name, phone, email: email || '', product: product || '', value: value || 0, last_message: '', column_id: firstCol ? firstCol.id : null, position: (db.data.leads.length + 1) };
  db.data.leads.push(entry);
  await db.write();
  res.json(entry);
});

// Midias upload
app.post('/api/midias', upload.single('file'), async (req, res) => {
  const file = req.file;
  const title = req.body.title || (file && file.originalname) || 'untitled';
  const caption = req.body.caption || '';
  if (!file) return res.status(400).json({ error: 'file required' });
  const url = `/uploads/${path.basename(file.path)}`;
  await db.read();
  const entry = { id: nanoid(), title, url, mime_type: file.mimetype, size: file.size, caption, is_favorite: false, created_at: new Date().toISOString() };
  db.data.midias.push(entry);
  await db.write();
  res.json(entry);
});
app.get('/api/midias', async (req, res) => {
  await db.read();
  res.json(db.data.midias.slice().reverse());
});

app.get('/api/health', async (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('ZapFlow lowdb backend running on port', port));
