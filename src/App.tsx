import { useEffect, useMemo, useState, type FormEvent } from 'react';
import './fresh.css';
import './hub.css';

type Mod = {
  id: string; name: string; author: string; category: string; description: string;
  version: string; downloadUrl: string; imageUrl?: string; sourceUrl?: string; websiteUrl?: string; embedUrl?: string;
  requirements?: string; supportedOS?: string[]; readme?: string; changelog?: string; additionalLinks?: Array<{label:string;url:string}>;
  dependencies: string[]; featured?: boolean; galleryUrls?: string[]; videoUrl?: string; configSettings?: Array<{label:string;key:string;defaultValue?:string}>; ownerId?: string;
};
type Draft = Omit<Mod, 'id' | 'featured' | 'ownerId'>;
declare global {
  interface Window {
    monkeyModManager?: {
      isDesktop: boolean;
      signInWithGitHub: () => Promise<{ok:boolean}>;
      onAuthToken: (callback:(token:string)=>void) => () => void;
      onOpenMod: (callback:(modId:string)=>void) => () => void;
      getGameFolder: () => Promise<string | null>;
      chooseGameFolder: () => Promise<string | null>;
      installMod: (mod: Mod) => Promise<{ ok: boolean; message: string; path?: string }>;
      getInstalledMods: () => Promise<Record<string, string>>;
      getDetectedMods: () => Promise<string[]>;
      listConfigFiles: () => Promise<{ok:boolean;message?:string;files:Array<{name:string;size:number;modified:string}>}>;
      readConfigFile: (name:string) => Promise<{ok:boolean;message?:string;name?:string;content?:string}>;
      writeConfigFile: (payload:{name:string;content:string}) => Promise<{ok:boolean;message:string;path?:string}>;
      saveModConfig: (payload: {modName:string;values:Record<string,string>}) => Promise<{ok:boolean;message:string;path?:string}>;
      installBepInEx: () => Promise<{ ok: boolean; message: string; path?: string }>;
    };
  }
}
const jungleArt = 'https://clan.akamai.steamstatic.com/images/39711486/b59ed47fa032145d3640199a7f610fbb6f0add86.png';
const fallbackMods: Mod[] = [
  { id: 'utilla', name: 'Utilla', author: 'developer9998 & contributors', category: 'Core', description: 'A PC library for Gorilla Tag that supports room-related features and custom gamemodes. Many community mods depend on it.', version: '1.6.27', downloadUrl: 'https://github.com/BRTeamYT/Utilla-GorillaTag/releases/download/1.6.27/Utilla.zip', imageUrl: jungleArt, sourceUrl: 'https://github.com/BRTeamYT/Utilla-GorillaTag/releases', dependencies: [], featured: true },
  { id: 'monkephone', name: 'MonkePhone', author: 'developer9998', category: 'Utility', description: 'An in-game phone and photo tool for capturing moments while you play. Check the upstream page for features and requirements.', version: '1.0.9', downloadUrl: 'https://github.com/developer9998/MonkePhone/releases/download/1.0.9/MonkePhone.dll', imageUrl: 'https://gorilla-tag-mods.com/wp-content/uploads/2025/09/MonkePhone-mod.webp', sourceUrl: 'https://github.com/developer9998/MonkePhone/releases', dependencies: ['Utilla'], featured: true },
  { id: 'ii-stupid', name: 'II stupid', author: 'iiDk-the-actual', category: 'Gameplay', description: 'A community mod menu with many gameplay options. Review its source and use gameplay-changing features only where they are permitted, such as compatible modded/private sessions.', version: '8.3.0', downloadUrl: 'https://sourceforge.net/projects/ii-s-stupid-menu.mirror/files/8.3.0/iis_Stupid_Menu.dll/download', imageUrl: 'https://images.gamebanana.com/img/ss/mods/sgi_sd_image_664cd6e384dd5.webp', sourceUrl: 'https://sourceforge.net/projects/ii-s-stupid-menu.mirror/files/8.3.0/', dependencies: ['Utilla'] }
];
const categories = ['All Mods', 'Core', 'Utility', 'Cosmetic', 'Maps', 'Gameplay', 'Your Mods'];
const blankDraft: Draft = { name: '', author: '', category: 'Utility', description: '', version: '1.0.0', downloadUrl: '', imageUrl: '', sourceUrl: '', websiteUrl: '', embedUrl: '', requirements: '', supportedOS: ['Windows'], readme: '', changelog: '', additionalLinks: [], dependencies: [], galleryUrls: [], videoUrl: '', configSettings: [] };

