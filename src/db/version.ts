// App and database version management

declare const __APP_VERSION__: string;

/** Application version from package.json, injected at build time */
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/** Current database schema version. Increment when schema changes. */
export const DB_SCHEMA_VERSION = 1;

const STORAGE_KEY_APP_VERSION = 'trainer-os-app-version';
const STORAGE_KEY_DB_VERSION = 'trainer-os-db-version';

export interface StoredVersionInfo {
  appVersion: string | null;
  dbVersion: number | null;
}

/** Read last-known versions from localStorage */
export function getStoredVersions(): StoredVersionInfo {
  const appVersion = localStorage.getItem(STORAGE_KEY_APP_VERSION);
  const dbVersionStr = localStorage.getItem(STORAGE_KEY_DB_VERSION);
  const dbVersion = dbVersionStr ? parseInt(dbVersionStr, 10) : null;

  return { appVersion, dbVersion };
}

/** Save current versions to localStorage */
export function saveCurrentVersions(): void {
  localStorage.setItem(STORAGE_KEY_APP_VERSION, APP_VERSION);
  localStorage.setItem(STORAGE_KEY_DB_VERSION, String(DB_SCHEMA_VERSION));
}

/** Check if the app was downgraded (current version < stored version) */
export function isAppDowngraded(): boolean {
  const { appVersion } = getStoredVersions();
  if (!appVersion) return false;
  return compareVersions(APP_VERSION, appVersion) < 0;
}

/** Check if DB migration is needed */
export function isDbMigrationNeeded(): boolean {
  const { dbVersion } = getStoredVersions();
  if (dbVersion === null) return false; // First launch
  return DB_SCHEMA_VERSION > dbVersion;
}

/** Compare semver strings: -1 if a < b, 0 if equal, 1 if a > b */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}
