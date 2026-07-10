import { Mod } from '../types';
import ModCard from './ModCard';
import styles from './ModGrid.module.css';

interface Props {
  mods: Mod[];
  installed: Set<string>;
  loading: boolean;
  error: string | null;
  onSelect: (mod: Mod) => void;
  onToggleInstall: (mod: Mod) => void;
}

export default function ModGrid({ mods, installed, loading, error, onSelect, onToggleInstall }: Props) {
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
        <p className={styles.errorText}>{error}</p>
        <p className={styles.hint}>Check your connection and try refreshing.</p>
      </div>
    );
  }

  if (mods.length === 0) {
    return (
      <div className={styles.center}>
        <p className={styles.errorText}>No mods found</p>
        <p className={styles.hint}>Try a different search or category.</p>
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
