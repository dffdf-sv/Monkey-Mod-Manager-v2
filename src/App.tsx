import { useEffect, useMemo, useState, type FormEvent } from 'react';
import './fresh.css';
import './hub.css';

type Mod = {
  id: string; name: string; author: string; category: string; description: string;
  version: string; downloadUrl: string; imageUrl?: string; sourceUrl?: string;
  dependencies: string[]; featured?: boolean;
};
type Draft = Omit<Mod, 'id' | 'featured'>;
declare global {
  interface Window {
    monkeyModManager?: {
      isDesktop: boolean;
      getGameFolder: () => Promise<string | null>;
      chooseGameFolder: () => Promise<string | null>;
      installMod: (mod: Mod) => Promise<{ ok: boolean; message: string; path?: string }>;
    };
  }
}
const jungleArt = 'https://clan.akamai.steamstatic.com/images/39711486/b59ed47fa032145d3640199a7f610fbb6f0add86.png';
const fallbackMods: Mod[] = [
  { id: 'utilla', name: 'Utilla', author: 'developer9998 & contributors', category: 'Core', description: 'A PC library for Gorilla Tag that supports room-related features and custom gamemodes. Many community mods depend on it.', version: '1.6.27', downloadUrl: 'https://github.com/BRTeamYT/Utilla-GorillaTag/releases/download/1.6.27/Utilla.zip', imageUrl: jungleArt, sourceUrl: 'https://github.com/BRTeamYT/Utilla-GorillaTag/releases', dependencies: [], featured: true },
  { id: 'monkephone', name: 'MonkePhone', author: 'developer9998', category: 'Utility', description: 'An in-game phone and photo tool for capturing moments while you play. Check the upstream page for features and requirements.', version: '1.0.9', downloadUrl: 'https://github.com/developer9998/MonkePhone/releases/download/1.0.9/MonkePhone.dll', imageUrl: 'https://gorilla-tag-mods.com/wp-content/uploads/2025/09/MonkePhone-mod.webp', sourceUrl: 'https://github.com/developer9998/MonkePhone/releases', dependencies: ['Utilla'], featured: true },
  { id: 'ii-stupid', name: 'II stupid', author: 'iiDk-the-actual', category: 'Gameplay', description: 'A community mod menu with many gameplay options. Review its source and use gameplay-changing features only where they are permitted, such as compatible modded/private sessions.', version: '8.3.0', downloadUrl: 'https://sourceforge.net/projects/ii-s-stupid-menu.mirror/files/8.3.0/iis_Stupid_Menu.dll/download', imageUrl: 'https://images.gamebanana.com/img/ss/mods/sgi_sd_image_664cd6e384dd5.webp', sourceUrl: 'https://sourceforge.net/projects/ii-s-stupid-menu.mirror/files/8.3.0/', dependencies: ['Utilla'] }
];
const categories = ['All Mods', 'Core', 'Utility', 'Cosmetic', 'Maps', 'Gameplay'];
const blankDraft: Draft = { name: '', author: '', category: 'Utility', description: '', version: '1.0.0', downloadUrl: '', imageUrl: '', sourceUrl: '', dependencies: [] };

