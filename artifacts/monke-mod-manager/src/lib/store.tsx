import React, { createContext, useContext, useState, useEffect } from 'react';

interface ModStore {
  installed: string[];
  enabled: string[];
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  toggleInstalled: (modName: string) => void;
  toggleEnabled: (modName: string) => void;
  clearInstalled: () => void;
}

const ModStoreContext = createContext<ModStore | null>(null);

export function ModStoreProvider({ children }: { children: React.ReactNode }) {
  const [installed, setInstalled] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('monke-installed') || '[]'); } catch { return []; }
  });
  const [enabled, setEnabled] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('monke-enabled') || '[]'); } catch { return []; }
  });
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem('monke-theme') as 'dark' | 'light') || 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => { localStorage.setItem('monke-installed', JSON.stringify(installed)); }, [installed]);
  useEffect(() => { localStorage.setItem('monke-enabled', JSON.stringify(enabled)); }, [enabled]);
  useEffect(() => { 
    localStorage.setItem('monke-theme', theme); 
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  const setTheme = (t: 'dark' | 'light') => setThemeState(t);
  
  const toggleInstalled = (modName: string) => {
    // Capture current installed state synchronously so both updates
    // agree on whether the mod was installed before this click.
    const isCurrentlyInstalled = installed.includes(modName);
    setInstalled(prev =>
      isCurrentlyInstalled ? prev.filter(m => m !== modName) : [...prev, modName]
    );
    setEnabled(prev =>
      isCurrentlyInstalled ? prev.filter(m => m !== modName) : [...prev, modName]
    );
  };

  const toggleEnabled = (modName: string) => {
    setEnabled(prev => {
      if (prev.includes(modName)) return prev.filter(m => m !== modName);
      return [...prev, modName];
    });
  };

  const clearInstalled = () => {
    setInstalled([]);
    setEnabled([]);
  };

  return (
    <ModStoreContext.Provider value={{ installed, enabled, theme, setTheme, toggleInstalled, toggleEnabled, clearInstalled }}>
      {children}
    </ModStoreContext.Provider>
  );
}

export function useModStore() {
  const context = useContext(ModStoreContext);
  if (!context) throw new Error('useModStore must be used within ModStoreProvider');
  return context;
}
