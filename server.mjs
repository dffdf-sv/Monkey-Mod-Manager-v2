import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const API_ONLY = process.argv.includes('--api-only');
const PORT = Number(process.env.PORT || (API_ONLY ? 3001 : 3000));
const MOD_REPO = process.env.MOD_REPO || 'dffdf-sv/GORILA-TAG-MODBASE';
const MOD_FILE = 'modinfo.Json';
const MOD_API = 'https://api.github.com/repos/' + MOD_REPO + '/contents/' + MOD_FILE;
const RAW_MODS = 'https://raw.githubusercontent.com/' + MOD_REPO + '/main/' + MOD_FILE;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const rateMap = new Map();

function reply(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(payload));
}
function slug(value) { return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function httpsUrl(value, required = false) {
  if (!value && !required) return '';
  try { const parsed = new URL(value); return parsed.protocol === 'https:' ? parsed.toString() : null; } catch { return null; }
}
function normalise(entry) {
  const name = String(entry.name || '').trim();
  return {
    id: slug(entry.id || name), name, author: String(entry.author || 'Community').trim(),
    category: String(entry.category || 'Utility').trim(), description: String(entry.description || '').trim(),
    version: String(entry.version || '1.0.0').trim(), downloadUrl: String(entry.download_url || entry.downloadUrl || '').trim(),
    imageUrl: String(entry.image_url || entry.imageUrl || '').trim(), sourceUrl: String(entry.source_url || entry.sourceUrl || '').trim(),
    dependencies: Array.isArray(entry.dependencies) ? entry.dependencies.map((value) => String(value)) : [], featured: Boolean(entry.featured)
  };
}
function safeEqual(a, b) {
  const left = Buffer.from(String(a || '')); const right = Buffer.from(String(b || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}
function checkRate(req) {
  const key = req.socket.remoteAddress || 'unknown'; const now = Date.now();
  const recent = (rateMap.get(key) || []).filter((at) => now - at < 60_000); recent.push(now); rateMap.set(key, recent);
  return recent.length <= 25;
}
async function readBody(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 1_000_000) throw new Error('Request body is too large.'); }
  try { return JSON.parse(data || '{}'); } catch { throw new Error('Request body must be valid JSON.'); }
}
async function readGitHubFile() {
  const response = await fetch(RAW_MODS, { headers: { 'user-agent': 'Monkey-Mod-Hub/2.1' }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Could not read the mod base on GitHub (' + response.status + ').');
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('The mod base JSON must be an array.');
  return data;
}
async function getMods() {
  try { return (await readGitHubFile()).map(normalise).filter((mod) => mod.id && mod.name && httpsUrl(mod.downloadUrl, true)); }
  catch {
    try { return JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'seed-mods.json'), 'utf8')).map(normalise); }
    catch { return []; }
  }
}
async function readGithubContents() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Render is missing GITHUB_TOKEN. Add a fine-grained token with Contents: Read and write access to GORILA-TAG-MODBASE.');
  const response = await fetch(MOD_API, { headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'Monkey-Mod-Hub/2.1' }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('GitHub could not read modinfo.Json (' + response.status + '). Check GITHUB_TOKEN access.');
  const result = await response.json();
  return { sha: result.sha, list: JSON.parse(Buffer.from(result.content, 'base64').toString('utf8')) };
}
async function saveGithubList(list, sha, message) {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(MOD_API, {
    method: 'PUT',
    headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28', 'user-agent': 'Monkey-Mod-Hub/2.1' },
    body: JSON.stringify({ message, content: Buffer.from(JSON.stringify(list, null, 2) + '\n').toString('base64'), sha, branch: 'main' }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error('GitHub save failed (' + response.status + '): ' + (detail.message || 'Check repository write permission.'));
  }
}
function adminAllowed(req) {
  if (!process.env.ADMIN_PASSWORD) return { ok: false, status: 503, error: 'Set ADMIN_PASSWORD in the Render environment first.' };
  if (!safeEqual(req.headers['x-admin-password'], process.env.ADMIN_PASSWORD)) return { ok: false, status: 401, error: 'Admin password was not accepted.' };
  return { ok: true };
}
function contentType(file) { return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  try {
    if (url.pathname === '/healthz') return reply(res, 200, { ok: true, service: 'monkey-mod-hub' });
    if (url.pathname === '/api/mods' && req.method === 'GET') return reply(res, 200, { mods: await getMods() });
    if (url.pathname === '/api/admin/check' && req.method === 'POST') {
      if (!checkRate(req)) return reply(res, 429, { error: 'Too many admin attempts. Wait one minute.' });
      const auth = adminAllowed(req);
      return auth.ok ? reply(res, 200, { ok: true }) : reply(res, auth.status, { error: auth.error });
    }
    if ((url.pathname === '/api/mods' && req.method === 'POST') || (url.pathname.startsWith('/api/mods/') && req.method === 'DELETE')) {
      if (!checkRate(req)) return reply(res, 429, { error: 'Too many admin requests. Wait one minute.' });
      const auth = adminAllowed(req);
      if (!auth.ok) return reply(res, auth.status, { error: auth.error });
      let current;
      try { current = await readGithubContents(); }
      catch (error) { return reply(res, 503, { error: error instanceof Error ? error.message : 'Could not access the mod base.' }); }
      if (!Array.isArray(current.list)) return reply(res, 500, { error: 'modinfo.Json must contain a JSON array.' });
      if (url.pathname === '/api/mods' && req.method === 'POST') {
        const body = await readBody(req);
        const name = String(body.name || '').trim(); const author = String(body.author || '').trim();
        const version = String(body.version || '').trim(); const description = String(body.description || '').trim();
        const category = String(body.category || 'Utility').trim();
        const downloadUrl = httpsUrl(body.downloadUrl, true); const imageUrl = httpsUrl(body.imageUrl || '', false); const sourceUrl = httpsUrl(body.sourceUrl || '', false);
        if (!name || !author || !version || !description || !downloadUrl || imageUrl === null || sourceUrl === null) return reply(res, 400, { error: 'Name, author, version, description and HTTPS download URL are required. Image/source URLs must also be HTTPS.' });
        if (name.length > 90 || description.length > 1400 || author.length > 90 || version.length > 40) return reply(res, 400, { error: 'One or more fields are too long.' });
        const id = slug(name);
        if (!id || current.list.some((entry) => slug(entry.name) === id)) return reply(res, 409, { error: 'A mod with that name already exists.' });
        const deps = Array.isArray(body.dependencies) ? body.dependencies : [];
        const entry = { name, version, author, description, category, download_url: downloadUrl, image_url: imageUrl || '', source_url: sourceUrl || '', dependencies: deps.map((item) => String(item).trim()).filter(Boolean).slice(0, 20), featured: false };
        current.list.push(entry);
        try { await saveGithubList(current.list, current.sha, 'Add ' + name + ' to mod hub'); }
        catch (error) { return reply(res, 502, { error: error instanceof Error ? error.message : 'Could not save mod to GitHub.' }); }
        return reply(res, 201, { ok: true, mod: normalise(entry) });
      }
      const id = decodeURIComponent(url.pathname.slice('/api/mods/'.length));
      const next = current.list.filter((entry) => slug(entry.name) !== id);
      if (next.length === current.list.length) return reply(res, 404, { error: 'Mod was not found.' });
      try { await saveGithubList(next, current.sha, 'Remove ' + id + ' from mod hub'); }
      catch (error) { return reply(res, 502, { error: error instanceof Error ? error.message : 'Could not remove mod from GitHub.' }); }
      return reply(res, 200, { ok: true });
    }
    if (url.pathname.startsWith('/api/')) return reply(res, 404, { error: 'API route not found.' });
    if (API_ONLY) return reply(res, 404, { error: 'API-only development server.' });
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const distRoot = path.resolve(ROOT, 'dist');
    const candidate = path.resolve(distRoot, '.' + pathname);
    if (!candidate.startsWith(distRoot + path.sep) && candidate !== path.join(distRoot, 'index.html')) return reply(res, 403, { error: 'Not allowed.' });
    let body;
    try { body = await fs.readFile(candidate); } catch { body = await fs.readFile(path.join(distRoot, 'index.html')); pathname = '/index.html'; }
    res.writeHead(200, { 'content-type': contentType(pathname), 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' });
    return res.end(body);
  } catch (error) {
    if (!res.headersSent) reply(res, 500, { error: error instanceof Error ? error.message : 'Unexpected server error.' });
    else res.destroy();
  }
});
server.listen(PORT, '0.0.0.0', () => console.log('Monkey Mod Hub listening on port ' + PORT + (API_ONLY ? ' (API only)' : '')));
