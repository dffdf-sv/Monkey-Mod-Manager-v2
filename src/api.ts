import { Mod } from './types';

const MOD_LIST_URL =
  'https://raw.githubusercontent.com/dffdf-sv/GORILA-TAG-MODBASE/refs/heads/main/modinfo.Json';

export async function fetchMods(): Promise<Mod[]> {
  let res: Response;
  try {
    res = await fetch(MOD_LIST_URL);
  } catch {
    // If direct fetch fails (CORS/network), try cors-anywhere proxy
    res = await fetch(`https://corsproxy.io/?${encodeURIComponent(MOD_LIST_URL)}`);
  }
  if (!res.ok) throw new Error(`Failed to fetch mod list (HTTP ${res.status})`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Unexpected mod list format');
  return data;
}
