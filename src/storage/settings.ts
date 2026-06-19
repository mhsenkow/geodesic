import type { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { defaultUnitSystem } from '../units';

const STORAGE_KEY = 'geodesic-settings-v1';

function decodeShareSettings(): Partial<AppSettings> | null {
  try {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const encoded = params.get('settings');
    if (!encoded) return null;
    return JSON.parse(decodeURIComponent(atob(encoded))) as Partial<AppSettings>;
  } catch {
    return null;
  }
}

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  if (settings.tolX == null) merged.tolX = merged.tol;
  if (settings.tolY == null) merged.tolY = merged.tol;
  return merged;
}

export function loadSettings(): AppSettings {
  try {
    const shared = decodeShareSettings();
    if (shared) return normalizeSettings(shared);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, unitSystem: defaultUnitSystem() };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return normalizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or unavailable — ignore
  }
}

export function clearSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function settingsShareHash(settings: AppSettings): string {
  return `settings=${btoa(encodeURIComponent(JSON.stringify(settings)))}`;
}
