const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, init } = require('./db');

init();

const app = express();
app.use(cors());
app.use(express.json());

// static folder for uploaded files
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

// Serve static frontend files from the parent directory
app.use(express.static(path.join(__dirname, '../')));

// Serve zapflow-painel.html at root (simulating vercel.json)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../zapflow-painel.html'));
});

// Mantém a extensão original para que /uploads sirva o Content-Type correto (áudio/imagem/pdf)
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
      cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 10) + ext);
    },
  }),
});

// Messages endpoints
app.get('/api/messages', (req, res) => {
  const rows = db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all();
  res.json(rows);
});
app.post('/api/messages', (req, res) => {
  const { title, content } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const info = db.prepare('INSERT INTO messages (title, content) VALUES (?, ?)').run(title, content || '');
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});
app.delete('/api/messages/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Leads & Kanban endpoints
app.get('/api/kanban', (req, res) => {
  const columns = db.prepare('SELECT * FROM kanban_columns ORDER BY position ASC').all();
  const leads = db.prepare('SELECT * FROM leads ORDER BY position ASC').all();
  // assemble structure
  const data = columns.map(col => ({ id: col.id, title: col.title, items: leads.filter(l => l.column_id === col.id) }));
  res.json(data);
});

app.post('/api/kanban/column', (req, res) => {
  const { title } = req.body;
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 as p FROM kanban_columns').get().p;
  const info = db.prepare('INSERT INTO kanban_columns (title, position) VALUES (?, ?)').run(title, pos);
  const row = db.prepare('SELECT * FROM kanban_columns WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

app.post('/api/leads', (req, res) => {
  const { name, phone, email, product, value } = req.body;
  // default to first column
  const col = db.prepare('SELECT id FROM kanban_columns ORDER BY position LIMIT 1').get();
  const column_id = col ? col.id : null;
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 as p FROM leads WHERE column_id IS ?').get(column_id).p;
  const info = db.prepare('INSERT INTO leads (name, phone, email, product, value, column_id, position) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, phone, email || '', product || '', value || 0, column_id, pos);
  const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

// Media upload
app.post('/api/midias', upload.single('file'), (req, res) => {
  const file = req.file;
  const title = req.body.title || file.originalname;
  const caption = req.body.caption || '';
  if (!file) return res.status(400).json({ error: 'file required' });
  const url = `/uploads/${path.basename(file.path)}`;
  const info = db.prepare('INSERT INTO midias (title, url, mime_type, size, caption) VALUES (?, ?, ?, ?, ?)')
    .run(title, url, file.mimetype, file.size, caption);
  const row = db.prepare('SELECT * FROM midias WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

app.get('/api/midias', (req, res) => {
  const rows = db.prepare('SELECT * FROM midias ORDER BY created_at DESC').all();
  res.json(rows);
});

// ---- Conversão de áudio para o formato de mensagem de voz do WhatsApp (OGG/Opus mono 48 kHz) ----
const { execFile } = require('child_process');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const run = (bin, args) => new Promise((resolve, reject) =>
  execFile(bin, args, { windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) =>
    err ? reject(new Error((stderr || err.message).toString().slice(-400))) : resolve(stdout.toString())));

async function probeAudio(file) {
  const out = await run(FFPROBE, ['-v', 'error', '-select_streams', 'a:0', '-show_entries',
    'stream=codec_name,channels:format=format_name,duration', '-of', 'json', file]);
  const j = JSON.parse(out);
  const s = (j.streams || [])[0] || {};
  return { codec: s.codec_name, channels: s.channels, format: (j.format || {}).format_name || '', duration: parseFloat((j.format || {}).duration) || 0 };
}

// Retorna { path, duration, converted }. Se o ffmpeg não existir, mantém o arquivo original.
async function toWhatsAppVoice(inputPath) {
  let info;
  try { info = await probeAudio(inputPath); } catch (e) {
    console.warn('⚠️ ffprobe indisponível ou arquivo inválido — áudio salvo sem conversão:', e.message);
    return { path: inputPath, duration: 0, converted: false };
  }
  if (info.codec === 'opus' && info.format.includes('ogg') && info.channels === 1) {
    return { path: inputPath, duration: info.duration, converted: false };
  }
  const outPath = inputPath.replace(/\.[^.\\/]*$/, '') + '-voice.ogg';
  await run(FFMPEG, ['-y', '-v', 'error', '-i', inputPath, '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', '48000',
    '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', outPath]);
  fs.unlink(inputPath, () => {});
  const after = await probeAudio(outPath).catch(() => ({ duration: info.duration }));
  return { path: outPath, duration: after.duration || info.duration, converted: true };
}

// Audios Endpoints
app.post('/api/audios', upload.single('file'), async (req, res) => {
  const file = req.file;
  const title = req.body.title || (file ? file.originalname : 'Sem título');

  if (!file) return res.status(400).json({ error: 'file required' });
  let voice;
  try {
    voice = await toWhatsAppVoice(file.path);
  } catch (e) {
    fs.unlink(file.path, () => {});
    return res.status(422).json({ error: 'Não foi possível converter o áudio: ' + e.message });
  }
  const url = `/uploads/${path.basename(voice.path)}`;
  const duration = Math.round(voice.duration) || Number(req.body.duration) || 0;
  if (voice.converted) console.log(`🎙️ Áudio convertido para OGG/Opus: ${title} (${duration}s)`);

  const info = db.prepare('INSERT INTO audios (title, url, duration) VALUES (?, ?, ?)')
    .run(title, url, duration);
  const row = db.prepare('SELECT * FROM audios WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

app.get('/api/audios', (req, res) => {
  const rows = db.prepare('SELECT * FROM audios ORDER BY created_at DESC').all();
  res.json(rows);
});

app.delete('/api/audios/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('DELETE FROM audios WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Documents Endpoints
app.post('/api/documents', upload.single('file'), (req, res) => {
  const file = req.file;
  const title = req.body.title || (file ? file.originalname : 'Sem título');

  if (!file) return res.status(400).json({ error: 'file required' });
  const url = `/uploads/${path.basename(file.path)}`;
  const file_type = path.extname(file.originalname).replace('.', '');

  const info = db.prepare('INSERT INTO documents (title, url, file_type) VALUES (?, ?, ?)')
    .run(title, url, file_type);
  const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

app.get('/api/documents', (req, res) => {
  const rows = db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all();
  res.json(rows);
});

app.delete('/api/documents/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Funnels Endpoints
app.get('/api/funnels', (req, res) => {
  const rows = db.prepare('SELECT * FROM funnels ORDER BY created_at DESC').all();
  // Get items for each funnel (simple approach)
  const funnelsWithItems = rows.map(funnel => {
    const items = db.prepare('SELECT * FROM funnel_items WHERE funnel_id = ? ORDER BY position ASC').all(funnel.id);
    return { ...funnel, items };
  });
  res.json(funnelsWithItems);
});

app.post('/api/funnels', (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const info = db.prepare('INSERT INTO funnels (title, description) VALUES (?, ?)').run(title, description || '');
  const row = db.prepare('SELECT * FROM funnels WHERE id = ?').get(info.lastInsertRowid);
  res.json({ ...row, items: [] });
});

app.delete('/api/funnels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare('DELETE FROM funnels WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/funnels/:id/items', (req, res) => {
  const funnelId = parseInt(req.params.id);
  const { type, item_id, delay_minutes, delay_seconds } = req.body;

  // Calculate next position
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 as p FROM funnel_items WHERE funnel_id = ?').get(funnelId).p;

  const info = db.prepare('INSERT INTO funnel_items (funnel_id, type, item_id, delay_minutes, delay_seconds, position) VALUES (?, ?, ?, ?, ?, ?)')
    .run(funnelId, type, item_id, delay_minutes || 0, delay_seconds || 0, pos);

  const row = db.prepare('SELECT * FROM funnel_items WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

// simple health
app.get('/api/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log('ZapFlow backend running on port', port));
