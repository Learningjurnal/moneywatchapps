import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const USER_STORES_DIR = path.join(__dirname, 'data', 'user-stores');

if (!fs.existsSync(USER_STORES_DIR)) {
  try { fs.mkdirSync(USER_STORES_DIR, { recursive: true }); } catch (e) {}
}

function getSafeFileKey(uidOrEmail) {
  if (!uidOrEmail) return 'global_user';
  return String(uidOrEmail).toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

export function isSafeProxyUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname === '169.254.169.254' ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local')
    ) {
      return false;
    }
    const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipMatch) {
      const b0 = parseInt(ipMatch[1], 10);
      const b1 = parseInt(ipMatch[2], 10);
      if (b0 === 10 || b0 === 127 || (b0 === 169 && b1 === 254) || (b0 === 192 && b1 === 168) || (b0 === 172 && b1 >= 16 && b1 <= 31) || b0 === 0) {
        return false;
      }
    }
    return true;
  } catch (e) {
    return false;
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'MoneyWatch Native Engine', time: new Date().toISOString() }));
    return;
  }

  if (pathname === '/api/user-data/save' && req.method === 'POST') {
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', () => {
      try {
        if (bodyStr.length > 10 * 1024 * 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Payload exceeds maximum limit (10MB)' }));
          return;
        }
        const body = JSON.parse(bodyStr || '{}');
        const uid = body.uid || body.email || 'global_user';
        const safeKey = getSafeFileKey(uid);
        const filePath = path.join(USER_STORES_DIR, 'user_' + safeKey + '.json');
        const backupPath = path.join(USER_STORES_DIR, 'latest_backup.json');

        const record = {
          uid,
          email: body.email || '',
          savedAt: body.savedAt || new Date().toISOString(),
          serverReceivedAt: new Date().toISOString(),
          data: body.data || body
        };

        const jsonOut = JSON.stringify(record, null, 2);
        fs.writeFileSync(filePath, jsonOut, 'utf8');
        fs.writeFileSync(backupPath, jsonOut, 'utf8');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Data saved successfully', savedAt: record.savedAt }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (pathname === '/api/user-data/load' && req.method === 'GET') {
    try {
      const uid = parsedUrl.searchParams.get('uid') || parsedUrl.searchParams.get('email') || 'global_user';
      const safeKey = getSafeFileKey(uid);
      const filePath = path.join(USER_STORES_DIR, 'user_' + safeKey + '.json');
      const backupPath = path.join(USER_STORES_DIR, 'latest_backup.json');

      let targetPath = fs.existsSync(filePath) ? filePath : (fs.existsSync(backupPath) ? backupPath : null);

      if (targetPath) {
        const content = fs.readFileSync(targetPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(content);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'No user data record found' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (pathname === '/api/proxy' && req.method === 'GET') {
    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl || !isSafeProxyUrl(targetUrl)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Invalid URL or violates SSRF policy' }));
      return;
    }
    try {
      const resp = await fetch(targetUrl);
      const text = await resp.text();
      res.writeHead(resp.status, { 'Content-Type': resp.headers.get('content-type') || 'application/json' });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy request failed', message: e.message }));
    }
    return;
  }

  let relativePath = pathname === '/' || pathname === '/app' ? 'index.html' : pathname.replace(/^\//, '');
  let filePath = path.join(__dirname, relativePath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
    return;
  }

  const fallbackHtml = path.join(__dirname, 'index.html');
  if (fs.existsSync(fallbackHtml)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(fallbackHtml));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('File Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Money Watch Pro Native Server running on http://localhost:' + PORT);
});
