import { useState, useEffect } from 'react';

export interface Mod {
  name: string;
  version: string;
  author: string;
  description: string;
  category: string;
  download_url: string;
  dependencies: string[];
}

export const MODS_URL = 'https://raw.githubusercontent.com/dffdf-sv/GORILA-TAG-MODBASE/main/modinfo.Json';

export function useMods() {
  const [mods, setMods] = useState<Mod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMods = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(MODS_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch mods: ${response.statusText}`);
      }
      const text = await response.text();
      // sometimes the JSON might have invisible characters or be malformed. Let's try parsing safely
      const data = JSON.parse(text);
      const raw: unknown[] = Array.isArray(data)
        ? data
        : data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).mods)
          ? (data as Record<string, unknown>).mods as unknown[]
          : null!;

      if (!raw) throw new Error('Invalid format');

      // Drop malformed entries so bad data never reaches the UI
      const valid: Mod[] = raw.filter((entry): entry is Mod => {
        if (!entry || typeof entry !== 'object') return false;
        const e = entry as Record<string, unknown>;
        return (
          typeof e.name === 'string' && e.name.trim() !== '' &&
          typeof e.version === 'string' &&
          typeof e.author === 'string' &&
          typeof e.description === 'string' &&
          typeof e.category === 'string' &&
          typeof e.download_url === 'string' &&
          Array.isArray(e.dependencies)
        );
      });
      setMods(valid);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error fetching mods'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMods();
  }, []);

  return { mods, isLoading, error, refetch: fetchMods };
}