export default function App() {
  const [mods, setMods] = useState<Mod[]>(fallbackMods);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All Mods');
  const [page, setPage] = useState<'Discover' | 'Library'>('Discover');
  const [saved, setSaved] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('mmm-saved') || '[]') as string[]; } catch { return []; } });
  const [theme, setTheme] = useState(() => localStorage.getItem('mmm-theme') || 'dark');
  const [detail, setDetail] = useState<Mod | null>(null);
  const [notice, setNotice] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [gameFolder, setGameFolder] = useState<string | null>(null);
  const desktop = Boolean(window.monkeyModManager && window.monkeyModManager.isDesktop);
  const apiUrl = (path: string) => (desktop ? 'https://monkey-mod-hub.onrender.com' : '') + path;

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3600); };
  const loadCatalog = async () => {
    try {
      const response = await fetch(apiUrl('/api/mods'));
      if (!response.ok) throw new Error('Catalog unavailable');
      const data = await response.json() as { mods?: Mod[] };
      if (Array.isArray(data.mods)) setMods(data.mods);
    } catch { /* Baked-in fallback keeps local/offline preview usable. */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadCatalog(); }, []);
  useEffect(() => { localStorage.setItem('mmm-saved', JSON.stringify(saved)); }, [saved]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('mmm-theme', theme); }, [theme]);
  useEffect(() => { if (window.monkeyModManager) void window.monkeyModManager.getGameFolder().then(setGameFolder).catch(() => setGameFolder(null)); }, []);

  const visibleMods = useMemo(() => mods.filter((mod) =>
    (page !== 'Library' || saved.includes(mod.id)) &&
    (category === 'All Mods' || mod.category.toLowerCase() === category.toLowerCase()) &&
    [mod.name, mod.author, mod.category, mod.description].join(' ').toLowerCase().includes(query.toLowerCase())
  ), [mods, page, saved, category, query]);

  const toggleSaved = (mod: Mod) => {
    const adding = !saved.includes(mod.id);
    setSaved((current) => adding ? [...current, mod.id] : current.filter((id) => id !== mod.id));
    notify(adding ? mod.name + ' saved to your library' : mod.name + ' removed from your library');
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
      notify(result.ok ? mod.name + ' installed successfully' : result.message);
    } catch { notify('Install failed. Check the download link and selected Gorilla Tag folder.'); }
  };

  const unlockAdmin = async (event: FormEvent) => {
    event.preventDefault(); setAdminBusy(true); setAdminError('');
    try {
      const response = await fetch(apiUrl('/api/admin/check'), { method: 'POST', headers: { 'x-admin-password': adminPassword } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Admin password was not accepted.');
      setAdminUnlocked(true);
    } catch (error) { setAdminError(error instanceof Error ? error.message : 'Could not unlock admin tools.'); }
    finally { setAdminBusy(false); }
  };

  const addMod = async (event: FormEvent) => {
    event.preventDefault(); setAdminBusy(true); setAdminError('');
    try {
      const response = await fetch(apiUrl('/api/mods'), {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-password': adminPassword },
        body: JSON.stringify(draft)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save mod.');
      setDraft(blankDraft); await loadCatalog(); notify((result.mod && result.mod.name ? result.mod.name : 'Mod') + ' added to the mod hub.');
    } catch (error) { setAdminError(error instanceof Error ? error.message : 'Could not save mod.'); }
    finally { setAdminBusy(false); }
  };

  const deleteMod = async (mod: Mod) => {
    if (!window.confirm('Remove ' + mod.name + ' from the public mod hub? This updates GORILA-TAG-MODBASE.')) return;
    setAdminBusy(true); setAdminError('');
    try {
      const response = await fetch(apiUrl('/api/mods/' + encodeURIComponent(mod.id)), { method: 'DELETE', headers: { 'x-admin-password': adminPassword } });
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
      <button className={'nav ' + (page === 'Library' ? 'chosen' : '')} onClick={() => setPage('Library')}>▣ <span>My library</span><b className="count">{saved.length}</b></button>
      <label className="side-label">CATEGORIES</label>
      {categories.map((item) => <button key={item} className={'nav catnav ' + (category === item ? 'chosen' : '')} onClick={() => setCategory(item)}><i className={'dot ' + item.toLowerCase().replace(' ', '-')} /><span>{item}</span></button>)}
      <div className="sidebottom">
        <div className="status"><i /><span><b>Mod base</b><small>{loading ? 'Loading catalogue…' : mods.length + ' listed mods'}</small></span></div>
        <button className="themebtn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☼' : '☾'} <span>{theme === 'dark' ? 'Light appearance' : 'Dark appearance'}</span><b>↗</b></button>
        <button className="admin-nav" onClick={() => setShowAdmin((open) => !open)}>{showAdmin ? '×' : '⚙'} <span>{showAdmin ? 'Close admin tools' : 'Admin · Add mods'}</span></button>
        <small className="version">MONKEY MOD HUB · V2.1</small>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><span>Workspace <b>/</b> <strong>{showAdmin ? 'Mod curator' : page}</strong></span><div><span className="gamepill"><i /> Gorilla Tag</span><button className="roundbtn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☼' : '☾'}</button><span className="avatar">M</span></div></header>
      <div className="content">
        <section className="hero">
          <div className="eyebrow">✳ &nbsp; THE COMMUNITY MOD HUB</div>
          <h1>Find your next<br /><em>jungle upgrade.</em></h1>
          <p>A simple home for Gorilla Tag PC mods. Browse community tools, see what they do, and download or install from one place.</p>
          <div className="heroactions">
            <button className="primary" onClick={() => { setPage('Discover'); document.getElementById('modsearch')?.focus(); }}>⌕ &nbsp; Explore mods ↗</button>
            <button className="secondary" onClick={() => setPage('Library')}>▣ &nbsp; My library <b>{saved.length}</b></button>
            {desktop && <button className="secondary" onClick={async () => { const folder = await window.monkeyModManager!.chooseGameFolder(); setGameFolder(folder); if (folder) notify('Gorilla Tag folder saved.'); }}>📁 &nbsp; {gameFolder ? 'Change game folder' : 'Choose game folder'}</button>}
          </div>
          <div className="hero-art hero-art-photo"><img src={jungleArt} alt="Colourful Gorilla Tag characters in a jungle scene" /><div className="hero-shade" /><div className="float float1">✦ <span><b>Built for the community</b><small>Discover useful add-ons</small></span></div><div className="float float2">↓ <span><b>{mods.length} catalogue entries</b><small>Fed by your mod base</small></span></div></div>
        </section>

        <div className="stats">
          <div><span className="staticon purple">▣</span><small>IN CATALOG</small><b>{String(mods.length).padStart(2, '0')} <i>mods</i></b><label>From your mod base</label></div>
          <div><span className="staticon green">✓</span><small>YOUR LIBRARY</small><b>{String(saved.length).padStart(2, '0')} <i>saved</i></b><label>{saved.length ? 'Collection started' : 'Ready to build'}</label></div>
          <div><span className="staticon orange">↓</span><small>INSTALL OPTIONS</small><b>{desktop ? 'One-click' : 'Downloads'} <i>{desktop ? 'desktop' : 'web'}</i></b><label>{desktop ? (gameFolder ? 'Game folder selected' : 'Select game folder') : 'Open downloads safely'}</label></div>
        </div>

        {showAdmin && <section className="admin-panel">
          <div className="admin-heading"><div><label>CURATOR TOOLS</label><h2>Add a mod to the hub</h2><p>New entries are saved back into <b>GORILA-TAG-MODBASE</b> on GitHub.</p></div><span className="admin-pill">🔒 Admin only</span></div>
          {!adminUnlocked ? <form className="admin-unlock" onSubmit={unlockAdmin}><label>Admin password<input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} autoComplete="current-password" placeholder="Enter Render ADMIN_PASSWORD" required /></label><button className="primary" disabled={adminBusy}>{adminBusy ? 'Checking…' : 'Unlock admin tools'}</button></form> :
          <form className="admin-form" onSubmit={addMod}>
            <label>Mod name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required maxLength={90} placeholder="e.g. My new mod" /></label>
            <label>Author<input value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} required maxLength={90} placeholder="Creator name" /></label>
            <label>Version<input value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} required maxLength={40} placeholder="1.0.0" /></label>
            <label>Category<select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{categories.filter((item) => item !== 'All Mods').map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="full">Description<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} required maxLength={1400} placeholder="What does this mod do? Mention known requirements." rows={3} /></label>
            <label className="full">Direct download URL (HTTPS)<input type="url" value={draft.downloadUrl} onChange={(e) => setDraft({ ...draft, downloadUrl: e.target.value })} required placeholder="https://…/mod.dll or mod.zip" /></label>
            <label>Picture URL (optional)<input type="url" value={draft.imageUrl || ''} onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })} placeholder="https://…/thumbnail.webp" /></label>
            <label>Source / release page<input type="url" value={draft.sourceUrl || ''} onChange={(e) => setDraft({ ...draft, sourceUrl: e.target.value })} placeholder="https://github.com/creator/project" /></label>
            <label className="full">Dependencies (comma separated)<input value={draft.dependencies.join(', ')} onChange={(e) => setDraft({ ...draft, dependencies: e.target.value.split(',').map((name) => name.trim()).filter(Boolean) })} placeholder="Utilla, BepInEx" /></label>
            <div className="admin-actions full"><button className="primary" disabled={adminBusy}>{adminBusy ? 'Saving…' : '＋ Publish mod'}</button><button type="button" className="secondary" onClick={() => setDraft(blankDraft)}>Clear form</button><button type="button" className="admin-lock" onClick={() => { setAdminUnlocked(false); setAdminPassword(''); }}>Lock admin</button></div>
            <p className="form-help full">Only add mods you have permission to distribute. Use official releases and image URLs. The server validates HTTPS links; it does not upload mod binaries.</p>
          </form>}
          {adminError && <div className="admin-error" role="alert">{adminError}</div>}
        </section>}

        <div className="sectionhead"><div><label>THE COLLECTION</label><h2>{page === 'Discover' ? 'Explore community mods' : 'Your saved library'} <span>{visibleMods.length}</span></h2><p>{page === 'Discover' ? 'Browse the current catalogue and open the source before installing.' : 'Your saved mods, ready when you are.'}</p></div><button className="reset" onClick={() => { setQuery(''); setCategory('All Mods'); }}>⟳ Reset filters</button></div>
        <div className="toolbar"><label className="search">⌕ <input id="modsearch" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mods, creators, categories…" />{query && <button onClick={() => setQuery('')}>×</button>}<kbd>⌘ K</kbd></label><div className="pills">{categories.map((item) => <button key={item} className={category === item ? 'pillactive' : ''} onClick={() => setCategory(item)}>{item === 'All Mods' ? 'All' : item}</button>)}</div></div>

        {visibleMods.length ? <div className="grid">{visibleMods.map((mod) => <article className="modcard" key={mod.id}>
          <div className="mod-picture" style={mod.imageUrl ? { backgroundImage: 'linear-gradient(180deg, #0a110522 0%, #0a1105b5 100%), url("' + mod.imageUrl + '")' } : undefined}>
            <span className="picture-tag">{mod.category}</span>{mod.featured && <span className="featured-tag">✦ Featured</span>}<button className="picture-details" onClick={() => setDetail(mod)} aria-label={'Details for ' + mod.name}>↗</button>{!mod.imageUrl && <b>{mod.name.slice(0, 1).toUpperCase()}</b>}
          </div>
          <div className="card-body">
            <div className="card-title"><div><h3>{mod.name}</h3><p className="author">by <b>{mod.author}</b></p></div><button className={'bookmark ' + (saved.includes(mod.id) ? 'bookmarked' : '')} onClick={() => toggleSaved(mod)} aria-label={saved.includes(mod.id) ? 'Remove saved mod' : 'Save mod'}>{saved.includes(mod.id) ? '♥' : '♡'}</button></div>
            <p className="desc">{mod.description}</p>
            {mod.dependencies.length > 0 && <p className="dependencies"><span>Requires</span> {mod.dependencies.join(', ')}</p>}
            <div className="cardfoot"><span className="version">v{mod.version}</span><button className="install" onClick={() => void installMod(mod)}>{desktop ? '↓ Install' : '↓ Download'}</button></div>
            <div className="card-links">{mod.sourceUrl && <a href={mod.sourceUrl} target="_blank" rel="noreferrer">Source / releases ↗</a>}{adminUnlocked && <button className="delete-mod" disabled={adminBusy} onClick={() => void deleteMod(mod)}>Remove</button>}<button className="details" onClick={() => setDetail(mod)}>View details</button></div>
          </div>
        </article>)}</div> : <div className="empty"><div>▣</div><h3>{page === 'Library' ? 'Your library is a blank canvas' : 'No mods found'}</h3><p>{page === 'Library' ? 'Save mods from Discover to get started.' : 'Try a different search or category.'}</p><button className="primary" onClick={() => { setQuery(''); setCategory('All Mods'); setPage('Discover'); }}>Explore mods ↗</button></div>}

        <footer><span><b>MONKEY MOD HUB</b> · Community-maintained releases</span><span>Not affiliated with Another Axiom. Use mods responsibly. ✳</span></footer>
      </div>
    </main>

    {detail && <div className="backdrop" onClick={() => setDetail(null)}><section className="modal" onClick={(event) => event.stopPropagation()}><button className="modalclose" onClick={() => setDetail(null)}>×</button>
      <div className="detail-picture" style={detail.imageUrl ? { backgroundImage: 'linear-gradient(180deg, #07100611, #071006bb), url("' + detail.imageUrl + '")' } : undefined}>{!detail.imageUrl && <span>🐒</span>}</div>
      <span className="category">{detail.category}</span><h2>{detail.name}</h2><p className="author">by {detail.author} · v{detail.version}</p><p>{detail.description}</p>
      {detail.dependencies.length > 0 && <div className="warning">ⓘ <span><b>Required dependencies</b><small>{detail.dependencies.join(', ')}. Install prerequisites before this mod.</small></span></div>}
      <div className="modal-links">{detail.sourceUrl && <a href={detail.sourceUrl} target="_blank" rel="noreferrer">Open official source ↗</a>}<a href={detail.downloadUrl} target="_blank" rel="noreferrer">Open download link ↗</a></div>
      <button className="primary wide" onClick={() => void installMod(detail)}>{desktop ? '↓ Install mod' : '↓ Download mod'}</button>
      {!desktop && <p className="web-install-note">In a browser this downloads the file only. The desktop app can install it into your selected Gorilla Tag folder.</p>}
    </section></div>}
    {notice && <div className="toast">✓ &nbsp; {notice}</div>}
  </div>;
}
