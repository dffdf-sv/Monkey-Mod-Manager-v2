import { Mod } from './types';

const MOD_LIST_URL =
  'https://raw.githubusercontent.com/dffdf-sv/GORILA-TAG-MODBASE/refs/heads/main/modinfo.Json';

export async function fetchMods(): Promise<Mod[]> {
  const res = await fetch(MOD_LIST_URL);
  if (!res.ok) throw new Error(`Failed to fetch mod list: ${res.status}`);
  return res.json();
}
