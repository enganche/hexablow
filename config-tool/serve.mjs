// Config tool server:  node config-tool/serve.mjs [port]   ->  http://localhost:5190/
// Serves the tool and lets it read/write the whitelisted config JSON files in the project (Save button).
// Without it you can still double-click index.html and use "Open project folder" / "Open files" instead.
import http from 'node:http';
import vm from 'node:vm';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const port = +process.argv[2] || 5190;

// the file list lives in js/meta.js (single source of truth)
const sandbox = {};
sandbox.window = sandbox;
vm.runInNewContext(readFileSync(join(here, 'js', 'meta.js'), 'utf8'), sandbox);
const FILES = Object.fromEntries(sandbox.CONFIG_FILES.map((f) => [f.name, join(root, f.path)]));

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((ok, fail) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 5e6) req.destroy(); }); req.on('end', () => ok(s)); req.on('error', fail); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/files') {
      const out = [];
      for (const f of sandbox.CONFIG_FILES) {
        let text = null;
        try { text = await readFile(FILES[f.name], 'utf8'); } catch { /* missing */ }
        out.push({ ...f, text });
      }
      return json(res, 200, { files: out });
    }
    if (url.pathname === '/api/save' && req.method === 'POST') {
      const { name, text } = JSON.parse(await readBody(req));
      if (!FILES[name]) return json(res, 400, { error: 'unknown file' });
      JSON.parse(text); // refuse invalid JSON
      await writeFile(FILES[name], text);
      return json(res, 200, { ok: true });
    }
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = normalize(join(here, p));
    if (!file.startsWith(here)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch (e) {
    if (e.code === 'ENOENT') res.writeHead(404).end('not found');
    else json(res, 500, { error: String(e.message || e) });
  }
}).listen(port, () => console.log(`Config tool: http://localhost:${port}/`));
