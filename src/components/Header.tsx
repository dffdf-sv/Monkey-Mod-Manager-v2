import styles from './Header.module.css';

interface Props {
  search: string;
  onSearch: (v: string) => void;
  installedCount: number;
  totalCount: number;
}

export default function Header({ search, onSearch, installedCount, totalCount }: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.logo}>🐒</span>
        <div>
          <h1 className={styles.title}>Monkey Mod Manager</h1>
          <p className={styles.subtitle}>Gorilla Tag mod loader</p>
        </div>
      </div>
      <div className={styles.center}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            className={styles.search}
            type="text"
            placeholder="Search mods..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          {search && (
            <button className={styles.clearBtn} onClick={() => onSearch('')}>✕</button>
          )}
        </div>
      </div>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{totalCount}</span>
          <span className={styles.statLabel}>Available</span>
        </div>
        <div className={styles.divider} />
        <div className={styles.stat}>
          <span className={styles.statNum} style={{ color: 'var(--success)' }}>{installedCount}</span>
          <span className={styles.statLabel}>Installed</span>
        </div>
      </div>
    </header>
  );
}
