import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '20mb' }));

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const GOOGLE_KEY    = process.env.GOOGLE_API_KEY    || '';
const APP_USER      = process.env.APP_USER          || 'admin';
const APP_PASS      = process.env.APP_PASS          || 'changeme';

// ── Basic認証ミドルウェア ───────────────────────────────
function basicAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const base64     = authHeader.replace(/^Basic\s+/, '');
  const decoded    = Buffer.from(base64, 'base64').toString('utf-8');
  const [user, pass] = decoded.split(':');

  if (user === APP_USER && pass === APP_PASS) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Mail Campaign System"');
  res.status(401).send('認証が必要です');
}

// 全ルートにBasic認証を適用
app.use(basicAuth);

// 静的ファイル（認証後に提供）
app.use(express.static(join(__dirname, 'public')));

// ── Google Sheets プロキシ ──────────────────────────────
app.get('/api/sheet', async (req, res) => {
  const sheetId   = req.query.id    || '';
  const sheetName = req.query.sheet || 'Sheet1';

  if (!sheetId) {
    return res.status(400).json({ error: { message: 'スプレッドシートIDを指定してください' } });
  }

  const range = encodeURIComponent(`${sheetName}!A:J`);
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${GOOGLE_KEY}`;

  try {
    const r    = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

// ── Anthropic APIプロキシ ───────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

// ── ヘルスチェック ─────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ ok: true }));

// ── SPAフォールバック ──────────────────────────────────
app.get('*', (_, res) => res.sendFile(join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
createServer(app).listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
