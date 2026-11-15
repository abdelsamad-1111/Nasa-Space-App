// Production server: serves the built Astro Health AI app (dist/) and its assistant API.
// Run `npm run build` first, then `npm start`. The Groq key comes from GROQ_API_KEY or server/groq-key.mjs.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatMiddleware } from './chat.mjs';
import { GROQ_API_KEY_IN_FILE } from './groq-key.mjs';

const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
};

const api = chatMiddleware();

async function serveStatic(req, res) {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(DIST, path));
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(DIST, 'index.html'); // single-page app fallback
  }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end('Not found — run `npm run build` first.');
  }
}

createServer((req, res) => {
  api(req, res, () => serveStatic(req, res));
}).listen(PORT, () => {
  console.log(`Astro Health AI on http://localhost:${PORT} · assistant key ${(process.env.GROQ_API_KEY || GROQ_API_KEY_IN_FILE) ? 'configured' : 'missing (built-in guidance only)'}`);
});