export default function App() {
  const [mods, setMods] = useState<Mod[]>(fallbackMods);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All Mods');
  const [page, setPage] = useState<'Discover' | 'Library' | 'Configs'>('Discover');
  const [saved, setSaved] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('mmm-saved') || '[]') as string[]; } catch { return []; } });
  const [theme, setTheme] = useState(() => localStorage.getItem('mmm-theme') || 'dark');
  const [detail, setDetail] = useState<Mod | null>(null);
  const [showAppFallback, setShowAppFallback] = useState(false);
  const [useGitHubImport, setUseGitHubImport] = useState(false);
  const [githubImportBusy, setGithubImportBusy] = useState(false);
  const [githubRepoUrl, setGithubRepoUrl] = useState('');
  const [notMyMod, setNotMyMod] = useState(false);
  const [notice, setNotice] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [gameFolder, setGameFolder] = useState<string | null>(null);
  const [installedMods, setInstalledMods] = useState<Record<string, string>>({});
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [account, setAccount] = useState<{id:string;login:string;avatar:string}|null>(null);
  const [accountConfigured, setAccountConfigured] = useState(false);
  const [editingId, setEditingId] = useState<string|null>(null);
  const [configValues, setConfigValues] = useState<Record<string,string>>({});
  const [advancedConfig, setAdvancedConfig] = useState('{}');
  const [detectedMods, setDetectedMods] = useState<string[]>([]);
  const [configFiles, setConfigFiles] = useState<Array<{name:string;size:number;modified:string}>>([]);
  const [selectedConfig, setSelectedConfig] = useState('');
  const [configText, setConfigText] = useState('');
  const [configBusy, setConfigBusy] = useState(false);
  const [configError, setConfigError] = useState('');
  const [renderVariables, setRenderVariables] = useState<Array<{key:string;hasValue:boolean}>>([]);
  const [renderKey, setRenderKey] = useState('ADMIN_PASSWORD');
  const [renderValue, setRenderValue] = useState('');
  const [renderBusy, setRenderBusy] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [showRenderSettings, setShowRenderSettings] = useState(false);
  const desktop = Boolean(window.monkeyModManager && window.monkeyModManager.isDesktop);
  const apiUrl = (path: string) => (desktop ? 'https://monkey-mod-hub.onrender.com' : '') + path;
  const apiFetch = (url: string, init: RequestInit = {}) => {
    const token = localStorage.getItem('mmm-auth-token') || '';
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', 'Bearer ' + token);
    return fetch(url, { ...init, headers, credentials: desktop ? 'omit' : 'same-origin' });
  };
  const refreshAccount = () => apiFetch(apiUrl('/api/account')).then((r) => r.json()).then((data) => {
    setAccount(data.user || null); setAccountConfigured(Boolean(data.configured));
  }).catch(() => {});

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3600); };
  const loadCatalog = async (): Promise<Mod[]> => {
    try {
      const response = await apiFetch(apiUrl('/api/mods'));
      if (!response.ok) throw new Error('Catalog unavailable');
      const data = await response.json() as { mods?: Mod[] };
      if (Array.isArray(data.mods)) { setMods(data.mods); return data.mods; }
    } catch { /* Baked-in fallback keeps local/offline preview usable. */ }
    finally { setLoading(false); }
    return mods;
  };

  useEffect(() => {
    void loadCatalog(); void refreshAccount();
    const handleMessage = (event: MessageEvent) => { if (event.origin === 'https://monkey-mod-hub.onrender.com' && event.data?.type === 'mmm-github-auth-complete') void refreshAccount(); };
    window.addEventListener('message', handleMessage);
    const stopListening = window.monkeyModManager?.onAuthToken((token) => {
      localStorage.setItem('mmm-auth-token', token);
      void refreshAccount();
      notify('Signed in with GitHub.');
    });
    const stopModListening = window.monkeyModManager?.onOpenMod((modId) => {
      void loadCatalog().then((catalog) => {
        const found = catalog.find((mod) => mod.id === modId || mod.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === modId);
        if (found) { setDetail(found); notify('Opened ' + found.name + ' from the web link.'); }
        else notify('That mod was not found in the current catalogue.');
      });
    });
    return () => { window.removeEventListener('message', handleMessage); stopListening?.(); stopModListening?.(); };
  }, []);
  useEffect(() => { localStorage.setItem('mmm-saved', JSON.stringify(saved)); }, [saved]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('mmm-theme', theme); }, [theme]);
  useEffect(() => { setShowAppFallback(false); }, [detail?.id]);
  useEffect(() => {
    if (!detail || !detail.sourceUrl || !/https?:\/\/github\.com\//i.test(detail.sourceUrl) || detail.readme?.trim()) return;
    let active = true;
    const loadGitHubReadme = async () => {
      try {
        const response = await apiFetch(apiUrl('/api/github-import?url=' + encodeURIComponent(detail.sourceUrl!)));
        if (!response.ok) return;
        const data = await response.json() as Partial<Mod> & { readme?: string };
        if (active && data.readme) setDetail(current => current && current.id === detail.id ? { ...current, readme: data.readme || current.readme || '', changelog: current.changelog || data.changelog || '', websiteUrl: current.websiteUrl || data.websiteUrl || '', version: current.version || data.version || '1.0.0' } : current);
      } catch { /* GitHub README is optional; keep the product page usable offline. */ }
    };
    void loadGitHubReadme();
    return () => { active = false; };
  }, [detail?.id, detail?.sourceUrl, detail?.readme]);

  useEffect(() => {
    if (!detail) return;
    try {
      const savedConfig = JSON.parse(localStorage.getItem('mmm-config-' + detail.id) || '{}') as Record<string, unknown>;
      const knownKeys = new Set((detail.configSettings || []).map((item) => item.key));
      const knownValues: Record<string,string> = {};
      for (const item of detail.configSettings || []) {
        const value = savedConfig[item.key];
        if (value !== undefined) knownValues[detail.id + ':' + item.key] = String(value);
      }
      setConfigValues((current) => ({ ...current, ...knownValues }));
      const customValues = Object.fromEntries(Object.entries(savedConfig).filter(([key]) => !knownKeys.has(key)));
      setAdvancedConfig(JSON.stringify(customValues, null, 2));
    } catch { setAdvancedConfig('{}'); }
  }, [detail?.id]);
  useEffect(() => {
    const handleShortcuts = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('modsearch')?.focus();
      }
      if (event.key === 'Escape') {
        setDetail(null);
        setShowAdmin(false);
      }
    };
    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, []);
  useEffect(() => { if (window.monkeyModManager) { void window.monkeyModManager.getGameFolder().then(setGameFolder).catch(() => setGameFolder(null)); void window.monkeyModManager.getInstalledMods().then(setInstalledMods).catch(() => setInstalledMods({})); void window.monkeyModManager.getDetectedMods().then(setDetectedMods).catch(() => setDetectedMods([])); } }, []);
  useEffect(() => {
    if (!desktop) return;
    let lastUpdateSignature = '';
    let active = true;
    const pollUpdates = async (announce: boolean) => {
      try {
        const catalog = await loadCatalog();
        const installed = await window.monkeyModManager!.getInstalledMods();
        if (!active) return;
        setInstalledMods(installed);
        const updates = catalog.filter((mod) => Boolean(installed[mod.id]) && installed[mod.id] !== mod.version);
        const signature = updates.map((mod) => mod.id + ':' + mod.version).sort().join('|');
        if (announce && signature && signature !== lastUpdateSignature) {
          notify('Updates available: ' + updates.map((mod) => mod.name + ' v' + mod.version).join(', ') + '. Use Install update on a mod.');
        }
        lastUpdateSignature = signature;
      } catch { /* A temporary network error should not interrupt installs. */ }
    };
    const initial = window.setTimeout(() => { void pollUpdates(true); }, 8000);
    const interval = window.setInterval(() => { void pollUpdates(true); }, 120000);
    return () => { active = false; window.clearTimeout(initial); window.clearInterval(interval); };
  }, [desktop]);

  const visibleMods = useMemo(() => mods.filter((mod) =>
    (page !== 'Library' || saved.includes(mod.id)) &&
    (category === 'All Mods' || (category === 'Your Mods' ? Boolean(account && mod.ownerId === account.id) : mod.category.toLowerCase() === category.toLowerCase())) &&
    [mod.name, mod.author, mod.category, mod.description].join(' ').toLowerCase().includes(query.toLowerCase())
  ), [mods, page, saved, category, query, account]);

  const toggleSaved = (mod: Mod) => {
    const adding = !saved.includes(mod.id);
    setSaved((current) => adding ? [...current, mod.id] : current.filter((id) => id !== mod.id));
    notify(adding ? mod.name + ' saved to your library' : mod.name + ' removed from your library');
  };

  const openModInApp = (mod: Mod) => {
    if (desktop) { void installMod(mod); return; }
    setShowAppFallback(false);
    window.location.href = 'monkeymodmanager://mod/' + encodeURIComponent(mod.id);
    window.setTimeout(() => setShowAppFallback(true), 5000);
  };

  const installMod = async (mod: Mod) => {
    if (!mod.downloadUrl || !mod.downloadUrl.startsWith('https://')) { notify('This entry has no valid HTTPS download link yet.'); return; }
    if (!desktop) {
      window.open(mod.downloadUrl, '_blank', 'noopener,noreferrer');
      notify('Download opened. Websites cannot write directly into game folders; use the desktop app to install automatically.');
      return;
    }
    try {
      const result = await window.monkeyModManager!.installMod(mod);
      if (result.ok) { const installed = await window.monkeyModManager!.getInstalledMods(); setInstalledMods(installed); setDetectedMods(await window.monkeyModManager!.getDetectedMods()); }
      notify(result.ok ? mod.name + ' installed successfully' : result.message);
    } catch { notify('Install failed. Check the download link and selected Gorilla Tag folder.'); }
  };

  const checkForUpdates = async () => {
    setCheckingUpdates(true);
    try {
      const catalog = await loadCatalog();
      if (desktop) {
        const installed = await window.monkeyModManager!.getInstalledMods();
        setInstalledMods(installed);
        const updates = catalog.filter((mod) => installed[mod.id] && installed[mod.id] !== mod.version);
        notify(updates.length ? updates.length + ' mod update' + (updates.length === 1 ? '' : 's') + ' available.' : 'Update check complete. No updates found for tracked installs.');
      } else {
        notify('Catalogue refreshed. Installed-version checks are available in the desktop app.');
      }
    } catch { notify('Could not check for updates. Please try again.'); }
    finally { setCheckingUpdates(false); }
  };

  const installBepInEx = async () => {
    if (!desktop) {
      window.open('https://github.com/BepInEx/BepInEx/releases', '_blank', 'noopener,noreferrer');
      notify('Opened official BepInEx releases. The website cannot install files into your game folder.');
      return;
    }
    try {
      notify('Downloading official BepInEx 5.4.23.5…');
      const result = await window.monkeyModManager!.installBepInEx();
      notify(result.ok ? 'BepInEx installed. Launch Gorilla Tag once to finish setup.' : result.message);
    } catch { notify('BepInEx installation failed. Check your game folder and internet connection.'); }
  };

  const loadConfigFiles = async () => {
    if (!desktop) { setConfigError('The CFG editor is available in the desktop app only.'); return; }
    setConfigBusy(true); setConfigError('');
    try {
      const result = await window.monkeyModManager!.listConfigFiles();
      if (!result.ok) throw new Error(result.message || 'Could not list config files.');
      setConfigFiles(result.files);
      if (selectedConfig && !result.files.some((file) => file.name === selectedConfig)) { setSelectedConfig(''); setConfigText(''); }
    } catch (error) { setConfigError(error instanceof Error ? error.message : 'Could not list config files.'); }
    finally { setConfigBusy(false); }
  };
  const openConfigFile = async (name: string) => {
    setConfigBusy(true); setConfigError('');
    try {
      const result = await window.monkeyModManager!.readConfigFile(name);
      if (!result.ok) throw new Error(result.message || 'Could not read config file.');
      setSelectedConfig(name); setConfigText(result.content || '');
    } catch (error) { setConfigError(error instanceof Error ? error.message : 'Could not read config file.'); }
    finally { setConfigBusy(false); }
  };
  const saveConfigFile = async () => {
    if (!selectedConfig) return;
    setConfigBusy(true); setConfigError('');
    try {
      const result = await window.monkeyModManager!.writeConfigFile({ name: selectedConfig, content: configText });
      if (!result.ok) throw new Error(result.message || 'Could not save config.');
      notify(result.message); await loadConfigFiles();
    } catch (error) { setConfigError(error instanceof Error ? error.message : 'Could not save config.'); }
    finally { setConfigBusy(false); }
  };
  const loadRenderVariables = async () => {
    setRenderBusy(true); setRenderError('');
    try {
      const response = await apiFetch(apiUrl('/api/admin/render-env'), { headers: { 'x-admin-password': adminPassword } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load Render variables.');
      setRenderVariables(Array.isArray(result.variables) ? result.variables : []);
    } catch (error) { setRenderError(error instanceof Error ? error.message : 'Could not load Render variables.'); }
    finally { setRenderBusy(false); }
  };
  const saveRenderVariable = async (event: FormEvent) => {
    event.preventDefault(); setRenderBusy(true); setRenderError('');
    try {
      const response = await apiFetch(apiUrl('/api/admin/render-env/' + encodeURIComponent(renderKey)), {
        method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ value: renderValue })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save Render variable.');
      setRenderValue('');
      notify(result.message || 'Render variable saved.');
      await loadRenderVariables();
    } catch (error) { setRenderError(error instanceof Error ? error.message : 'Could not save Render variable.'); }
    finally { setRenderBusy(false); }
  };

  const unlockAdmin = async (event: FormEvent) => {
    event.preventDefault(); setAdminBusy(true); setAdminError('');
    try {
      const response = await apiFetch(apiUrl('/api/admin/check'), { method: 'POST', headers: { 'x-admin-password': adminPassword } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Admin password was not accepted.');
      setAdminUnlocked(true);
    } catch (error) { setAdminError(error instanceof Error ? error.message : 'Could not unlock admin tools.'); }
    finally { setAdminBusy(false); }
  };

  const uploadAsset = async (file: File, kind: 'image'|'video'|'mod') => {
    if (!account && !adminUnlocked) throw new Error('Sign in with GitHub or unlock admin tools before uploading files.');
    const base64 = await new Promise<string>((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result||'')); reader.onerror=()=>reject(new Error('Could not read file.')); reader.readAsDataURL(file); });
    const response=await apiFetch(apiUrl('/api/assets'),{method:'POST',headers:{'content-type':'application/json','x-admin-password':adminPassword},body:JSON.stringify({modId:draft.name,fileName:file.name,mime:file.type||(kind==='mod'?'application/octet-stream':''),kind,base64})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Upload failed.');
    return String(data.url);
  };
  const uploadMainImage = async (file: File|undefined) => {
    if(!file)return;setAdminBusy(true);setAdminError('');
    try{const url=await uploadAsset(file,'image');setDraft(current=>({...current,imageUrl:url, galleryUrls:[...(current.galleryUrls||[]).filter(item=>item!==current.imageUrl),url].slice(0,8)}));notify('Main product picture uploaded to GitHub.');}
    catch(error){setAdminError(error instanceof Error?error.message:'Image upload failed.');}finally{setAdminBusy(false);}
  };
  const uploadImages = async (files: FileList|null) => {
    if(!files?.length)return; setAdminBusy(true);setAdminError('');
    try { const urls:string[]=[]; for(const file of Array.from(files).slice(0,8)) urls.push(await uploadAsset(file,'image')); setDraft(current=>({...current,imageUrl:current.imageUrl||urls[0],galleryUrls:[...(current.galleryUrls||[]),...urls].slice(0,8)})); notify(urls.length+' image(s) uploaded to GitHub.'); }
    catch(error){setAdminError(error instanceof Error?error.message:'Image upload failed.');} finally{setAdminBusy(false);}
  };
  const uploadVideo = async (file: File|undefined) => { if(!file)return;setAdminBusy(true);setAdminError('');try{const url=await uploadAsset(file,'video');setDraft(current=>({...current,videoUrl:url}));notify('Video uploaded to GitHub.');}catch(error){setAdminError(error instanceof Error?error.message:'Video upload failed.');}finally{setAdminBusy(false);} };
  const uploadModFile = async (file: File|undefined) => { if(!file)return; if(!/\.(dll|zip)$/i.test(file.name)){setAdminError('Choose a .dll or .zip file.');return;} if(file.size>24*1024*1024){setAdminError('Mod files must be 24 MB or smaller.');return;} setAdminBusy(true);setAdminError('');try{const url=await uploadAsset(file,'mod');const inferredName=file.name.replace(/\.(dll|zip)$/i,'').replace(/[_-]+/g,' ').trim();setDraft(current=>({...current,downloadUrl:url,name:current.name.trim()||inferredName}));notify('Mod file uploaded from disk and hosted on GitHub.');}catch(error){setAdminError(error instanceof Error?error.message:'Mod upload failed.');}finally{setAdminBusy(false);} };
  const beginEdit = (mod: Mod) => {
    setEditingId(mod.id);setDraft({name:mod.name,author:mod.author,category:mod.category,description:mod.description,version:mod.version,downloadUrl:mod.downloadUrl,imageUrl:mod.imageUrl||'',sourceUrl:mod.sourceUrl||'',websiteUrl:mod.websiteUrl||'',embedUrl:mod.embedUrl||'',requirements:mod.requirements||'',supportedOS:mod.supportedOS||[],readme:mod.readme||'',changelog:mod.changelog||'',additionalLinks:mod.additionalLinks||[],dependencies:mod.dependencies||[],galleryUrls:mod.galleryUrls||[],videoUrl:mod.videoUrl||'',configSettings:mod.configSettings||[]});
    setShowAdmin(true);setAdminError('');
  };

  const importFromGitHub = async () => {
    const source = githubRepoUrl.trim();
    if (!source) { setAdminError('Paste a GitHub repository or releases URL into Source / release page first.'); return; }
    setGithubImportBusy(true); setAdminError('');
    try {
      const response = await apiFetch(apiUrl('/api/github-import?url=' + encodeURIComponent(source)));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not import GitHub details.');
      setDraft(current => ({
        ...current,
        name: data.name || current.name,
        author: data.author || current.author,
        description: data.description || current.description,
        version: data.version || current.version,
        downloadUrl: data.downloadUrl || current.downloadUrl,
        sourceUrl: data.sourceUrl || current.sourceUrl,
        websiteUrl: data.websiteUrl || current.websiteUrl,
        readme: data.readme || current.readme,
        changelog: data.changelog || current.changelog,
        dependencies: Array.isArray(data.dependencies) && data.dependencies.length ? data.dependencies : current.dependencies,
        category: data.category || current.category,
        additionalLinks: Array.isArray(data.additionalLinks) && data.additionalLinks.length ? data.additionalLinks : current.additionalLinks
      }));
      notify('Imported GitHub repository details, README and release metadata. Review before saving.');
    } catch (error) { setAdminError(error instanceof Error ? error.message : 'Could not import GitHub details.'); }
    finally { setGithubImportBusy(false); }
  };

  const addMod = async (event: FormEvent) => {
    event.preventDefault(); setAdminBusy(true); setAdminError('');
    try {
      const response = await apiFetch(apiUrl(editingId ? '/api/mods/' + encodeURIComponent(editingId) : '/api/mods'), {
        method: editingId ? 'PUT' : 'POST', headers: { 'content-type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify({ ...draft, sourceUrl: useGitHubImport ? githubRepoUrl.trim() : draft.sourceUrl, transferOwnership: useGitHubImport && notMyMod })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save mod.');
      setDraft(blankDraft); setEditingId(null); setGithubRepoUrl(''); setNotMyMod(false); await loadCatalog(); notify((result.mod && result.mod.name ? result.mod.name : 'Mod') + (editingId ? ' updated.' : ' added to the mod hub.'));
    } catch (error) { setAdminError(error instanceof Error ? error.message : 'Could not save mod.'); }
    finally { setAdminBusy(false); }
  };

  const deleteMod = async (mod: Mod) => {
    if (!window.confirm('Remove ' + mod.name + ' from the public mod hub? This updates GORILA-TAG-MODBASE.')) return;
    setAdminBusy(true); setAdminError('');
    try {
      const response = await apiFetch(apiUrl('/api/mods/' + encodeURIComponent(mod.id)), { method: 'DELETE', headers: { 'x-admin-password': adminPassword } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not remove mod.');
      setMods((current) => current.filter((item) => item.id !== mod.id));
      setSaved((current) => current.filter((id) => id !== mod.id));
      notify(mod.name + ' removed from the hub.');
    } catch (error) { setAdminError(error instanceof Error ? error.message : 'Could not remove mod.'); }
    finally { setAdminBusy(false); }
  };

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-logo">🐒</div><div><b>MONKEY</b><small>MOD HUB <i>V2</i></small></div></div>
      <label className="side-label">WORKSPACE</label>
      <button className={'nav ' + (page === 'Discover' ? 'chosen' : '')} onClick={() => setPage('Discover')}>▦ <span>Discover mods</span></button>
      <button className={'nav ' + (page === 'Library' ? 'chosen' : '')} onClick={() => setPage('Library')}>▣ <span>Your mods</span><b className="count">{saved.length}</b></button>
      {desktop && <button className={'nav ' + (page === 'Configs' ? 'chosen' : '')} onClick={() => { setPage('Configs'); setShowAdmin(false); void loadConfigFiles(); }}>⚙ <span>CFG editor</span></button>}
      <button className={'nav ' + (showAdmin ? 'chosen' : '')} onClick={() => { if (!account) { notify('Sign in with GitHub to add and manage your own mods.'); return; } setShowAdmin((open) => !open); setEditingId(null); setDraft(blankDraft); }}>{showAdmin ? '×' : '＋'} <span>Mod editor</span></button>
      <label className="side-label">CATEGORIES</label>
      {categories.map((item) => <button key={item} className={'nav catnav ' + (category === item ? 'chosen' : '')} onClick={() => setCategory(item)}><i className={'dot ' + item.toLowerCase().replace(' ', '-')} /><span>{item}</span></button>)}
      <div className="sidebottom">
        <div className="status"><i /><span><b>Mod base</b><small>{loading ? 'Loading catalogue…' : mods.length + ' listed mods'}</small></span></div>
        <button className="themebtn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☼' : '☾'} <span>{theme === 'dark' ? 'Light appearance' : 'Dark appearance'}</span><b>↗</b></button>
        <small className="version">MONKEY MOD HUB · V2.1</small>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><span>Workspace <b>/</b> <strong>{showAdmin ? 'Mod editor' : page}</strong></span><div><span className="gamepill"><i /> Gorilla Tag</span><button className="roundbtn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☼' : '☾'}</button><button className="secondary account-button" onClick={()=>{if(account){localStorage.removeItem('mmm-auth-token');void apiFetch(apiUrl('/api/account/logout'),{method:'POST'}).finally(()=>{setAccount(null);notify('Signed out.');});}else if(accountConfigured){if(desktop){void window.monkeyModManager?.signInWithGitHub().catch(()=>notify('Could not open your default browser.'));}else{const popup=window.open(apiUrl('/auth/github'),'mmm-github-signin','popup,width=560,height=760');if(!popup)notify('Allow pop-ups to sign in with GitHub.');}}else{notify('GitHub account login needs OAuth settings in Render.');}}}>{account ? 'Sign out · '+account.login : 'Sign in with GitHub'}</button><span className="avatar">{account?.login?.slice(0,1).toUpperCase()||'M'}</span></div></header>
      <div className="content">
        <section className="hero">
          <div className="eyebrow">✳ &nbsp; THE COMMUNITY MOD HUB</div>
          <h1>Find your next<br /><em>jungle upgrade.</em></h1>
          <p>A simple home for Gorilla Tag PC mods. Browse community tools, see what they do, and download or install from one place.</p>
          <div className="heroactions">
            <button className="primary" onClick={() => { setPage('Discover'); document.getElementById('modsearch')?.focus(); }}>⌕ &nbsp; Explore mods ↗</button>
            <button className="secondary" onClick={() => setPage('Library')}>▣ &nbsp; My library <b>{saved.length}</b></button>
            <button className="secondary update-check" onClick={() => void checkForUpdates()} disabled={checkingUpdates}>↻ &nbsp; {checkingUpdates ? 'Checking…' : 'Check updates'}</button>
            {desktop && <button className="secondary" onClick={async () => { const folder = await window.monkeyModManager!.chooseGameFolder(); setGameFolder(folder); if (folder) {setDetectedMods(await window.monkeyModManager!.getDetectedMods());notify('Gorilla Tag folder saved.');} }}>📁 &nbsp; {gameFolder ? 'Change game folder' : 'Choose game folder'}</button>}
            <button className="secondary bepinex-button" onClick={() => void installBepInEx()}>⬇ &nbsp; Install BepInEx <small>{desktop ? 'Auto setup' : 'Official download'}</small></button>
          </div>
          <div className="hero-art hero-art-photo"><img src={jungleArt} alt="Colourful Gorilla Tag characters in a jungle scene" /><div className="hero-shade" /><div className="float float1">✦ <span><b>Built for the community</b><small>Discover useful add-ons</small></span></div><div className="float float2">↓ <span><b>{mods.length} catalogue entries</b><small>Fed by your mod base</small></span></div></div>
        </section>

        <div className="stats">
          <div><span className="staticon purple">▣</span><small>IN CATALOG</small><b>{String(mods.length).padStart(2, '0')} <i>mods</i></b><label>From your mod base</label></div>
          <div><span className="staticon green">✓</span><small>YOUR LIBRARY</small><b>{String(saved.length).padStart(2, '0')} <i>saved</i></b><label>{saved.length ? 'Collection started' : 'Ready to build'}</label></div>
          <div><span className="staticon orange">↓</span><small>INSTALL OPTIONS</small><b>{desktop ? 'One-click' : 'Downloads'} <i>{desktop ? 'desktop' : 'web'}</i></b><label>{desktop ? (gameFolder ? 'Game folder selected · '+detectedMods.length+' detected' : 'Select game folder') : 'Open downloads safely'}</label></div>
        </div>

        {showAdmin && <section className="admin-panel">
          <div className="admin-heading"><div><h2>{editingId ? 'Edit mod' : 'Mod editor'}</h2><p>Publish a mod or manage your own entries in the catalogue.</p></div></div>
          {!adminUnlocked && !account ? <form className="admin-unlock" onSubmit={unlockAdmin}><label>Admin password<input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} autoComplete="current-password" placeholder="Admin password" required /></label><button className="primary" disabled={adminBusy}>{adminBusy ? 'Checking…' : 'Unlock admin tools'}</button></form> :
          <>
            <div className="admin-manage-heading admin-form-toolbar"><div><h3>{editingId ? 'Edit mod listing' : 'Add a mod'}</h3><p>Fill in the product details below. All optional media fields are visible.</p></div><div className="admin-toolbar-actions"><button className="secondary" type="button" onClick={() => void loadCatalog()} disabled={loading}>↻ Reload</button><button className="secondary" type="button" onClick={() => document.getElementById('add-mod-from-disk')?.click()}>＋ Add mod from disk</button><input id="add-mod-from-disk" className="visually-hidden-file" type="file" accept=".dll,.zip,application/zip" onChange={(event) => { void uploadModFile(event.target.files?.[0]); event.currentTarget.value=''; }} /><button className="secondary" type="button" onClick={() => { setDraft(blankDraft); setEditingId(null); setAdminError(''); }}>＋ New mod</button></div></div>
            <form className="admin-form compact-admin-form add-mod-only-form" onSubmit={addMod}>
              <div className="github-import-box full">
                <label className="github-import-toggle"><input type="checkbox" checked={useGitHubImport} onChange={(e) => { setUseGitHubImport(e.target.checked); if (!e.target.checked) setNotMyMod(false); }} /><span><b>Import a mod from GitHub</b></span></label>
                {useGitHubImport && <div className="github-import-actions"><label>GitHub repository URL<input type="url" pattern="https://github\.com/.+/.+" value={githubRepoUrl} onChange={(e) => setGithubRepoUrl(e.target.value)} placeholder="https://github.com/owner/repository" required /></label><label className="github-import-toggle"><input type="checkbox" checked={notMyMod} onChange={(e) => setNotMyMod(e.target.checked)} /><span><b>I did not make this mod</b><small>Assign ownership to the GitHub repository owner, so they can manage it when they sign in.</small></span></label><button type="button" className="secondary" onClick={() => void importFromGitHub()} disabled={githubImportBusy || !githubRepoUrl.trim()}>{githubImportBusy ? 'Fetching from GitHub…' : '↓ Fetch mod details from GitHub'}</button></div>}
              </div>
              <label>Mod name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required maxLength={90} placeholder="e.g. MonkePhone" /></label>
              <label>Author<input value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} required maxLength={90} placeholder="Creator name" /></label>
              <label>Version<input value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} required maxLength={40} placeholder="1.0.0" /></label>
              <label>Category<select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{categories.filter((item) => item !== 'All Mods' && item !== 'Your Mods').map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="full">Description<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} required maxLength={1400} placeholder="Describe what the mod does" rows={3} /></label>
              <label className="full">Direct download URL (HTTPS)<input type="url" pattern="https://.+" value={draft.downloadUrl} onChange={(e) => setDraft({ ...draft, downloadUrl: e.target.value })} placeholder="https://…/mod.dll or mod.zip" required /></label>
              <label>Picture URL (optional)<input type="url" pattern="https://.+" value={draft.imageUrl || ''} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} placeholder="https://…/cover.webp" /></label>
              <label>Main product picture upload<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e)=>void uploadMainImage(e.target.files?.[0])} /></label>
              <label className="full">Gallery pictures (up to 8)<input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e)=>void uploadImages(e.target.files)} /><small className="form-help">Choose up to 8 images. Gallery uploads are hosted in the mod base.</small></label>
              <label>Product video upload (MP4/WebM, 12 MB max)<input type="file" accept="video/mp4,video/webm" onChange={(e)=>void uploadVideo(e.target.files?.[0])} /></label>
              <label>Video URL (optional)<input type="url" pattern="https://.+" value={draft.videoUrl || ''} onChange={(e) => setDraft({ ...draft, videoUrl: e.target.value })} placeholder="https://…/preview.mp4" /></label>
              <label className="full">Host mod file (.dll/.zip, 24 MB max)<input type="file" accept=".dll,.zip,application/zip" onChange={(e)=>void uploadModFile(e.target.files?.[0])} /><small className="form-help">Select a mod file from disk to host it in the mod base. The hosted URL fills the direct download field.</small></label>
              {!useGitHubImport && <label>Source / release page<input type="url" pattern="https://.+" value={draft.sourceUrl || ''} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} placeholder="https://github.com/creator/project" /></label>}
              <label>Official website (optional)<input type="url" pattern="https://.+" value={draft.websiteUrl || ''} onChange={(e) => setDraft({ ...draft, websiteUrl: e.target.value })} placeholder="https://mod-site.example" /></label>
              <label>Supported operating systems (comma separated)<input value={(draft.supportedOS || []).join(', ')} onChange={(e) => setDraft({ ...draft, supportedOS: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} placeholder="Windows, Linux, Steam Deck" /></label>
              <label>Requirements (game / loader / runtime)<input value={draft.requirements || ''} onChange={(e) => setDraft({ ...draft, requirements: e.target.value })} placeholder="Gorilla Tag PCVR, BepInEx 5" /></label>
              <label className="full">Embedded page URL (optional)<input type="url" pattern="https://.+" value={draft.embedUrl || ''} onChange={(e) => setDraft({ ...draft, embedUrl: e.target.value })} placeholder="https://www.youtube-nocookie.com/embed/VIDEO_ID or a page that permits embedding" /><small className="form-help">Some sites block iframe embeds; source links remain available in the product sidebar.</small></label>
              <label className="full">README / installation notes<textarea value={draft.readme || ''} onChange={(e) => setDraft({ ...draft, readme: e.target.value })} rows={4} placeholder="Install steps, features, usage and compatibility notes" /></label>
              <label className="full">Changelog<textarea value={draft.changelog || ''} onChange={(e) => setDraft({ ...draft, changelog: e.target.value })} rows={3} placeholder="Release notes for this version" /></label>
              <label className="full">Extra sidebar links (one per line: Label | HTTPS URL)<textarea value={(draft.additionalLinks || []).map((link) => link.label + ' | ' + link.url).join('\n')} onChange={(e) => setDraft({ ...draft, additionalLinks: e.target.value.split('\n').map((line) => { const [label, ...parts] = line.split('|'); return {label: label.trim(), url: parts.join('|').trim()}; }).filter((link) => link.label && link.url) })} rows={3} placeholder="Discord | https://discord.gg/example&#10;Wiki | https://example.com/wiki" /></label>
              <label className="full">Dependencies (comma separated)<input value={draft.dependencies.join(', ')} onChange={(e) => setDraft({ ...draft, dependencies: e.target.value.split(',').map((name) => name.trim()).filter(Boolean) })} placeholder="Utilla, BepInEx" /></label>
              <div className="admin-actions full"><button className="primary" disabled={adminBusy}>{adminBusy ? 'Saving…' : editingId ? 'Save changes' : '＋ Add mod'}</button><button type="button" className="secondary" onClick={() => {setDraft(blankDraft);setEditingId(null);setAdminError('');}}>Clear form</button>{account && <button type="button" className="admin-lock" onClick={() => {setShowAdmin(false);setAdminError('');}}>Close</button>}<button type="button" className="admin-lock" onClick={() => { setAdminUnlocked(false); setAdminPassword(''); }}>Lock admin</button></div>
              <p className="form-help full">Only submit files you have permission to distribute. Direct links and media URLs must use HTTPS.</p>
            </form>
            <div className="admin-manage">
              <div className="admin-manage-heading"><h3>Your published mods</h3><span>{mods.filter((mod) => Boolean(account && mod.ownerId === account.id)).length} owned</span></div>
              {mods.filter((mod) => Boolean(account && mod.ownerId === account.id)).map((mod) => <div className="admin-mod-row" key={mod.id}><div><b>{mod.name}</b><small>v{mod.version} · {mod.category}</small></div><div className="admin-mod-actions"><button className="details" type="button" onClick={()=>beginEdit(mod)}>Edit</button><button className="delete-mod" type="button" disabled={adminBusy} onClick={()=>void deleteMod(mod)}>Remove</button></div></div>)}{!mods.some((mod) => Boolean(account && mod.ownerId === account.id)) && <p className="form-help">You haven’t added any mods yet. Use “Add your mod” to publish your first one.</p>}
            </div>
            {adminUnlocked && <section className="render-env-panel">
              <div className="admin-manage-heading"><div><h3>Render environment variables</h3><p>Change service variables such as ADMIN_PASSWORD without exposing existing secret values.</p></div><button className="secondary" type="button" onClick={() => { setShowRenderSettings((value) => !value); if (!showRenderSettings) void loadRenderVariables(); }}>{showRenderSettings ? 'Hide' : 'Manage variables'}</button></div>
              {showRenderSettings && <>
                <div className="render-env-list">{renderVariables.map((variable) => <button type="button" key={variable.key} className={'render-env-chip ' + (renderKey === variable.key ? 'selected' : '')} onClick={() => setRenderKey(variable.key)}><b>{variable.key}</b><small>{variable.hasValue ? 'Value set · hidden' : 'Empty'}</small></button>)}{!renderVariables.length && <p className="cfg-muted">{renderBusy ? 'Loading variables…' : 'No variables listed yet. Add one below or check the Render integration setup.'}</p>}</div>
                <form className="render-env-form" onSubmit={saveRenderVariable}>
                  <label>Variable name<input value={renderKey} onChange={(event) => setRenderKey(event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,''))} pattern="[A-Z][A-Z0-9_]{0,127}" required placeholder="ADMIN_PASSWORD" /></label>
                  <label>New value<input type="password" autoComplete="new-password" value={renderValue} onChange={(event) => setRenderValue(event.target.value)} required maxLength={8000} placeholder="Enter a new value (current value is never shown)" /></label>
                  <button className="primary" disabled={renderBusy || !renderValue}>{renderBusy ? 'Saving…' : 'Save & deploy'}</button>
                </form>
                <p className="cfg-muted">For security, existing values are never sent to the app. Saving a variable requests a Render deployment. Set RENDER_API_KEY and RENDER_SERVICE_ID in Render first.</p>
                {renderError && <div className="admin-error" role="alert">{renderError}</div>}
              </>}
            </section>}
          </>}
          {adminError && <div className="admin-error" role="alert">{adminError}</div>}
        </section>}

        {page === 'Configs' ? <section className="cfg-workspace">
          <div className="cfg-heading"><div><label>LOCAL GAME FILES</label><h2>CFG viewer & editor</h2><p>Edit BepInEx configuration files directly in your Gorilla Tag installation. A .bak backup is created before overwriting an existing file.</p></div><button className="secondary" onClick={() => void loadConfigFiles()} disabled={configBusy}>↻ Refresh files</button></div>
          {!gameFolder && <div className="cfg-empty">Gorilla Tag folder not detected. Use “Choose game folder” on Discover first.</div>}
          <div className="cfg-layout">
            <aside className="cfg-files"><div className="cfg-files-title">BepInEx / config <span>{configFiles.length}</span></div>
              {configFiles.map((file) => <button key={file.name} className={'cfg-file ' + (selectedConfig === file.name ? 'active' : '')} onClick={() => void openConfigFile(file.name)}><b>{file.name}</b><small>{(file.size / 1024).toFixed(1)} KB</small></button>)}
              {!configFiles.length && <p className="cfg-muted">{configBusy ? 'Loading files…' : 'No .cfg files found in BepInEx/config.'}</p>}
            </aside>
            <div className="cfg-editor"><div className="cfg-editor-bar"><b>{selectedConfig || 'Select a configuration file'}</b><button className="primary" disabled={!selectedConfig || configBusy} onClick={() => void saveConfigFile()}>{configBusy ? 'Working…' : 'Save config'}</button></div>
              <textarea className="cfg-textarea" spellCheck={false} value={configText} onChange={(event) => setConfigText(event.target.value)} placeholder="Choose a .cfg file from the list to view and edit its contents…" disabled={!selectedConfig} />
              <p className="cfg-muted">Changes are written to the local game folder. Some mods only reload settings when the game restarts.</p>
            </div>
          </div>
          {configError && <div className="admin-error" role="alert">{configError}</div>}
        </section> : <>
        <div className="sectionhead"><div><label>THE COLLECTION</label><h2>{page === 'Discover' ? 'Explore community mods' : 'Your mods'} <span>{visibleMods.length}</span></h2><p>{page === 'Discover' ? 'Browse the current catalogue and open the source before installing.' : 'Your saved mods, ready when you are.'}</p></div><div className="catalogue-actions"><button className="secondary" onClick={() => void loadCatalog()} disabled={loading}>{loading ? 'Loading…' : '↻ Reload mods'}</button><button className="reset" onClick={() => { setQuery(''); setCategory('All Mods'); }}>⟳ Reset filters</button></div></div>
        <div className="toolbar"><label className="search">⌕ <input id="modsearch" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mods, creators, categories…" />{query && <button onClick={() => setQuery('')}>×</button>}<kbd>Ctrl K</kbd></label><div className="pills">{categories.map((item) => <button key={item} className={category === item ? 'pillactive' : ''} onClick={() => setCategory(item)}>{item === 'All Mods' ? 'All' : item}</button>)}</div></div>

        {visibleMods.length ? <div className="grid">{visibleMods.map((mod) => <article className="modcard" key={mod.id}>
          <div className="mod-picture clickable-product-picture" role="button" tabIndex={0} onClick={() => setDetail(mod)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetail(mod); } }} aria-label={'Open product page for ' + mod.name} style={mod.imageUrl ? { backgroundImage: 'linear-gradient(180deg, #0a110522 0%, #0a1105b5 100%), url("' + mod.imageUrl + '")' } : undefined}>
            <span className="picture-tag">{mod.category}</span>{mod.featured && <span className="featured-tag">✦ Featured</span>}{desktop && detectedMods.some(name=>name.toLowerCase()===mod.name.toLowerCase()||name.toLowerCase()===mod.id.toLowerCase()) && <span className="detected-tag">✓ Detected</span>}<button className="picture-details" onClick={(event) => { event.stopPropagation(); setDetail(mod); }} aria-label={'Open product page for ' + mod.name}>↗</button>{!mod.imageUrl && <b>{mod.name.slice(0, 1).toUpperCase()}</b>}
          </div>
          <div className="card-body">
            <div className="card-title"><div><h3>{mod.name}</h3><p className="author">by <b>{mod.author}</b></p></div><button className={'bookmark ' + (saved.includes(mod.id) ? 'bookmarked' : '')} onClick={() => toggleSaved(mod)} aria-label={saved.includes(mod.id) ? 'Remove saved mod' : 'Save mod'}>{saved.includes(mod.id) ? '♥' : '♡'}</button></div>
            <p className="desc">{mod.description}</p>
            {mod.dependencies.length > 0 && <p className="dependencies"><span>Requires</span> {mod.dependencies.join(', ')}</p>}
            <div className="cardfoot"><span className="version">v{mod.version}</span><button className="install" onClick={() => void installMod(mod)}>{desktop ? (installedMods[mod.id] ? (installedMods[mod.id] === mod.version ? '✓ Installed' : '↻ Install update') : '↓ Install') : '↓ Download'}</button></div>
            <div className="card-links">{mod.sourceUrl && <a href={mod.sourceUrl} target="_blank" rel="noreferrer">Source / releases ↗</a>}{(adminUnlocked || (account && mod.ownerId === account.id)) && <button className="details" onClick={()=>beginEdit(mod)}>Edit</button>}{(adminUnlocked || (account && mod.ownerId === account.id)) && <button className="delete-mod" disabled={adminBusy} onClick={() => void deleteMod(mod)}>Remove</button>}<button className="details" onClick={() => setDetail(mod)}>View details</button></div>
          </div>
        </article>)}</div> : <div className="empty"><div>▣</div><h3>{page === 'Library' ? 'Your mods list is empty' : 'No mods found'}</h3><p>{page === 'Library' ? 'Save mods from Discover to add them to Your mods.' : 'Try a different search or category.'}</p><button className="primary" onClick={() => { setQuery(''); setCategory('All Mods'); setPage('Discover'); }}>Explore mods ↗</button></div>}

        </>}

        <footer><span><b>MONKEY MOD HUB</b> · Community-maintained releases</span><span>Not affiliated with Another Axiom. Use mods responsibly. ✳</span></footer>
      </div>
    </main>

    {detail && <div className="backdrop product-page-backdrop" onClick={() => setDetail(null)}><section className="modal product-page-modal" role="dialog" aria-modal="true" aria-label={detail.name + ' product page'} onClick={(event) => event.stopPropagation()}><button className="modalclose" onClick={() => setDetail(null)}>×</button>
      <div className="detail-picture" style={detail.imageUrl ? { backgroundImage: 'linear-gradient(180deg, #07100611, #071006bb), url("' + detail.imageUrl + '")' } : undefined}>{!detail.imageUrl && <span>🐒</span>}</div>
      <div className="product-page-heading"><div><span className="category">{detail.category}</span><h2>{detail.name}</h2></div><span className="version">v{detail.version}</span></div><p className="author">by {detail.author} · v{detail.version}</p><p className="product-description">{detail.description}</p>
      {(detail.galleryUrls||[]).length>0 && <div className="detail-gallery">{(detail.galleryUrls||[]).map((url,i)=><img key={url+i} src={url} alt={detail.name+' screenshot '+(i+1)} />)}</div>}
      {detail.videoUrl && <video className="mod-video" controls preload="metadata" src={detail.videoUrl} />}
      <div className="product-page-layout">
        <aside className="product-sidebar"><button className="product-side-action primary" onClick={() => void installMod(detail)}>{desktop ? (installedMods[detail.id] && installedMods[detail.id] !== detail.version ? '↻ Update mod' : installedMods[detail.id] === detail.version ? '✓ Reinstall mod' : '↓ Install mod') : '↓ Download mod'}</button>
          {!desktop && <><button className="product-side-action secondary" onClick={() => openModInApp(detail)}>↓ Download in app</button>{showAppFallback && <div className="app-download-fallback"><p>Monkey Mod Manager did not open? Install the desktop app to download and install mods directly.</p><a href="https://github.com/dffdf-sv/Monkey-Mod-Manager-v2/releases/latest" target="_blank" rel="noreferrer">Download app ↗</a></div>}</>}
          <a href={detail.downloadUrl} target="_blank" rel="noreferrer">Direct download ↗</a>
          {detail.sourceUrl && <a href={detail.sourceUrl} target="_blank" rel="noreferrer">Source / releases ↗</a>}
          {detail.websiteUrl && <a href={detail.websiteUrl} target="_blank" rel="noreferrer">Official website ↗</a>}
          {(detail.additionalLinks||[]).map((link,i)=><a key={link.url+i} href={link.url} target="_blank" rel="noreferrer">{link.label} ↗</a>)}
          <div className="product-sidebar-facts"><b>Version</b><span>{detail.version}</span><b>Author</b><span>{detail.author}</span><b>Category</b><span>{detail.category}</span><b>Operating systems</b><span>{(detail.supportedOS||[]).length ? detail.supportedOS!.join(', ') : 'Not specified'}</span><b>Requirements</b><span>{detail.requirements || 'See README / source page'}</span></div>
        </aside>
        <div className="product-page-content">
          <nav className="product-tabs"><a href="#mod-overview">Overview</a>{detail.sourceUrl && /https?:\/\/github\.com\//i.test(detail.sourceUrl) && <a href="#mod-readme">README</a>}<a href="#mod-dependencies">Dependencies</a><a href="#mod-media">Media</a><a href="#mod-changelog">Changelog</a></nav>
          <section id="mod-overview" className="product-info-section"><h3>About this mod</h3><p className="product-description">{detail.description}</p>{detail.requirements && <p><b>Requirements:</b> {detail.requirements}</p>}<div className="product-meta-grid"><div><small>VERSION</small><b>{detail.version}</b></div><div><small>AUTHOR</small><b>{detail.author}</b></div><div><small>CATEGORY</small><b>{detail.category}</b></div><div><small>PLATFORMS</small><b>{(detail.supportedOS||[]).join(', ') || 'Not specified'}</b></div></div></section>
          {detail.sourceUrl && /https?:\/\/github\.com\//i.test(detail.sourceUrl) && <section id="mod-readme" className="product-info-section"><h3>GitHub README & installation</h3>{detail.readme ? <p className="product-longtext">{detail.readme}</p> : <p className="form-help">Fetching README from GitHub… If this repository has no README, check its source page.</p>}</section>}
          <section id="mod-dependencies" className="product-info-section"><h3>Dependencies</h3>{detail.dependencies.length ? <ul className="product-dependencies">{detail.dependencies.map((dep)=><li key={dep}>{dep}</li>)}</ul> : <p className="form-help">No dependencies listed.</p>}</section>
          <section id="mod-media" className="product-info-section"><h3>Screenshots & media</h3>{(detail.galleryUrls||[]).length>0 && <div className="detail-gallery">{(detail.galleryUrls||[]).map((url,i)=><a key={url+i} href={url} target="_blank" rel="noreferrer"><img src={url} alt={detail.name+' screenshot '+(i+1)} /></a>)}</div>}{detail.videoUrl && <video className="mod-video" controls preload="metadata" src={detail.videoUrl} />}{detail.embedUrl && <iframe className="product-embed" src={detail.embedUrl} title={detail.name+' embedded content'} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture; encrypted-media" />}{!(detail.galleryUrls||[]).length && !detail.videoUrl && !detail.embedUrl && <p className="form-help">No extra media supplied.</p>}</section>
          <section id="mod-changelog" className="product-info-section"><h3>Changelog</h3>{detail.changelog ? <p className="product-longtext">{detail.changelog}</p> : <p className="form-help">No changelog supplied.</p>}</section>
        </div>
      </div>
            {!desktop && <p className="web-install-note">In a browser this downloads the file only. The desktop app can install it into your selected Gorilla Tag folder.</p>}
    </section></div>}
    {notice && <div className="toast">✓ &nbsp; {notice}</div>}
  </div>;
}
