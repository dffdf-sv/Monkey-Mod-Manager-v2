import { Mod } from '../types';
import ModCard from './ModCard';
import styles from './ModGrid.module.css';

interface Props {
  mods: Mod[];
  installed: Set<string>;
  loading: boolean;
  error: string | null;
  search: string;
  activeTab: 'all' | 'installed';
  onSelect: (mod: Mod) => void;
  onToggleInstall: (mod: Mod) => void;
  onClearSearch: () => void;
}

export default function ModGrid({ mods, installed, loading, error, search, activeTab, onSelect, onToggleInstall, onClearSearch }: Props) {
  if (loading) {
    return (
      <div className={styles.center}>
        <div className={styles.spinner} />
        <p className={styles.hint}>Fetching mod list...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.center}>
        <div className={styles.errorIcon}>!</div>
        <p className={styles.errorText}>Failed to load mods</p>
        <p className={styles.hint}>{error}</p>
      </div>
    );
  }

  if (mods.length === 0) {
    const isInstalledTab = activeTab === 'installed';
    return (
      <div className={styles.center}>
        <div className={styles.emptyIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <p className={styles.errorText}>
          {isInstalledTab && !search ? 'No mods installed yet' : 'No mods found'}
        </p>
        <p className={styles.hint}>
          {isInstalledTab && !search
            ? 'Browse all mods and click Install to get started.'
            : search
            ? `No results for "${search}"`
            : 'Try a different category.'}
        </p>
        {search && (
          <button className={styles.clearBtn} onClick={onClearSearch}>
            Clear search
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {mods.map((mod) => (
        <ModCard
          key={mod.name}
          mod={mod}
          installed={installed.has(mod.name)}
          onSelect={() => onSelect(mod)}
          onToggleInstall={() => onToggleInstall(mod)}
        />
      ))}
    </div>
  );
}
