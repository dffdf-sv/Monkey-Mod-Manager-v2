import styles from './Sidebar.module.css';

interface Props {
  categories: string[];
  activeCategory: string;
  onCategory: (c: string) => void;
  activeTab: 'all' | 'installed';
  onTab: (t: 'all' | 'installed') => void;
  installedCount: number;
}

export default function Sidebar({ categories, activeCategory, onCategory, activeTab, onTab, installedCount }: Props) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.section}>
        <p className={styles.label}>View</p>
        <button
          className={`${styles.tab} ${activeTab === 'all' ? styles.active : ''}`}
          onClick={() => onTab('all')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          All Mods
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'installed' ? styles.active : ''}`}
          onClick={() => onTab('installed')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Installed
          {installedCount > 0 && <span className={styles.badge}>{installedCount}</span>}
        </button>
      </div>

      <div className={styles.section}>
        <p className={styles.label}>Category</p>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`${styles.catBtn} ${activeCategory === cat ? styles.catActive : ''}`}
            onClick={() => onCategory(cat)}
          >
            <span className={styles.catDot} data-cat={cat.toLowerCase()} />
            {cat}
          </button>
        ))}
      </div>
    </aside>
  );
}
