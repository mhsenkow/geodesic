import type { AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import pkg from '../../package.json';

export const SETTINGS_SCHEMA_VERSION = 2;
const STORAGE_KEY = 'geodesic-settings-v2';
const LEGACY_STORAGE_KEY = 'geodesic-settings-v1';
const CUSTOM_PRESETS_KEY = 'geodesic-custom-presets-v1';

export interface DesignJsonDocument {
  app?: string;
  version?: string;
  schemaVersion?: number;
  exportedAt?: string;
  settings: Partial<AppSettings>;
  hubs?: unknown[];
  struts?: unknown[];
}

export interface CustomPreset {
  id: string;
  name: string;
  description: string;
  settings: Partial<AppSettings>;
}

function compactEncode(obj: unknown): string {
  return btoa(encodeURIComponent(JSON.stringify(obj)));
}

function compactDecode(encoded: string): unknown {
  return JSON.parse(decodeURIComponent(atob(encoded)));
}

function migrateSettings(raw: Partial<AppSettings> & { schemaVersion?: number }): AppSettings {
  let s = { ...raw };
  if (s.tolX == null) s.tolX = s.tol ?? DEFAULT_SETTINGS.tol;
  if (s.tolY == null) s.tolY = s.tol ?? DEFAULT_SETTINGS.tol;
  if (s.inspectorOpen == null) s.inspectorOpen = false;
  return { ...DEFAULT_SETTINGS, ...s };
}

export function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  return migrateSettings(settings);
}

function decodeShareSettings(): Partial<AppSettings> | null {
  try {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const encoded = params.get('settings') ?? params.get('s');
    if (!encoded) return null;
    const parsed = compactDecode(encoded) as Partial<AppSettings> & { schemaVersion?: number };
    return migrateSettings(parsed);
  } catch {
    return null;
  }
}

export function loadSettings(): AppSettings {
  try {
    const shared = decodeShareSettings();
    if (shared) return normalizeSettings(shared);

    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<AppSettings>;
      return normalizeSettings(parsed);
    }

    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as Partial<AppSettings>;
      const migrated = normalizeSettings(parsed);
      saveSettings(migrated);
      return migrated;
    }

    return { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...settings, schemaVersion: SETTINGS_SCHEMA_VERSION })
    );
  } catch (err) {
    console.warn('Failed to save settings', err);
  }
}

export function clearSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function settingsShareHash(settings: AppSettings): string {
  const payload = { schemaVersion: SETTINGS_SCHEMA_VERSION, ...settings };
  return `s=${compactEncode(payload)}`;
}

export function parseDesignJson(text: string): DesignJsonDocument {
  const doc = JSON.parse(text) as DesignJsonDocument;
  if (!doc.settings || typeof doc.settings !== 'object') {
    throw new Error('Design JSON must include a settings object.');
  }
  return doc;
}

export function importDesignJson(text: string): AppSettings {
  const doc = parseDesignJson(text);
  return normalizeSettings(doc.settings);
}

export function loadCustomPresets(): CustomPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomPreset[];
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: CustomPreset[]): void {
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

export function addCustomPreset(name: string, description: string, settings: AppSettings): CustomPreset {
  const presets = loadCustomPresets();
  const preset: CustomPreset = {
    id: `custom-${Date.now()}`,
    name,
    description,
    settings: { ...settings, presetId: null },
  };
  presets.push(preset);
  saveCustomPresets(presets);
  return preset;
}

export function designJsonMeta() {
  return { app: 'Geodesic Hub Generator', version: pkg.version, schemaVersion: SETTINGS_SCHEMA_VERSION };
}
