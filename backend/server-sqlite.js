const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));
const upload = multer({ dest: uploadsDir });

const DB_FILE = path.join(__dirname, 'zapflow.sqlite');
const db = new sqlite3.Database(DB_FILE);

function initDb() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT,
      is_favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS kanban_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      position INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      product TEXT,
      value REAL DEFAULT 0,
      last_message TEXT,
      column_id INTEGER,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS midias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      caption TEXT,
      is_favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS gatilhos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // seed default columns if empty
    db.get('SELECT COUNT(*) as c FROM kanban_columns', (err, row) => {
      if (!err && row && row.c === 0) {
        const stmt = db.prepare('INSERT INTO kanban_columns (title, position) VALUES (?, ?)');
        stmt.run('Novos Leads', 1);
        stmt.run('Em Negociação', 2);
        stmt.run('Fechado', 3);
        stmt.finalize();
      }
    });
  });
}

initDb();

// endpoints similar aos anteriores
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/messages', (req, res) => {
  db.all('SELECT * FROM messages ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.post('/api/messages', (req, res) => {
  const { title, content } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  db.run('INSERT INTO messages (title, content) VALUES (?, ?)', [title, content || ''], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM messages WHERE id = ?', [this.lastID], (err, row) => res.json(row));
  });
});
app.delete('/api/messages/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.run('DELETE FROM messages WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// Update a message (PATCH)
app.patch('/api/messages/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { title, content, is_favorite } = req.body;
  // coerce is_favorite to integer if provided
  const fav = (typeof is_favorite !== 'undefined') ? (is_favorite ? 1 : 0) : undefined;
  db.run('UPDATE messages SET title = COALESCE(?, title), content = COALESCE(?, content)' + (typeof fav !== 'undefined' ? ', is_favorite = ?' : '') + ' WHERE id = ?', (typeof fav !== 'undefined') ? [title, content, fav, id] : [title, content, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM messages WHERE id = ?', [id], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json(row);
    });
  });
});

app.get('/api/kanban', (req, res) => {
  db.all('SELECT * FROM kanban_columns ORDER BY position ASC', [], (err, cols) => {
    if (err) return res.status(500).json({ error: err.message });
    db.all('SELECT * FROM leads ORDER BY position ASC', [], (err2, leads) => {
      if (err2) return res.status(500).json({ error: err2.message });
      const data = cols.map(c => ({ id: c.id, title: c.title, items: leads.filter(l => l.column_id === c.id) }));
      res.json(data);
    });
  });
});

app.post('/api/kanban/column', (req, res) => {
  const { title } = req.body;
  db.get('SELECT COALESCE(MAX(position),0) as p FROM kanban_columns', (err, row) => {
    const pos = (row && row.p ? row.p : 0) + 1;
    db.run('INSERT INTO kanban_columns (title, position) VALUES (?, ?)', [title, pos], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM kanban_columns WHERE id = ?', [this.lastID], (err2, r) => res.json(r));
    });
  });
});

app.post('/api/leads', (req, res) => {
  const { name, phone, email, product, value } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
  db.get('SELECT id FROM kanban_columns ORDER BY position LIMIT 1', (err, col) => {
    const column_id = col ? col.id : null;
    db.get('SELECT COALESCE(MAX(position),0) as p FROM leads WHERE column_id IS ?', [column_id], (err2, row) => {
      const pos = (row && row.p ? row.p : 0) + 1;
      db.run('INSERT INTO leads (name, phone, email, product, value, column_id, position) VALUES (?, ?, ?, ?, ?, ?, ?)', [name, phone, email||'', product||'', value||0, column_id, pos], function(err3) {
        if (err3) return res.status(500).json({ error: err3.message });
        db.get('SELECT * FROM leads WHERE id = ?', [this.lastID], (err4, r) => res.json(r));
      });
    });
  });
});

// Update lead (move between columns or change position)
app.patch('/api/leads/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { columnId, position } = req.body;
  if (typeof columnId === 'undefined' && typeof position === 'undefined') return res.status(400).json({ error: 'nothing to update' });

  db.serialize(() => {
    if (typeof columnId !== 'undefined') {
      db.run('UPDATE leads SET column_id = ? WHERE id = ?', [columnId, id]);
    }
    if (typeof position !== 'undefined') {
      db.run('UPDATE leads SET position = ? WHERE id = ?', [position, id]);
    }
    db.get('SELECT * FROM leads WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row);
    });
  });
});

// Reorder leads inside a column: accepts { orderedIds: [id1, id2, ...] }
app.post('/api/kanban/column/:id/reorder', (req, res) => {
  const columnId = parseInt(req.params.id);
  const orderedIds = req.body.orderedIds;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds required' });

  // Use an explicit transaction and set 1-based contiguous positions to avoid collisions
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare('UPDATE leads SET position = ?, column_id = ? WHERE id = ?');
    let hadError = false;
    orderedIds.forEach((leadId, index) => {
      // positions are 1-based
      stmt.run(index + 1, columnId, leadId, (err) => {
        if (err) hadError = true;
      });
    });
    stmt.finalize((err) => {
      if (err || hadError) {
        db.run('ROLLBACK');
        return res.status(500).json({ error: (err && err.message) || 'error updating positions' });
      }
      db.run('COMMIT', (cErr) => {
        if (cErr) return res.status(500).json({ error: cErr.message });
        // return updated leads for this column
        db.all('SELECT * FROM leads WHERE column_id = ? ORDER BY position ASC', [columnId], (err2, rows) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json(rows);
        });
      });
    });
  });
});

app.post('/api/midias', upload.single('file'), (req, res) => {
  const file = req.file;
  const title = req.body.title || (file && file.originalname) || 'untitled';
  const caption = req.body.caption || '';
  if (!file) return res.status(400).json({ error: 'file required' });
  const url = `/uploads/${path.basename(file.path)}`;
  db.run('INSERT INTO midias (title, url, mime_type, size, caption) VALUES (?, ?, ?, ?, ?)', [title, url, file.mimetype, file.size, caption], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM midias WHERE id = ?', [this.lastID], (err2, r) => res.json(r));
  });
});
app.get('/api/midias', (req, res) => {
  db.all('SELECT * FROM midias ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Gatilhos endpoints
app.get('/api/gatilhos', (req, res) => {
  db.all('SELECT * FROM gatilhos ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/gatilhos', (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'nome required' });
  db.run('INSERT INTO gatilhos (nome) VALUES (?)', [nome], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM gatilhos WHERE id = ?', [this.lastID], (err2, row) => res.json(row));
  });
});

app.patch('/api/gatilhos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'nome required' });
  db.run('UPDATE gatilhos SET nome = ? WHERE id = ?', [nome, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM gatilhos WHERE id = ?', [id], (err2, row) => res.json(row));
  });
});

app.delete('/api/gatilhos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.run('DELETE FROM gatilhos WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('ZapFlow sqlite backend running on port', port));
