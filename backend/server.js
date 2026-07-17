const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

const db = new sqlite3.Database(path.join(__dirname, '..', 'database.db'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    level TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#6C63FF',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'عام',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(post_id, user_id)
  )`);
});

function getUserFromCookies(req) {
  const userId = req.cookies.user_id;
  if (!userId) return null;
  return new Promise((resolve) => {
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
      resolve(row || null);
    });
  });
}

app.post('/api/register', (req, res) => {
  const { name, country, level } = req.body;
  if (!name || !country || !level) {
    return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  }
  const id = uuidv4();
  const colors = ['#6C63FF', '#FF6584', '#43E97B', '#FF9A9E', '#667eea', '#f093fb', '#4facfe', '#fa709a'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  db.run('INSERT INTO users (id, name, country, level, avatar_color) VALUES (?, ?, ?, ?, ?)',
    [id, name, country, level, color], (err) => {
      if (err) return res.status(500).json({ error: 'خطأ في التسجيل' });
      res.cookie('user_id', id, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
      res.json({ success: true, user: { id, name, country, level, avatar_color: color } });
    });
});

app.get('/api/user', async (req, res) => {
  const user = await getUserFromCookies(req);
  if (!user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user });
});

app.get('/api/logout', (req, res) => {
  res.clearCookie('user_id');
  res.json({ success: true });
});

app.get('/api/posts', (req, res) => {
  db.all(`
    SELECT p.*, u.name as user_name, u.country as user_country, u.avatar_color as user_color,
      (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments_count,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as likes_count
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const userId = req.cookies.user_id;
    if (!userId) return res.json(rows);
    const ids = rows.map(r => r.id);
    if (ids.length === 0) return res.json(rows);
    db.all(`SELECT post_id FROM likes WHERE post_id IN (${ids.map(() => '?').join(',')}) AND user_id = ?`,
      [...ids, userId], (err2, likes) => {
        if (err2) return res.json(rows);
        const likedSet = new Set(likes.map(l => l.post_id));
        rows.forEach(r => r.liked = likedSet.has(r.id));
        res.json(rows);
      });
  });
});

app.post('/api/posts', async (req, res) => {
  const user = await getUserFromCookies(req);
  if (!user) return res.status(401).json({ error: 'الرجاء تسجيل الدخول' });
  const { content, category } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'محتوى المنشور مطلوب' });
  const id = uuidv4();
  db.run('INSERT INTO posts (id, user_id, content, category) VALUES (?, ?, ?, ?)',
    [id, user.id, content, category || 'عام'], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, post: { id, user_id: user.id, content, category: category || 'عام',
        user_name: user.name, user_country: user.country, user_color: user.avatar_color,
        comments_count: 0, likes_count: 0, liked: false, created_at: new Date().toISOString() } });
    });
});

app.post('/api/posts/:id/like', async (req, res) => {
  const user = await getUserFromCookies(req);
  if (!user) return res.status(401).json({ error: 'الرجاء تسجيل الدخول' });
  const { id } = req.params;
  db.get('SELECT * FROM likes WHERE post_id = ? AND user_id = ?', [id, user.id], (err, existing) => {
    if (existing) {
      db.run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [id, user.id], (err2) => {
        db.get('SELECT COUNT(*) as count FROM likes WHERE post_id = ?', [id], (err3, row) => {
          res.json({ liked: false, likes_count: row.count });
        });
      });
    } else {
      const likeId = uuidv4();
      db.run('INSERT INTO likes (id, post_id, user_id) VALUES (?, ?, ?)', [likeId, id, user.id], (err2) => {
        db.get('SELECT COUNT(*) as count FROM likes WHERE post_id = ?', [id], (err3, row) => {
          res.json({ liked: true, likes_count: row.count });
        });
      });
    }
  });
});

app.get('/api/posts/:id/comments', (req, res) => {
  db.all(`
    SELECT c.*, u.name as user_name, u.avatar_color as user_color
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `, [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/posts/:id/comments', async (req, res) => {
  const user = await getUserFromCookies(req);
  if (!user) return res.status(401).json({ error: 'الرجاء تسجيل الدخول' });
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'محتوى التعليق مطلوب' });
  const id = uuidv4();
  db.run('INSERT INTO comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)',
    [id, req.params.id, user.id, content], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, comment: { id, post_id: req.params.id, user_id: user.id,
        content, user_name: user.name, user_color: user.avatar_color,
        created_at: new Date().toISOString() } });
    });
});

app.get('/api/users/online', (req, res) => {
  // Return a few recently active users
  db.all('SELECT name, country, level, avatar_color FROM users ORDER BY created_at DESC LIMIT 20', [], (err, rows) => {
    if (err) return res.json([]);
    res.json(rows);
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 زملاء المنح يعمل على http://localhost:${PORT}`);
});
