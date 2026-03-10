import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { networkInterfaces } from 'os';

const PORT = 3000;
const ROOT = new URL('.', import.meta.url).pathname;

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

// Room codes are 4 uppercase alphanumeric chars
const ROOM_CODE_RE = /^\/[A-Z0-9]{4}$/;

const server = createServer(async (req, res) => {
  let url = req.url.split('?')[0];

  // Route /<ROOM_CODE> → serve controller/index.html
  if (ROOM_CODE_RE.test(url)) {
    const data = await readFile(join(ROOT, 'controller', 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(data);
    return;
  }

  if (url.endsWith('/')) url += 'index.html';

  const filePath = join(ROOT, url);
  const ext = extname(filePath);

  try {
    let data = await readFile(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';

    // Inject LAN IP into display page
    if (url === '/index.html') {
      const ip = getLanIP();
      const html = data.toString().replace('</head>',
        `<script>window.__LAN_IP__="${ip}";window.__PORT__=${PORT};</script></head>`);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(html);
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  const ip = getLanIP();
  console.log(`\n  Hotlap Party`);
  console.log(`  Display:    http://localhost:${PORT}`);
  console.log(`  Controller: http://${ip}:${PORT}/<ROOM_CODE>`);
  console.log();
});

function getLanIP() {
  const nets = networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const cfg of iface) {
      if (cfg.family === 'IPv4' && !cfg.internal) return cfg.address;
    }
  }
  return 'localhost';
}
