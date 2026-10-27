import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const API_ONLY = process.argv.includes('--api-only');
const PORT = Number(process.env.PORT || (API_ONLY ? 3001 : 3000));
const MOD_REPO = process.env.MOD_REPO || 'dffdf-sv/GORILA-TAG-MODBASE';
const MOD_FILE = 'modinfo.Json';
const MOD_API = 'https://api.github.com/repos/' + MOD_REPO + '/contents/' + MOD_FILE;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const rateMap = new Map();

function reply(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(payload));
}
function applyCors(req, res) {
  const origin = String(req.headers.origin || '');
  if (!origin) return;
  const allowed = origin === 'null' || origin === 'https://modhub.duckdns.org' || origin === process.env.DESKTOP_ALLOWED_ORIGIN;
  if (!allowed) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '600');
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
    imageUrl: String(entry.image_url || entry.imageUrl || '').trim(), sourceUrl: String(entry.source_url || entry.sourceUrl || '').trim(), websiteUrl: String(entry.website_url || entry.websiteUrl || '').trim(), embedUrl: String(entry.embed_url || entry.embedUrl || '').trim(), requirements: String(entry.requirements || '').trim(), supportedOS: Array.isArray(entry.supported_os || entry.supportedOS) ? (entry.supported_os || entry.supportedOS).map(String) : [], readme: String(entry.readme || '').trim(), changelog: String(entry.changelog || '').trim(), additionalLinks: Array.isArray(entry.additional_links || entry.additionalLinks) ? (entry.additional_links || entry.additionalLinks).map((item) => ({label:String(item.label||''),url:String(item.url||'')})).filter((item) => item.label && httpsUrl(item.url, true)).slice(0,20) : [],
    dependencies: Array.isArray(entry.dependencies) ? entry.dependencies.map((value) => String(value)) : [], featured: Boolean(entry.featured), galleryUrls: Array.isArray(entry.gallery_urls || entry.galleryUrls) ? (entry.gallery_urls || entry.galleryUrls).map(String) : [], videoUrl: String(entry.video_url || entry.videoUrl || ''), configSettings: Array.isArray(entry.config_settings || entry.configSettings) ? (entry.config_settings || entry.configSettings) : [], ownerId: String(entry.owner_id || entry.ownerId || '')
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
async function readBody(req, limit = 1_000_000) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > limit) throw new Error('Request body is too large.'); }
  try { return JSON.parse(data || '{}'); } catch { throw new Error('Request body must be valid JSON.'); }
}
async function getMods() {
  // Always read the live catalogue from the mod-base repository's GitHub Contents API.
  // Do not silently substitute bundled seed data: the repository is the source of truth.
  const { list } = await readGithubContents();
  if (!Array.isArray(list)) throw new Error('GORILA-TAG-MODBASE/modinfo.Json must contain a JSON array.');
  return list.map(normalise).filter((mod) => mod.id && mod.name && httpsUrl(mod.downloadUrl, true));
}
const FEEDBACK_PATH = 'mod-feedback.json';
async function readFeedbackFile() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Community feedback storage needs GITHUB_TOKEN.');
  const response = await fetch('https://api.github.com/repos/' + MOD_REPO + '/contents/' + FEEDBACK_PATH, {headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':'ModHub/2.1'},signal:AbortSignal.timeout(10000)});
  if (response.status === 404) return {sha:null,data:{}};
  const result = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error('Could not read community feedback ('+response.status+').');
  try { return {sha:result.sha||null,data:JSON.parse(Buffer.from(result.content,'base64').toString('utf8'))}; }
  catch { throw new Error('Community feedback file is invalid JSON.'); }
}
async function saveFeedbackFile(data, sha, message) {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch('https://api.github.com/repos/' + MOD_REPO + '/contents/' + FEEDBACK_PATH, {method:'PUT',headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2022-11-28','user-agent':'ModHub/2.1'},body:JSON.stringify({message,content:Buffer.from(JSON.stringify(data,null,2)+'\n').toString('base64'),...(sha?{sha}:{}),branch:'main'}),signal:AbortSignal.timeout(15000)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error('Could not save community feedback ('+response.status+'): '+(result.message||'check GITHUB_TOKEN write access.'));
}
async function readGithubContents() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Render is missing GITHUB_TOKEN. Add a fine-grained token with Contents: Read and write access to GORILA-TAG-MODBASE.');
  const response = await fetch(MOD_API, { headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ModHub/2.1' }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('GitHub could not read modinfo.Json (' + response.status + '). Check GITHUB_TOKEN access.');
  const result = await response.json();
  return { sha: result.sha, list: JSON.parse(Buffer.from(result.content, 'base64').toString('utf8')) };
}
async function saveGithubList(list, sha, message) {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(MOD_API, {
    method: 'PUT',
    headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ModHub/2.1' },
    body: JSON.stringify({ message, content: Buffer.from(JSON.stringify(list, null, 2) + '\n').toString('base64'), sha, branch: 'main' }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error('GitHub save failed (' + response.status + '): ' + (detail.message || 'Check repository write permission.'));
  }
}
let releaseRefreshBusy = false;
async function refreshGithubReleaseLinks() {
  if (releaseRefreshBusy || !process.env.GITHUB_TOKEN) return { checked: 0, updated: 0 };
  releaseRefreshBusy = true;
  let checked = 0, updated = 0;
  try {
    const current = await readGithubContents();
    if (!Array.isArray(current.list)) return { checked, updated };
    const next = current.list.map((entry) => ({ ...entry }));
    const apiHeaders = { authorization: 'Bearer ' + process.env.GITHUB_TOKEN, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ModHub/2.1' };
    for (const entry of next) {
      const source = String(entry.source_url || entry.sourceUrl || '');
      let parsed;
      try { parsed = new URL(source); } catch { continue; }
      if (parsed.protocol !== 'https:' || !['github.com','www.github.com'].includes(parsed.hostname.toLowerCase())) continue;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length < 2) continue;
      const owner = parts[0], name = parts[1].replace(/\.git$/i, '');
      if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(name)) continue;
      checked += 1;
      try {
        const response = await fetch('https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(name) + '/releases/latest', { headers: apiHeaders, signal: AbortSignal.timeout(10000) });
        if (!response.ok) continue;
        const release = await response.json().catch(() => ({}));
        const assets = Array.isArray(release.assets) ? release.assets : [];
        const candidates = assets.filter((asset) => /\.(dll|zip)$/i.test(String(asset.name || '')) && !/(^|[-_. ])(symbols?|debug|source|tests?)([-_. ]|$)/i.test(String(asset.name || '')));
        if (!release.tag_name) continue;
        const oldUrl = String(entry.download_url || entry.downloadUrl || '');
        let oldAssetName = '';
        try { oldAssetName = path.basename(new URL(oldUrl).pathname); } catch {}
        const asset = candidates.find((item) => String(item.name).toLowerCase() === oldAssetName.toLowerCase())
          || candidates.find((item) => /\.zip$/i.test(String(item.name || '')))
          || candidates.find((item) => /\.dll$/i.test(String(item.name || '')));
        const tag = String(release.tag_name);
        const encodedTag = tag.split('/').map(encodeURIComponent).join('/');
        // When the author has not uploaded a compiled asset, use the ZIP archive for
        // that exact release tag. The desktop installer will look for DLLs in it.
        const sourceArchive = 'https://github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(name) + '/archive/refs/tags/' + encodedTag + '.zip';
        const nextUrl = asset && httpsUrl(asset.browser_download_url, true) ? String(asset.browser_download_url) : sourceArchive;
        const nextVersion = tag.replace(/^v(?=\d)/i, '').slice(0, 40);
        if (oldUrl === nextUrl && String(entry.version || '') === nextVersion) continue;
        entry.download_url = nextUrl;
        entry.version = nextVersion;
        if (typeof release.body === 'string' && release.body.trim()) entry.changelog = release.body.slice(0, 6000);
        updated += 1;
      } catch { /* A deleted or rate-limited repository must not block other mods. */ }
    }
    if (updated > 0) await saveGithubList(next, current.sha, 'Refresh GitHub release links for ' + updated + ' ModHub mod(s)');
    console.log('ModHub weekly GitHub release check: ' + checked + ' repositories checked, ' + updated + ' link(s) updated.');
    return { checked, updated };
  } catch (error) {
    console.error('ModHub GitHub release check failed:', error instanceof Error ? error.message : error);
    return { checked, updated };
  } finally {
    releaseRefreshBusy = false;
  }
}

function adminAllowed(req) {
  if (!process.env.ADMIN_PASSWORD) return { ok: false, status: 503, error: 'Set ADMIN_PASSWORD in the Render environment first.' };
  if (!safeEqual(req.headers['x-admin-password'], process.env.ADMIN_PASSWORD)) return { ok: false, status: 401, error: 'Admin password was not accepted.' };
  return { ok: true };
}

function parseCookies(req) { return Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const i=x.indexOf('='); return i<0?[x,'']:[x.slice(0,i),decodeURIComponent(x.slice(i+1))]; })); }
function sessionFor(req) {
  const auth=String(req.headers.authorization||''); const bearer=auth.startsWith('Bearer ')?auth.slice(7):''; const token=bearer||parseCookies(req).mmm_session||''; const parts=token.split('.'); if(parts.length!==2)return null;
  const expected=crypto.createHmac('sha256',process.env.SESSION_SECRET||'missing-session-secret').update(parts[0]).digest();
  const actual=Buffer.from(parts[1],'base64url'); if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;
  try { const user=JSON.parse(Buffer.from(parts[0],'base64url').toString()); return user.exp>Date.now()?user:null; } catch { return null; }
}
function signedSession(user) { const body=Buffer.from(JSON.stringify(user)).toString('base64url'); return body+'.'+crypto.createHmac('sha256',process.env.SESSION_SECRET||'missing-session-secret').update(body).digest('base64url'); }
function cookie(res,name,value,age) { const current=res.getHeader('Set-Cookie'); const items=Array.isArray(current)?current:current?[String(current)]:[]; items.push(name+'='+encodeURIComponent(value)+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age='+age); res.setHeader('Set-Cookie',items); }
async function githubContent(pathname, bytes, message) {
  const token=process.env.GITHUB_TOKEN; if(!token)throw new Error('GITHUB_TOKEN is not configured.');
  const response=await fetch('https://api.github.com/repos/'+MOD_REPO+'/contents/'+pathname,{method:'PUT',headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2022-11-28','user-agent':'ModHub'},body:JSON.stringify({message,content:bytes.toString('base64'),branch:'main'}),signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({})); if(!response.ok)throw new Error(data.message||'GitHub asset upload failed.'); return data;
}

async function accountGists(userId) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Cloud account storage needs GITHUB_TOKEN with Gists: write permission (or the gist scope for a classic PAT).');
  const marker = 'ModHub account data for user ' + userId;
  const legacyMarker = 'Monkey Mod Manager account data for user ' + userId;
  // Page through private Gists so older users' records are still found after the service has many users.
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch('https://api.github.com/gists?per_page=100&page=' + page, {
      headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ModHub' },
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(data)) {
      const detail = data && typeof data.message === 'string' ? data.message : 'GitHub rejected the Gist request.';
      throw new Error('Could not access private account storage (' + response.status + '): ' + detail + ' Ensure GITHUB_TOKEN has Gists: write permission (or gist scope for a classic PAT).');
    }
    const found = data.find((gist) => [marker, legacyMarker].includes(String(gist.description || '')));
    if (found) {
      // Gist index results may omit file content. Fetch the full Gist document
      // before parsing so a refresh cannot mistake a valid save for an empty one.
      const detailResponse = await fetch('https://api.github.com/gists/' + encodeURIComponent(found.id), {
        headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ModHub' },
        signal: AbortSignal.timeout(12000)
      });
      const detail = await detailResponse.json().catch(() => ({}));
      if (!detailResponse.ok || !detail.files) throw new Error('Could not read the private cloud save (' + detailResponse.status + ').');
      return detail;
    }
    if (data.length < 100) return null;
  }
  throw new Error('Could not find the cloud save in the first 2,000 Gists. Check which GitHub account owns GITHUB_TOKEN.');
}
async function readAccountData(userId) {
  const gist = await accountGists(userId);
  if (!gist) return { profiles: [], savedMods: [], configs: {}, installedMods: {} };
  const files = gist.files && typeof gist.files === 'object' ? gist.files : {};
  const record = files['monkey-mod-manager-account.json'] || files['modhub-account.json'] ||
    Object.entries(files).find(([name]) => /(?:modhub|monkey.*manager).*account.*\.json$/i.test(name))?.[1];
  // An existing Gist with missing contents is a read error, never an empty save:
  // returning {} here caused the UI to make saved profiles appear to vanish.
  if (!record) throw new Error('A private cloud-save Gist exists but its account JSON file is missing. Your data has not been cleared; check the Gist in the GitHub account configured by GITHUB_TOKEN.');
  let raw = typeof record.content === 'string' ? record.content : '';
  if ((!raw || record.truncated) && record.raw_url) {
    let rawUrl;
    try { rawUrl = new URL(record.raw_url); } catch { rawUrl = null; }
    if (rawUrl && rawUrl.protocol === 'https:' && rawUrl.hostname === 'gist.githubusercontent.com') {
      const response = await fetch(rawUrl.toString(), { headers: { 'user-agent': 'ModHub' }, signal: AbortSignal.timeout(12000) });
      if (response.ok) raw = await response.text();
      else throw new Error('Could not retrieve the raw private cloud save (' + response.status + ').');
    }
  }
  if (typeof raw !== 'string' || raw.length === 0) throw new Error('The private cloud save has no readable contents. Your data was not treated as empty; check GitHub Gists access for GITHUB_TOKEN.');
  try {
    const data = JSON.parse(raw);
    return { profiles: Array.isArray(data.profiles) ? data.profiles.slice(0,50) : [], savedMods: Array.isArray(data.savedMods) ? data.savedMods.slice(0,500) : [], configs: data.configs && typeof data.configs === 'object' ? data.configs : {}, installedMods: data.installedMods && typeof data.installedMods === 'object' ? data.installedMods : {} };
  } catch { throw new Error('Saved account data is unreadable. Your existing cloud save was not overwritten.'); }
}
async function writeAccountData(userId, value) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Cloud account storage needs GITHUB_TOKEN with Gists: write permission (or the gist scope for a classic PAT).');
  const data = {
    profiles: Array.isArray(value.profiles) ? value.profiles.slice(0,50) : [],
    savedMods: Array.isArray(value.savedMods) ? value.savedMods.map(String).slice(0,500) : [],
    configs: value.configs && typeof value.configs === 'object' ? value.configs : {},
    installedMods: value.installedMods && typeof value.installedMods === 'object' ? value.installedMods : {}
  };
  const content = JSON.stringify(data, null, 2);
  if (Buffer.byteLength(content) > 900000) throw new Error('Account data is too large (900 KB limit).');
  const existing = await accountGists(userId);
  const marker = 'ModHub account data for user ' + userId;
  const response = await fetch(existing ? 'https://api.github.com/gists/' + existing.id : 'https://api.github.com/gists', {
    method: existing ? 'PATCH' : 'POST',
    headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ModHub' },
    body: JSON.stringify({ description: marker, public: false, files: { 'monkey-mod-manager-account.json': { content } } }),
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { const detail = typeof result.message === 'string' ? result.message : 'GitHub rejected the save.'; throw new Error('Private cloud save failed (' + response.status + '): ' + detail + ' Check that GITHUB_TOKEN has Gists: write permission (or gist scope for a classic PAT).'); }
  return data;
}

function contentType(file) { return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'; }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  }
  try {

    if (url.pathname === '/auth/github' && req.method === 'GET') {
      if (!process.env.GITHUB_OAUTH_CLIENT_ID || !process.env.GITHUB_OAUTH_CLIENT_SECRET || !process.env.SESSION_SECRET) return reply(res,503,{error:'GitHub account login is not configured in Render yet.'});
      const desktopMode=url.searchParams.get('desktop')==='1';
      const state=crypto.randomBytes(24).toString('hex'); cookie(res,'mmm_state',state,600); cookie(res,'mmm_auth_mode',desktopMode?'desktop':'web',600);
      const auth=new URL('https://github.com/login/oauth/authorize'); auth.searchParams.set('client_id',process.env.GITHUB_OAUTH_CLIENT_ID); auth.searchParams.set('redirect_uri','https://modhub.duckdns.org/auth/github/callback'); auth.searchParams.set('scope','read:user'); auth.searchParams.set('state',state);
      res.writeHead(302,{location:auth.toString()}); return res.end();
    }
    if (url.pathname === '/auth/github/callback' && req.method === 'GET') {
      if (!parseCookies(req).mmm_state || !safeEqual(parseCookies(req).mmm_state,url.searchParams.get('state'))) return reply(res,400,{error:'Account sign-in state did not match.'});
      const tr=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({client_id:process.env.GITHUB_OAUTH_CLIENT_ID,client_secret:process.env.GITHUB_OAUTH_CLIENT_SECRET,code:url.searchParams.get('code')}),signal:AbortSignal.timeout(10000)});
      const td=await tr.json(); if(!tr.ok||!td.access_token)return reply(res,401,{error:'GitHub sign-in failed.'});
      const pr=await fetch('https://api.github.com/user',{headers:{authorization:'Bearer '+td.access_token,accept:'application/vnd.github+json','user-agent':'ModHub'},signal:AbortSignal.timeout(10000)}); const p=await pr.json();
      if(!pr.ok||!p.id||!p.login)return reply(res,401,{error:'Could not verify GitHub account.'});
      const sessionToken=signedSession({id:String(p.id),login:String(p.login),avatar:String(p.avatar_url||''),exp:Date.now()+604800000});
      cookie(res,'mmm_session',sessionToken,604800); cookie(res,'mmm_state','',0);
      const desktopMode=parseCookies(req).mmm_auth_mode==='desktop'; cookie(res,'mmm_auth_mode','',0);
      if(desktopMode){
        const deepLink='monkeymodmanager://auth?token='+encodeURIComponent(sessionToken);
        res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'","x-content-type-options":"nosniff"});
        res.end('<!doctype html><meta charset="utf-8"><title>Signed in · ModHub</title><style>body{font:16px system-ui;background:#10150f;color:#f4f6f0;display:grid;place-items:center;min-height:90vh;text-align:center}main{max-width:440px;padding:32px;border:1px solid #3a4937;border-radius:18px}p{color:#b9c5b4}</style><main><h1>GitHub sign-in complete</h1><p>You can return to ModHub. This tab will close if your browser permits it.</p></main><script>location.href='+JSON.stringify(deepLink)+';setTimeout(()=>window.close(),10000);</script>'); return;
      }
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'","x-content-type-options":"nosniff"});
      res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Signed in · ModHub</title><style>*{box-sizing:border-box}body{font:16px system-ui;background:#10150f;color:#f4f6f0;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}main{width:min(460px,100%);padding:36px 28px;border:1px solid #3a4937;border-radius:20px;background:#151c13}h1{font-size:26px;margin:0 0 12px}p{color:#b9c5b4;line-height:1.65}button{margin-top:18px;padding:12px 18px;border:0;border-radius:10px;background:#c7f36b;color:#1b2410;font-weight:700;cursor:pointer}</style><main><h1>✓ GitHub sign-in complete</h1><p>You are signed in. Return to ModHub; this window will stay open for a moment so the app can finish connecting.</p><button onclick="window.close()">Close this window</button></main><script>function notifyParent(){try{if(window.opener&&!window.opener.closed)window.opener.postMessage({type:"mmm-github-auth-complete"},"https://modhub.duckdns.org")}catch{}}notifyParent();let attempts=0;const timer=setInterval(()=>{notifyParent();attempts++;if(attempts>=10)clearInterval(timer)},500);setTimeout(()=>{if(window.opener&&!window.opener.closed)window.close()},10000);</script>'); return;
    }
    if (url.pathname === '/api/account' && req.method === 'GET') { const u=sessionFor(req); return reply(res,200,{configured:Boolean(process.env.GITHUB_OAUTH_CLIENT_ID&&process.env.GITHUB_OAUTH_CLIENT_SECRET&&process.env.SESSION_SECRET),user:u?{id:u.id,login:u.login,avatar:u.avatar}:null}); }

    if (url.pathname === '/api/account/data' && (req.method === 'GET' || req.method === 'PUT')) {
      const user = sessionFor(req);
      if (!user) return reply(res, 401, { error: 'Sign in with GitHub to access account data.' });
      try {
        if (req.method === 'GET') return reply(res, 200, { data: await readAccountData(user.id) });
        const body = await readBody(req, 1000000);
        return reply(res, 200, { ok: true, data: await writeAccountData(user.id, body.data || {}) });
      } catch (error) {
        return reply(res, 502, { error: error instanceof Error ? error.message : 'Cloud account storage failed.' });
      }
    }
    if (url.pathname === '/api/account/logout' && req.method === 'POST') { cookie(res,'mmm_session','',0); return reply(res,200,{ok:true}); }
    if (url.pathname === '/api/assets' && req.method === 'POST') {
      if (!checkRate(req)) return reply(res,429,{error:'Too many uploads. Wait one minute and try again.'});
      const user=sessionFor(req); if(!user)return reply(res,401,{error:'Sign in with GitHub before uploading files for your mods.'});
      const body=await readBody(req,35000000); const modId=slug(body.modId); const name=path.basename(String(body.fileName||'')).replace(/[^a-zA-Z0-9._-]/g,'_'); const kind=String(body.kind||'image'); const mime=String(body.mime||''); const allowed=kind==='image'?['image/png','image/jpeg','image/webp','image/gif']:kind==='video'?['video/mp4','video/webm']:kind==='mod'?['application/zip','application/x-zip-compressed','application/octet-stream','application/x-msdownload']:[];
      if(!modId||!name||!allowed.includes(mime))return reply(res,400,{error:'Unsupported upload type.'});
      const raw=String(body.base64||'').replace(/^data:[^,]+,/,''); if(!raw||raw.length>33000000)return reply(res,413,{error:'Upload too large.'}); const bytes=Buffer.from(raw,'base64'); const max=kind==='video'?12000000:kind==='mod'?24000000:8000000;
      if(!bytes.length||bytes.length>max)return reply(res,413,{error:'Upload exceeds the '+Math.round(max/1000000)+' MB limit.'});
      const ext=path.extname(name).toLowerCase(); if(kind==='image'&&!['.png','.jpg','.jpeg','.webp','.gif'].includes(ext)||kind==='video'&&!['.mp4','.webm'].includes(ext)||kind==='mod'&&!['.zip','.dll'].includes(ext))return reply(res,400,{error:'File extension is not allowed.'});
      try { const p='mods/'+modId+'/'+kind+'/'+Date.now()+'-'+name; await githubContent(p,bytes,'Upload '+kind+' for '+modId+' by '+user.login); return reply(res,201,{ok:true,url:'https://raw.githubusercontent.com/'+MOD_REPO+'/main/'+p,path:p}); }
      catch(e){return reply(res,502,{error:e instanceof Error?e.message:'Upload failed.'});}
    }

    if (url.pathname === '/health' && req.method === 'GET') {
      const memory = process.memoryUsage();
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const cpu = process.cpuUsage();
      return reply(res, 200, {
        status: 'healthy',
        service: 'modhub',
        timestamp: new Date().toISOString(),
        uptime: {
          seconds: Math.floor(process.uptime()),
          human: (() => {
            const seconds = Math.floor(process.uptime());
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const remainingSeconds = seconds % 60;
            return [days ? days + 'd' : '', hours ? hours + 'h' : '', minutes ? minutes + 'm' : '', remainingSeconds + 's'].filter(Boolean).join(' ');
          })()
        },
        process: {
          pid: process.pid,
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
          cpuTime: { userMicroseconds: cpu.user, systemMicroseconds: cpu.system }
        },
        memory: {
          process: {
            rssBytes: memory.rss,
            heapUsedBytes: memory.heapUsed,
            heapTotalBytes: memory.heapTotal,
            externalBytes: memory.external,
            arrayBuffersBytes: memory.arrayBuffers
          },
          system: {
            totalBytes: totalMemory,
            freeBytes: freeMemory,
            usedBytes: totalMemory - freeMemory,
            usedPercent: Number((((totalMemory - freeMemory) / totalMemory) * 100).toFixed(1))
          }
        },
        system: {
          loadAverage: os.loadavg(),
          cpuCount: os.cpus().length
        },
        configuration: {
          githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
          githubOAuthConfigured: Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET && process.env.SESSION_SECRET),
          adminPasswordConfigured: Boolean(process.env.ADMIN_PASSWORD)
        }
      });
    }
    if (url.pathname === '/healthz' && req.method === 'GET') return reply(res, 200, { ok: true, service: 'modhub' });
    if (url.pathname === '/api/github-import' && req.method === 'GET') {
      const source = url.searchParams.get('url') || '';
      let parsed;
      try { parsed = new URL(source); } catch { return reply(res, 400, { error: 'Enter a valid GitHub repository URL.' }); }
      if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') return reply(res, 400, { error: 'Only public github.com repository URLs are supported.' });
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length < 2 || !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[0]) || !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[1])) return reply(res, 400, { error: 'URL must point to a GitHub repository, e.g. https://github.com/owner/repository.' });
      const owner = parts[0], repo = parts[1].replace(/\.git$/i, '');
      const apiHeaders = { ...(process.env.GITHUB_TOKEN ? { authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}), accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ModHub/2.1' };
      try {
        const repoResponse = await fetch('https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo), { headers: apiHeaders, signal: AbortSignal.timeout(12000) });
        const repoData = await repoResponse.json().catch(() => ({}));
        if (!repoResponse.ok || repoData.private) return reply(res, repoResponse.status === 404 ? 404 : 502, { error: repoData.message || 'Could not read this public GitHub repository.' });
        const readmeResponse = await fetch('https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/readme', { headers: { ...apiHeaders, accept: 'application/vnd.github.raw' }, signal: AbortSignal.timeout(12000) });
        let readme = '';
        if (readmeResponse.ok) {
          const contentType = readmeResponse.headers.get('content-type') || '';
          if (contentType.includes('json')) {
            const readmeData = await readmeResponse.json().catch(() => ({}));
            if (readmeData.content) readme = Buffer.from(String(readmeData.content).replace(/\n/g, ''), 'base64').toString('utf8');
          } else readme = await readmeResponse.text();
        }
        const releaseResponse = await fetch('https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/releases/latest', { headers: apiHeaders, signal: AbortSignal.timeout(12000) });
        const release = releaseResponse.ok ? await releaseResponse.json().catch(() => ({})) : {};
        const assets = Array.isArray(release.assets) ? release.assets : [];
        const compatibleAssets = assets.filter((item) => /\.(dll|zip)$/i.test(String(item.name || '')) && !/(^|[-_. ])(symbols?|debug|source|tests?)([-_. ]|$)/i.test(String(item.name || '')));
        const repoStem = repo.toLowerCase().replace(/[^a-z0-9]/g, '');
        const asset = compatibleAssets.find((item) => String(item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(repoStem))
          || compatibleAssets.find((item) => /\.zip$/i.test(String(item.name || '')))
          || compatibleAssets.find((item) => /\.dll$/i.test(String(item.name || '')));
        const releaseTag = String(release.tag_name || '').trim();
        const fallbackRef = releaseTag
          ? 'refs/tags/' + releaseTag.split('/').map(encodeURIComponent).join('/')
          : 'refs/heads/' + String(repoData.default_branch || 'main').split('/').map(encodeURIComponent).join('/');
        const sourceArchive = 'https://github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/archive/' + fallbackRef + '.zip';
        const downloadUrl = asset && httpsUrl(asset.browser_download_url, true) ? String(asset.browser_download_url) : sourceArchive;
        const topics = Array.isArray(repoData.topics) ? repoData.topics : [];
        const topicText = topics.join(' ').toLowerCase();
        const category = /core|library|framework|dependency/.test(topicText) ? 'Core' : /map|level/.test(topicText) ? 'Maps' : /cosmetic|skin|appearance/.test(topicText) ? 'Cosmetic' : /gameplay|menu|cheat/.test(topicText) ? 'Gameplay' : /utility|tool|helper/.test(topicText) ? 'Utility' : '';
        const additionalLinks = [];
        if (repoData.html_url) additionalLinks.push({ label: 'GitHub repository', url: repoData.html_url });
        if (repoData.releases_url) additionalLinks.push({ label: 'Releases', url: 'https://github.com/' + owner + '/' + repo + '/releases' });
        if (repoData.html_url && repoData.has_wiki) additionalLinks.push({ label: 'Wiki', url: 'https://github.com/' + owner + '/' + repo + '/wiki' });
        return reply(res, 200, {
          name: String(repoData.name || repo).slice(0,90), author: String(repoData.owner && repoData.owner.login || owner).slice(0,90), githubOwnerId: String(repoData.owner && repoData.owner.id || ''), githubOwnerLogin: String(repoData.owner && repoData.owner.login || owner),
          description: String(repoData.description || '').slice(0,1400), version: String(release.tag_name || '1.0.0').replace(/^v(?=\d)/i, '').slice(0,40),
          downloadUrl, sourceUrl: repoData.html_url || source,
          websiteUrl: httpsUrl(repoData.homepage || '', false) || '', readme: String(readme).slice(0,20000),
          changelog: (String(release.body || '') + (!asset ? '\n\nModHub could not find a compiled .dll/.zip release asset, so this link downloads the GitHub source archive. The desktop app will search inside the ZIP for compiled DLLs; if it contains only source code, publish a compiled DLL or ZIP in GitHub Releases.' : '')).slice(0,12000), dependencies: [], category,
          additionalLinks, topics, stars: Number(repoData.stargazers_count || 0)
        });
      } catch (error) { return reply(res, 502, { error: error instanceof Error ? error.message : 'GitHub import failed.' }); }
    }
    if (url.pathname.startsWith('/api/mod-feedback/')) {
      const match = url.pathname.match(/^\/api\/mod-feedback\/([^/]+)(?:\/(vote|comments|rating)(?:\/([^/]+)(?:\/(vote|rating))?)?)?$/);
      if (!match) return reply(res,404,{error:'Feedback route not found.'});
      let modId; try { modId = decodeURIComponent(match[1]); } catch { return reply(res,400,{error:'Invalid mod ID.'}); }
      if (!modId || modId.length > 120) return reply(res,400,{error:'Invalid mod ID.'});
      const action = match[2] || '';
      let commentId = '';
      try { commentId = match[3] ? decodeURIComponent(match[3]) : ''; } catch { return reply(res,400,{error:'Invalid review ID.'}); }
      const reviewAction = match[4] || '';
      const user = sessionFor(req);
      const publicComment = (comment, viewer) => {
        const votes = comment.votes && typeof comment.votes === 'object' ? comment.votes : {};
        const ratings = comment.ratings && typeof comment.ratings === 'object' ? comment.ratings : {};
        const numbers = Object.values(ratings).map(Number).filter(value => Number.isInteger(value) && value >= 1 && value <= 5);
        const { votes: _votes, ratings: _ratings, userId: _userId, ...safe } = comment;
        return { ...safe, upvotes:Object.values(votes).filter(value => Number(value) === 1).length, downvotes:Object.values(votes).filter(value => Number(value) === -1).length,
          myVote:viewer ? Number(votes[viewer.id] || 0) : 0, ratingAverage:numbers.length ? Math.round(numbers.reduce((sum,value)=>sum+value,0)/numbers.length*10)/10 : 0,
          ratingCount:numbers.length, myRating:viewer ? Number(ratings[viewer.id] || 0) : 0 };
      };
      try {
        const file = await readFeedbackFile();
        const item = file.data[modId] && typeof file.data[modId] === 'object' ? file.data[modId] : {votes:{},ratings:{},comments:[]};
        item.votes = item.votes && typeof item.votes === 'object' ? item.votes : {};
        item.ratings = item.ratings && typeof item.ratings === 'object' ? item.ratings : {};
        item.comments = Array.isArray(item.comments) ? item.comments : [];
        if (req.method === 'GET' && !action) {
          const votes = Object.values(item.votes).map(Number);
          const ratings = Object.values(item.ratings).map(Number).filter(value=>Number.isInteger(value)&&value>=1&&value<=5);
          return reply(res,200,{upvotes:votes.filter(value=>value===1).length,downvotes:votes.filter(value=>value===-1).length,myVote:user?Number(item.votes[user.id]||0):0,
            ratingAverage:ratings.length?Math.round(ratings.reduce((sum,value)=>sum+value,0)/ratings.length*10)/10:0,ratingCount:ratings.length,myRating:user?Number(item.ratings[user.id]||0):0,
            comments:item.comments.slice(-100).reverse().map(comment=>publicComment(comment,user))});
        }
        if (!user) return reply(res,401,{error:'Sign in with GitHub to vote, rate, or comment.'});
        if (action === 'comments' && commentId && reviewAction && req.method === 'POST') {
          if (!checkRate(req)) return reply(res,429,{error:'Too many review reactions. Wait a minute.'});
          const comment = item.comments.find(value=>String(value.id)===commentId);
          if (!comment) return reply(res,404,{error:'Review not found.'});
          if (!comment.votes || typeof comment.votes !== 'object') comment.votes = {};
          if (!comment.ratings || typeof comment.ratings !== 'object') comment.ratings = {};
          const body = await readBody(req,5000);
          if (reviewAction === 'vote') {
            const vote = Number(body.vote);
            if (![-1,0,1].includes(vote)) return reply(res,400,{error:'Review vote must be helpful, not helpful, or cleared.'});
            if (vote === 0) delete comment.votes[user.id]; else comment.votes[user.id] = vote;
          } else {
            const rating = Number(body.rating);
            if (!Number.isInteger(rating) || rating < 0 || rating > 5) return reply(res,400,{error:'Review rating must be 0 (remove) or a whole number from 1 to 5.'});
            if (rating === 0) delete comment.ratings[user.id]; else comment.ratings[user.id] = rating;
          }
          file.data[modId] = item;
          await saveFeedbackFile(file.data,file.sha,'React to review for '+modId);
          return reply(res,200,{comment:publicComment(comment,user)});
        }
        if (req.method === 'POST' && action === 'vote' && !commentId) {
          if (!checkRate(req)) return reply(res,429,{error:'Too many votes. Wait a minute.'});
          const body=await readBody(req,5000); const vote=Number(body.vote);
          if(![-1,0,1].includes(vote)) return reply(res,400,{error:'Vote must be helpful, not helpful, or cleared.'});
          if(vote===0) delete item.votes[user.id]; else item.votes[user.id]=vote;
          file.data[modId]=item; await saveFeedbackFile(file.data,file.sha,'Update community vote for '+modId);
          const votes=Object.values(item.votes).map(Number);
          return reply(res,200,{upvotes:votes.filter(value=>value===1).length,downvotes:votes.filter(value=>value===-1).length,myVote:vote});
        }
        if (req.method === 'POST' && action === 'rating' && !commentId) {
          if (!checkRate(req)) return reply(res,429,{error:'Too many ratings. Wait a minute.'});
          const body=await readBody(req,5000);const rating=Number(body.rating);
          if(!Number.isInteger(rating)||rating<0||rating>5)return reply(res,400,{error:'Rating must be 0 (remove) or a whole number from 1 to 5.'});
          if(rating===0)delete item.ratings[user.id];else item.ratings[user.id]=rating;
          file.data[modId]=item;await saveFeedbackFile(file.data,file.sha,(rating===0?'Remove rating for ':'Rate mod ')+modId);
          const ratings=Object.values(item.ratings).map(Number).filter(value=>Number.isInteger(value)&&value>=1&&value<=5);
          return reply(res,200,{ratingAverage:ratings.length?Math.round(ratings.reduce((sum,value)=>sum+value,0)/ratings.length*10)/10:0,ratingCount:ratings.length,myRating:rating===0?0:rating});
        }
        if (req.method === 'POST' && action === 'comments' && !commentId) {
          if (!checkRate(req)) return reply(res,429,{error:'Too many comments. Wait a minute.'});
          const body=await readBody(req,10000);const comment=String(body.body||'').trim();
          if(!comment||comment.length>1000)return reply(res,400,{error:'Comment must be between 1 and 1,000 characters.'});
          item.comments.push({id:crypto.randomUUID(),userId:user.id,login:String(user.login||'Community member').slice(0,80),body:comment,createdAt:new Date().toISOString(),votes:{},ratings:{}});
          item.comments=item.comments.slice(-100);
          file.data[modId]=item;await saveFeedbackFile(file.data,file.sha,'Add community review for '+modId);
          return reply(res,201,{comments:item.comments.slice().reverse().map(comment=>publicComment(comment,user))});
        }
        return reply(res,405,{error:'Method not allowed.'});
      } catch(error) { return reply(res,502,{error:error instanceof Error?error.message:'Community feedback storage failed.'}); }
    }
    if (url.pathname === '/api/mods' && req.method === 'GET') {
      try { return reply(res, 200, { mods: await getMods(), source: MOD_REPO, sourceFile: MOD_FILE }); }
      catch (error) { return reply(res, 502, { error: error instanceof Error ? error.message : 'Could not load the mod base API.' }); }
    }
    if (url.pathname === '/api/admin/check' && req.method === 'POST') {
      if (!checkRate(req)) return reply(res, 429, { error: 'Too many admin attempts. Wait one minute.' });
      const auth = adminAllowed(req);
      return auth.ok ? reply(res, 200, { ok: true }) : reply(res, auth.status, { error: auth.error });
    }
    if (url.pathname === '/api/admin/render-env' && req.method === 'GET') {
      if (!adminAllowed(req).ok) return reply(res, 401, { error: 'Unlock admin tools to manage Render variables.' });
      const token = process.env.RENDER_API_KEY;
      const serviceId = process.env.RENDER_SERVICE_ID;
      if (!token || !serviceId) return reply(res, 503, { error: 'Render integration is not configured. Add RENDER_API_KEY and RENDER_SERVICE_ID to this service in Render, then deploy.' });
      try {
        const response = await fetch('https://api.render.com/v1/services/' + encodeURIComponent(serviceId) + '/env-vars?limit=100', {
          headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
          signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) return reply(res, 502, { error: 'Render API could not list variables (HTTP ' + response.status + '). Check the API key and service ID.' });
        const data = await response.json();
        const variables = Array.isArray(data) ? data.map((item) => item && item.envVar ? item.envVar : item).filter((item) => item && typeof item.key === 'string').map((item) => ({ key: item.key, hasValue: typeof item.value === 'string' && item.value.length > 0 })) : [];
        return reply(res, 200, { variables, valuesHidden: true });
      } catch (error) { return reply(res, 502, { error: error instanceof Error ? error.message : 'Could not connect to Render.' }); }
    }
    if (url.pathname.startsWith('/api/admin/render-env/') && req.method === 'PUT') {
      if (!checkRate(req)) return reply(res, 429, { error: 'Too many Render variable changes. Wait one minute.' });
      if (!adminAllowed(req).ok) return reply(res, 401, { error: 'Unlock admin tools to manage Render variables.' });
      const token = process.env.RENDER_API_KEY;
      const serviceId = process.env.RENDER_SERVICE_ID;
      if (!token || !serviceId) return reply(res, 503, { error: 'Render integration is not configured. Add RENDER_API_KEY and RENDER_SERVICE_ID to this service in Render, then deploy.' });
      let key;
      try { key = decodeURIComponent(url.pathname.slice('/api/admin/render-env/'.length)); } catch { return reply(res, 400, { error: 'Invalid variable name.' }); }
      if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(key) || ['RENDER_API_KEY','RENDER_SERVICE_ID'].includes(key)) return reply(res, 400, { error: 'Use a valid uppercase variable name. Render connection variables cannot be changed here.' });
      let body;
      try { body = await readBody(req, 100000); } catch { return reply(res, 400, { error: 'Request body must be valid JSON.' }); }
      if (typeof body.value !== 'string' || !body.value.length || body.value.length > 8000) return reply(res, 400, { error: 'Enter a value between 1 and 8,000 characters.' });
      try {
        const response = await fetch('https://api.render.com/v1/services/' + encodeURIComponent(serviceId) + '/env-vars/' + encodeURIComponent(key), {
          method: 'PUT', headers: { authorization: 'Bearer ' + token, accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ value: body.value }), signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) return reply(res, 502, { error: 'Render rejected the variable update (HTTP ' + response.status + ').' });
        const deploy = await fetch('https://api.render.com/v1/services/' + encodeURIComponent(serviceId) + '/deploys', {
          method: 'POST', headers: { authorization: 'Bearer ' + token, accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({}), signal: AbortSignal.timeout(12000)
        });
        if (!deploy.ok) return reply(res, 202, { ok: true, deployed: false, key, message: key + ' was saved in Render, but automatic deployment could not be started (HTTP ' + deploy.status + '). Deploy the service from the Render dashboard.' });
        return reply(res, 200, { ok: true, deployed: true, key, message: key + ' saved in Render. A deployment has been requested.' });
      } catch (error) { return reply(res, 502, { error: error instanceof Error ? error.message : 'Could not update Render.' }); }
    }
    if ((url.pathname === '/api/mods' && req.method === 'POST') || (url.pathname.startsWith('/api/mods/') && ['PUT','DELETE'].includes(req.method))) {
      if (!checkRate(req)) return reply(res, 429, { error: 'Too many admin requests. Wait one minute.' });
      const user = sessionFor(req);
      const admin = req.method === 'DELETE' && adminAllowed(req).ok;
      if (!user && !admin) return reply(res, 401, { error: 'Sign in with GitHub to add and manage your own mods, or use the admin password to delete a listing.' });
      let current;
      try { current = await readGithubContents(); }
      catch (error) { return reply(res, 503, { error: error instanceof Error ? error.message : 'Could not access the mod base.' }); }
      if (!Array.isArray(current.list)) return reply(res, 500, { error: 'modinfo.Json must contain a JSON array.' });
      if (url.pathname === '/api/mods' && req.method === 'POST') {
        const body = await readBody(req);
        const name = String(body.name || '').trim(); const author = String(body.author || '').trim();
        const version = String(body.version || '').trim(); const description = String(body.description || '').trim();
        const category = String(body.category || 'Utility').trim();
        const downloadUrl = httpsUrl(body.downloadUrl, true); const imageUrl = httpsUrl(body.imageUrl || '', false); const sourceUrl = httpsUrl(body.sourceUrl || '', false); const videoUrl = httpsUrl(body.videoUrl || '', false);
        if (!name || !author || !version || !description || !downloadUrl || imageUrl === null || sourceUrl === null || videoUrl === null) return reply(res, 400, { error: 'Name, author, version, description and HTTPS download URL are required. Image/source URLs must also be HTTPS.' });
        if (name.length > 90 || description.length > 1400 || author.length > 90 || version.length > 40) return reply(res, 400, { error: 'One or more fields are too long.' });
        const id = slug(name);
        if (!id || current.list.some((entry) => slug(entry.name) === id)) return reply(res, 409, { error: 'A mod with that name already exists.' });
        const deps = Array.isArray(body.dependencies) ? body.dependencies : [];
        const websiteUrl=httpsUrl(body.websiteUrl||'',false), embedUrl=httpsUrl(body.embedUrl||'',false); if(websiteUrl===null||embedUrl===null)return reply(res,400,{error:'Website and embed URLs must use HTTPS.'});
        const additionalLinks=Array.isArray(body.additionalLinks)?body.additionalLinks.map((item)=>({label:String(item.label||'').trim().slice(0,80),url:httpsUrl(item.url,true)})).filter((item)=>item.label&&item.url).slice(0,20):[];
        let ownerId = user.id;
        if (body.transferOwnership) {
          let repoUrl; try { repoUrl = new URL(sourceUrl); } catch { return reply(res, 400, { error: 'Ownership transfer requires a valid GitHub repository URL.' }); }
          if (repoUrl.protocol !== 'https:' || repoUrl.hostname.toLowerCase() !== 'github.com') return reply(res, 400, { error: 'Ownership transfer only works with a GitHub repository URL.' });
          const repoParts = repoUrl.pathname.split('/').filter(Boolean);
          if (repoParts.length < 2) return reply(res, 400, { error: 'Use a URL like https://github.com/owner/repository.' });
          const ownerResponse = await fetch('https://api.github.com/repos/' + encodeURIComponent(repoParts[0]) + '/' + encodeURIComponent(repoParts[1].replace(/\.git$/i, '')), { headers: { ...(process.env.GITHUB_TOKEN ? { authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}), accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ModHub/2.1' }, signal: AbortSignal.timeout(12000) });
          const ownerData = await ownerResponse.json().catch(() => ({}));
          if (!ownerResponse.ok || !ownerData.owner || !ownerData.owner.id || ownerData.private) return reply(res, 400, { error: 'Could not verify the public GitHub repository owner.' });
          ownerId = String(ownerData.owner.id);
        }
        const entry = { name, version, author, description, category, download_url: downloadUrl, image_url: imageUrl || '', gallery_urls: Array.isArray(body.galleryUrls) ? body.galleryUrls.map((value) => httpsUrl(value, true)).filter(Boolean).slice(0, 8) : [], video_url: videoUrl || '', source_url: sourceUrl || '', website_url:websiteUrl||'',embed_url:embedUrl||'',requirements:String(body.requirements||'').slice(0,500),supported_os:Array.isArray(body.supportedOS)?body.supportedOS.map(String).slice(0,12):[],readme:String(body.readme||'').slice(0,12000),changelog:String(body.changelog||'').slice(0,6000),additional_links:additionalLinks, dependencies: deps.map((item) => String(item).trim()).filter(Boolean).slice(0, 20), featured: false, owner_id: ownerId };
        current.list.push(entry);
        try { await saveGithubList(current.list, current.sha, 'Add ' + name + ' to mod hub'); }
        catch (error) { return reply(res, 502, { error: error instanceof Error ? error.message : 'Could not save mod to GitHub.' }); }
        return reply(res, 201, { ok: true, mod: normalise(entry) });
      }
      const id = decodeURIComponent(url.pathname.slice('/api/mods/'.length));
      if (req.method === 'PUT') {
        const body = await readBody(req);
        const index = current.list.findIndex((entry) => slug(entry.name) === id);
        if (index < 0) return reply(res, 404, { error: 'Mod was not found.' });
        const old = current.list[index];
        if (String(old.owner_id || '') !== user.id) return reply(res, 403, { error: 'You can only edit mods published by your account.' });
        const name=String(body.name||'').trim(), author=String(body.author||'').trim(), version=String(body.version||'').trim(), description=String(body.description||'').trim();
        const downloadUrl=httpsUrl(body.downloadUrl,true), imageUrl=httpsUrl(body.imageUrl||'',false), sourceUrl=httpsUrl(body.sourceUrl||'',false), videoUrl=httpsUrl(body.videoUrl||'',false);
        if(!name||!author||!version||!description||!downloadUrl||imageUrl===null||sourceUrl===null||videoUrl===null)return reply(res,400,{error:'Required fields and HTTPS URLs must be valid.'});
        if(current.list.some((entry,i)=>i!==index&&slug(entry.name)===slug(name)))return reply(res,409,{error:'Another mod already uses that name.'});
        const deps=Array.isArray(body.dependencies)?body.dependencies:[];
        const websiteUrl=httpsUrl(body.websiteUrl||'',false),embedUrl=httpsUrl(body.embedUrl||'',false);if(websiteUrl===null||embedUrl===null)return reply(res,400,{error:'Website and embed URLs must use HTTPS.'});const additionalLinks=Array.isArray(body.additionalLinks)?body.additionalLinks.map((item)=>({label:String(item.label||'').trim().slice(0,80),url:httpsUrl(item.url,true)})).filter((item)=>item.label&&item.url).slice(0,20):[];
        let ownerId = String(old.owner_id || user.id);
         if (body.transferOwnership) {
           let repoUrl; try { repoUrl = new URL(sourceUrl); } catch { return reply(res, 400, { error: 'Ownership transfer requires a valid GitHub repository URL.' }); }
           if (repoUrl.protocol !== 'https:' || repoUrl.hostname.toLowerCase() !== 'github.com') return reply(res, 400, { error: 'Ownership transfer only works with a GitHub repository URL.' });
           const repoParts = repoUrl.pathname.split('/').filter(Boolean);
           if (repoParts.length < 2) return reply(res, 400, { error: 'Use a URL like https://github.com/owner/repository.' });
           const ownerResponse = await fetch('https://api.github.com/repos/' + encodeURIComponent(repoParts[0]) + '/' + encodeURIComponent(repoParts[1].replace(/\.git$/i, '')), { headers: { ...(process.env.GITHUB_TOKEN ? { authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}), accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ModHub/2.1' }, signal: AbortSignal.timeout(12000) });
           const ownerData = await ownerResponse.json().catch(() => ({}));
           if (!ownerResponse.ok || !ownerData.owner || !ownerData.owner.id || ownerData.private) return reply(res, 400, { error: 'Could not verify the public GitHub repository owner.' });
           ownerId = String(ownerData.owner.id);
         }
         current.list[index]={...old,owner_id:ownerId,name,author,version,description,category:String(body.category||'Utility'),download_url:downloadUrl,image_url:imageUrl||'',gallery_urls:Array.isArray(body.galleryUrls)?body.galleryUrls.map(value=>httpsUrl(value,true)).filter(Boolean).slice(0,8):[],video_url:videoUrl||'',source_url:sourceUrl||'',website_url:websiteUrl||'',embed_url:embedUrl||'',requirements:String(body.requirements||'').slice(0,500),supported_os:Array.isArray(body.supportedOS)?body.supportedOS.map(String).slice(0,12):[],readme:String(body.readme||'').slice(0,12000),changelog:String(body.changelog||'').slice(0,6000),additional_links:additionalLinks,dependencies:deps.map(item=>String(item).trim()).filter(Boolean).slice(0,20)};
        try { await saveGithubList(current.list,current.sha,'Update mod '+name); } catch(error) { return reply(res,502,{error:error instanceof Error?error.message:'Could not update mod.'}); }
        return reply(res,200,{ok:true,mod:normalise(current.list[index])});
      }
      const oldEntry=current.list.find(entry=>slug(entry.name)===id);
      if (oldEntry && !admin && String(oldEntry.owner_id || '') !== user.id) return reply(res,403,{error:'You can only remove mods published by your account.'});
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
server.listen(PORT, '0.0.0.0', () => {
  console.log('ModHub listening on port ' + PORT + (API_ONLY ? ' (API only)' : ''));
  const startupRefresh = setTimeout(() => { void refreshGithubReleaseLinks(); }, 45000);
  if (typeof startupRefresh.unref === 'function') startupRefresh.unref();
  const weeklyRefresh = setInterval(() => { void refreshGithubReleaseLinks(); }, 7 * 24 * 60 * 60 * 1000);
  if (typeof weeklyRefresh.unref === 'function') weeklyRefresh.unref();
});
