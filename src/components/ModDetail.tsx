import { useEffect } from 'react';
import { Mod } from '../types';
import styles from './ModDetail.module.css';

interface Props {
  mod: Mod;
  installed: boolean;
  onClose: () => void;
  onToggleInstall: () => void;
  mods: Mod[];
}

export default function ModDetail({ mod, installed, onClose, onToggleInstall, mods }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const depMods = mod.dependencies
    .map((d) => mods.find((m) => m.name === d))
    .filter(Boolean) as Mod[];

  const missingDeps = mod.dependencies.filter((d) => !mods.find((m) => m.name === d));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <div className={styles.nameRow}>
              <h2 className={styles.name}>{mod.name}</h2>
              <span className={styles.version}>v{mod.version}</span>
              {installed && <span className={styles.installedBadge}>Installed</span>}
            </div>
            <p className={styles.author}>by {mod.author}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Description</h4>
            <p className={styles.description}>{mod.description}</p>
          </div>

          <div className={styles.meta}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Category</span>
              <span className={styles.metaValue}>{mod.category}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Version</span>
              <span className={styles.metaValue}>{mod.version}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Author</span>
              <span className={styles.metaValue}>{mod.author}</span>
            </div>
          </div>

          {mod.dependencies.length > 0 && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>Dependencies</h4>
              <div className={styles.depList}>
                {depMods.map((d) => (
                  <div key={d.name} className={styles.depCard}>
                    <span className={styles.depName}>{d.name}</span>
                    <span className={styles.depVersion}>v{d.version}</span>
                  </div>
                ))}
                {missingDeps.map((d) => (
                  <div key={d} className={`${styles.depCard} ${styles.depMissing}`}>
                    <span className={styles.depName}>{d}</span>
                    <span className={styles.depVersion}>not in list</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mod.download_url && mod.download_url !== 'https://github.com' && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>Download</h4>
              <a
                className={styles.downloadLink}
                href={mod.download_url}
                target="_blank"
                rel="noreferrer"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download .dll
              </a>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button
            className={`${styles.installBtn} ${installed ? styles.uninstallBtn : ''}`}
            onClick={onToggleInstall}
          >
            {installed ? 'Uninstall Mod' : 'Install Mod'}
          </button>
          {mod.dependencies.length > 0 && !installed && (
            <p className={styles.depNote}>
              Will also install {mod.dependencies.length} dependenc{mod.dependencies.length === 1 ? 'y' : 'ies'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
