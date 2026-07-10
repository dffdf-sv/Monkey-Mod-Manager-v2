import { useState, useEffect, useMemo } from 'react';
import { fetchMods } from './api';
import { Mod } from './types';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ModGrid from './components/ModGrid';
import ModDetail from './components/ModDetail';
import styles from './App.module.css';

export default function App() {
  const [mods, setMods] = useState<Mod[]>([]);
  const [installed, setInstalled] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('installed') || '[]'));
    } catch {
      return new Set();
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedMod, setSelectedMod] = useState<Mod | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'installed'>('all');

  useEffect(() => {
    fetchMods()
      .then(setMods)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem('installed', JSON.stringify([...installed]));
  }, [installed]);

  const categories = useMemo(() => {
    const cats = new Set(mods.map((m) => m.category));
    return ['All', ...Array.from(cats)];
  }, [mods]);

  const filtered = useMemo(() => {
    let list = mods;
    if (activeTab === 'installed') list = list.filter((m) => installed.has(m.name));
    if (activeCategory !== 'All') list = list.filter((m) => m.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.author.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      );
    }
    return list;
  }, [mods, installed, activeCategory, search, activeTab]);

  function toggleInstall(mod: Mod) {
    setInstalled((prev) => {
      const next = new Set(prev);
      if (next.has(mod.name)) {
        next.delete(mod.name);
      } else {
        next.add(mod.name);
        mod.dependencies.forEach((dep) => next.add(dep));
      }
      return next;
    });
  }

  return (
    <div className={styles.layout}>
      <Header
        search={search}
        onSearch={setSearch}
        installedCount={installed.size}
        totalCount={mods.length}
      />
      <div className={styles.body}>
        <Sidebar
          categories={categories}
          activeCategory={activeCategory}
          onCategory={setActiveCategory}
          activeTab={activeTab}
          onTab={setActiveTab}
          installedCount={installed.size}
        />
        <main className={styles.main}>
          <ModGrid
            mods={filtered}
            installed={installed}
            loading={loading}
            error={error}
            onSelect={setSelectedMod}
            onToggleInstall={toggleInstall}
          />
        </main>
      </div>
      {selectedMod && (
        <ModDetail
          mod={selectedMod}
          installed={installed.has(selectedMod.name)}
          onClose={() => setSelectedMod(null)}
          onToggleInstall={() => toggleInstall(selectedMod)}
          mods={mods}
        />
      )}
    </div>
  );
}
