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
function applyCors(req, res) {
  const origin = String(req.headers.origin || '');
  if (!origin) return;
  const allowed = origin === 'null' || origin === 'https://monkey-mod-hub.onrender.com' || origin === process.env.DESKTOP_ALLOWED_ORIGIN;
  if (!allowed) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
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
    imageUrl: String(entry.image_url || entry.imageUrl || '').trim(), sourceUrl: String(entry.source_url || entry.sourceUrl || '').trim(),
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

function parseCookies(req) { return Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const i=x.indexOf('='); return i<0?[x,'']:[x.slice(0,i),decodeURIComponent(x.slice(i+1))]; })); }
function sessionFor(req) {
  const token=parseCookies(req).mmm_session||''; const parts=token.split('.'); if(parts.length!==2)return null;
  const expected=crypto.createHmac('sha256',process.env.SESSION_SECRET||'missing-session-secret').update(parts[0]).digest();
  const actual=Buffer.from(parts[1],'base64url'); if(actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))return null;
  try { const user=JSON.parse(Buffer.from(parts[0],'base64url').toString()); return user.exp>Date.now()?user:null; } catch { return null; }
}
function signedSession(user) { const body=Buffer.from(JSON.stringify(user)).toString('base64url'); return body+'.'+crypto.createHmac('sha256',process.env.SESSION_SECRET||'missing-session-secret').update(body).digest('base64url'); }
function cookie(res,name,value,age) { const current=res.getHeader('Set-Cookie'); const items=Array.isArray(current)?current:current?[String(current)]:[]; items.push(name+'='+encodeURIComponent(value)+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age='+age); res.setHeader('Set-Cookie',items); }
async function githubContent(pathname, bytes, message) {
  const token=process.env.GITHUB_TOKEN; if(!token)throw new Error('GITHUB_TOKEN is not configured.');
  const response=await fetch('https://api.github.com/repos/'+MOD_REPO+'/contents/'+pathname,{method:'PUT',headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','content-type':'application/json','x-github-api-version':'2022-11-28','user-agent':'Monkey-Mod-Hub'},body:JSON.stringify({message,content:bytes.toString('base64'),branch:'main'}),signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({})); if(!response.ok)throw new Error(data.message||'GitHub asset upload failed.'); return data;
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
      const state=crypto.randomBytes(24).toString('hex'); cookie(res,'mmm_state',state,600);
      const auth=new URL('https://github.com/login/oauth/authorize'); auth.searchParams.set('client_id',process.env.GITHUB_OAUTH_CLIENT_ID); auth.searchParams.set('redirect_uri','https://monkey-mod-hub.onrender.com/auth/github/callback'); auth.searchParams.set('scope','read:user'); auth.searchParams.set('state',state);
      res.writeHead(302,{location:auth.toString()}); return res.end();
    }
    if (url.pathname === '/auth/github/callback' && req.method === 'GET') {
      if (!parseCookies(req).mmm_state || !safeEqual(parseCookies(req).mmm_state,url.searchParams.get('state'))) return reply(res,400,{error:'Account sign-in state did not match.'});
      const tr=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({client_id:process.env.GITHUB_OAUTH_CLIENT_ID,client_secret:process.env.GITHUB_OAUTH_CLIENT_SECRET,code:url.searchParams.get('code')}),signal:AbortSignal.timeout(10000)});
      const td=await tr.json(); if(!tr.ok||!td.access_token)return reply(res,401,{error:'GitHub sign-in failed.'});
      const pr=await fetch('https://api.github.com/user',{headers:{authorization:'Bearer '+td.access_token,accept:'application/vnd.github+json','user-agent':'Monkey-Mod-Hub'},signal:AbortSignal.timeout(10000)}); const p=await pr.json();
      if(!pr.ok||!p.id||!p.login)return reply(res,401,{error:'Could not verify GitHub account.'});
      cookie(res,'mmm_session',signedSession({id:String(p.id),login:String(p.login),avatar:String(p.avatar_url||''),exp:Date.now()+604800000}),604800); cookie(res,'mmm_state','',0);
      res.writeHead(302,{location:'https://monkey-mod-hub.onrender.com/?signed_in=1'}); return res.end();
    }
    if (url.pathname === '/api/account' && req.method === 'GET') { const u=sessionFor(req); return reply(res,200,{configured:Boolean(process.env.GITHUB_OAUTH_CLIENT_ID&&process.env.GITHUB_OAUTH_CLIENT_SECRET&&process.env.SESSION_SECRET),user:u?{id:u.id,login:u.login,avatar:u.avatar}:null}); }
    if (url.pathname === '/api/account/logout' && req.method === 'POST') { cookie(res,'mmm_session','',0); return reply(res,200,{ok:true}); }
    if (url.pathname === '/api/assets' && req.method === 'POST') {
      if (!checkRate(req)) return reply(res,429,{error:'Too many uploads. Wait one minute and try again.'});
      const user=sessionFor(req); if(!user)return reply(res,401,{error:'Sign in with GitHub before uploading.'});
      const body=await readBody(req,35000000); const modId=slug(body.modId); const name=path.basename(String(body.fileName||'')).replace(/[^a-zA-Z0-9._-]/g,'_'); const kind=String(body.kind||'image'); const mime=String(body.mime||''); const allowed=kind==='image'?['image/png','image/jpeg','image/webp','image/gif']:kind==='video'?['video/mp4','video/webm']:kind==='mod'?['application/zip','application/x-zip-compressed','application/octet-stream','application/x-msdownload']:[];
      if(!modId||!name||!allowed.includes(mime))return reply(res,400,{error:'Unsupported upload type.'});
      const raw=String(body.base64||'').replace(/^data:[^,]+,/,''); if(!raw||raw.length>33000000)return reply(res,413,{error:'Upload too large.'}); const bytes=Buffer.from(raw,'base64'); const max=kind==='video'?12000000:kind==='mod'?24000000:8000000;
      if(!bytes.length||bytes.length>max)return reply(res,413,{error:'Upload exceeds the '+Math.round(max/1000000)+' MB limit.'});
      const ext=path.extname(name).toLowerCase(); if(kind==='image'&&!['.png','.jpg','.jpeg','.webp','.gif'].includes(ext)||kind==='video'&&!['.mp4','.webm'].includes(ext)||kind==='mod'&&!['.zip','.dll'].includes(ext))return reply(res,400,{error:'File extension is not allowed.'});
      try { const p='mods/'+modId+'/'+kind+'/'+Date.now()+'-'+name; await githubContent(p,bytes,'Upload '+kind+' for '+modId+' by '+user.login); return reply(res,201,{ok:true,url:'https://raw.githubusercontent.com/'+MOD_REPO+'/main/'+p,path:p}); }
      catch(e){return reply(res,502,{error:e instanceof Error?e.message:'Upload failed.'});}
    }

    if (url.pathname === '/healthz') return reply(res, 200, { ok: true, service: 'monkey-mod-hub' });
    if (url.pathname === '/api/mods' && req.method === 'GET') return reply(res, 200, { mods: await getMods() });
    if (url.pathname === '/api/admin/check' && req.method === 'POST') {
      if (!checkRate(req)) return reply(res, 429, { error: 'Too many admin attempts. Wait one minute.' });
      const auth = adminAllowed(req);
      return auth.ok ? reply(res, 200, { ok: true }) : reply(res, auth.status, { error: auth.error });
    }
    if ((url.pathname === '/api/mods' && req.method === 'POST') || (url.pathname.startsWith('/api/mods/') && ['PUT','DELETE'].includes(req.method))) {
      if (!checkRate(req)) return reply(res, 429, { error: 'Too many admin requests. Wait one minute.' });
      const user = sessionFor(req);
      const isAdmin = adminAllowed(req).ok;
      if (!user && !isAdmin) return reply(res, 401, { error: 'Sign in with GitHub to manage mods, or unlock admin tools.' });
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
        const entry = { name, version, author, description, category, download_url: downloadUrl, image_url: imageUrl || '', gallery_urls: Array.isArray(body.galleryUrls) ? body.galleryUrls.map((value) => httpsUrl(value, true)).filter(Boolean).slice(0, 8) : [], video_url: videoUrl || '', config_settings: Array.isArray(body.configSettings) ? body.configSettings.slice(0, 30) : [], source_url: sourceUrl || '', dependencies: deps.map((item) => String(item).trim()).filter(Boolean).slice(0, 20), featured: false, owner_id: user ? user.id : '' };
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
        if (!isAdmin && (!user || String(old.owner_id || '') !== user.id)) return reply(res, 403, { error: 'You can only edit mods published by your account.' });
        const name=String(body.name||'').trim(), author=String(body.author||'').trim(), version=String(body.version||'').trim(), description=String(body.description||'').trim();
        const downloadUrl=httpsUrl(body.downloadUrl,true), imageUrl=httpsUrl(body.imageUrl||'',false), sourceUrl=httpsUrl(body.sourceUrl||'',false), videoUrl=httpsUrl(body.videoUrl||'',false);
        if(!name||!author||!version||!description||!downloadUrl||imageUrl===null||sourceUrl===null||videoUrl===null)return reply(res,400,{error:'Required fields and HTTPS URLs must be valid.'});
        if(current.list.some((entry,i)=>i!==index&&slug(entry.name)===slug(name)))return reply(res,409,{error:'Another mod already uses that name.'});
        const deps=Array.isArray(body.dependencies)?body.dependencies:[];
        current.list[index]={...old,name,author,version,description,category:String(body.category||'Utility'),download_url:downloadUrl,image_url:imageUrl||'',gallery_urls:Array.isArray(body.galleryUrls)?body.galleryUrls.map(value=>httpsUrl(value,true)).filter(Boolean).slice(0,8):[],video_url:videoUrl||'',config_settings:Array.isArray(body.configSettings)?body.configSettings.slice(0,30):[],source_url:sourceUrl||'',dependencies:deps.map(item=>String(item).trim()).filter(Boolean).slice(0,20)};
        try { await saveGithubList(current.list,current.sha,'Update mod '+name); } catch(error) { return reply(res,502,{error:error instanceof Error?error.message:'Could not update mod.'}); }
        return reply(res,200,{ok:true,mod:normalise(current.list[index])});
      }
      const oldEntry=current.list.find(entry=>slug(entry.name)===id);
      if(oldEntry&&!isAdmin&&(!user||String(oldEntry.owner_id||'')!==user.id))return reply(res,403,{error:'You can only remove mods published by your account.'});
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
