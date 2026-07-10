import { Mod } from '../types';
import styles from './ModCard.module.css';

interface Props {
  mod: Mod;
  installed: boolean;
  onSelect: () => void;
  onToggleInstall: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  core: 'var(--category-core)',
  gameplay: 'var(--category-gameplay)',
  cosmetic: 'var(--category-cosmetic)',
  utility: 'var(--category-utility)',
};

function getCategoryColor(cat: string) {
  return CATEGORY_COLORS[cat.toLowerCase()] ?? 'var(--category-default)';
}

export default function ModCard({ mod, installed, onSelect, onToggleInstall }: Props) {
  return (
    <div className={`${styles.card} ${installed ? styles.installed : ''}`} onClick={onSelect}>
      <div className={styles.top}>
        <div className={styles.info}>
          <div className={styles.nameRow}>
            <h3 className={styles.name}>{mod.name}</h3>
            <span className={styles.version}>v{mod.version}</span>
          </div>
          <p className={styles.author}>by {mod.author}</p>
        </div>
        <span
          className={styles.category}
          style={{ color: getCategoryColor(mod.category), borderColor: getCategoryColor(mod.category) }}
        >
          {mod.category}
        </span>
      </div>

      <p className={styles.description}>{mod.description}</p>

      {mod.dependencies.length > 0 && (
        <div className={styles.deps}>
          <span className={styles.depsLabel}>Requires:</span>
          {mod.dependencies.map((d) => (
            <span key={d} className={styles.dep}>{d}</span>
          ))}
        </div>
      )}

      <div className={styles.footer}>
        <button
          className={`${styles.installBtn} ${installed ? styles.uninstallBtn : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleInstall(); }}
        >
          {installed ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Installed
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Install
            </>
          )}
        </button>
        <button
          className={styles.detailBtn}
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          Details
        </button>
      </div>
    </div>
  );
}
