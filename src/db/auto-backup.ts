// Auto-backup system for pre-migration safety and rollback support
// Stores backups in a separate IndexedDB store

import { APP_VERSION, DB_SCHEMA_VERSION } from './version';

const BACKUP_DB_NAME = 'trainer_os_backups';
const BACKUP_STORE_NAME = 'backups';
const MAX_BACKUPS = 3;

export interface StoredBackup {
  key: string;
  appVersion: string;
  dbVersion: number;
  timestamp: string;
  data: string; // JSON string of backup data
}

/** Open the backup IndexedDB store */
function openBackupDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BACKUP_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BACKUP_STORE_NAME)) {
        db.createObjectStore(BACKUP_STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Save a backup before migration */
export async function saveAutoBackup(jsonData: string): Promise<void> {
  const idb = await openBackupDb();
  const timestamp = new Date().toISOString();
  const key = `${APP_VERSION}_${DB_SCHEMA_VERSION}_${timestamp}`;

  const backup: StoredBackup = {
    key,
    appVersion: APP_VERSION,
    dbVersion: DB_SCHEMA_VERSION,
    timestamp,
    data: jsonData,
  };

  return new Promise((resolve, reject) => {
    const tx = idb.transaction(BACKUP_STORE_NAME, 'readwrite');
    const store = tx.objectStore(BACKUP_STORE_NAME);
    store.put(backup);
    tx.oncomplete = () => {
      idb.close();
      // Prune old backups
      pruneBackups().then(resolve).catch(reject);
    };
    tx.onerror = () => {
      idb.close();
      reject(tx.error);
    };
  });
}

/** List all stored backups sorted by timestamp (newest first) */
export async function listBackups(): Promise<StoredBackup[]> {
  const idb = await openBackupDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(BACKUP_STORE_NAME, 'readonly');
    const store = tx.objectStore(BACKUP_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      idb.close();
      const backups = (request.result as StoredBackup[])
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      resolve(backups);
    };
    request.onerror = () => {
      idb.close();
      reject(request.error);
    };
  });
}

/** Get a specific backup by key */
export async function getBackup(key: string): Promise<StoredBackup | null> {
  const idb = await openBackupDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(BACKUP_STORE_NAME, 'readonly');
    const store = tx.objectStore(BACKUP_STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => {
      idb.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      idb.close();
      reject(request.error);
    };
  });
}

/** Prune old backups keeping only MAX_BACKUPS most recent */
async function pruneBackups(): Promise<void> {
  const backups = await listBackups();
  if (backups.length <= MAX_BACKUPS) return;

  const toDelete = backups.slice(MAX_BACKUPS);
  const idb = await openBackupDb();

  return new Promise((resolve, reject) => {
    const tx = idb.transaction(BACKUP_STORE_NAME, 'readwrite');
    const store = tx.objectStore(BACKUP_STORE_NAME);
    for (const backup of toDelete) {
      store.delete(backup.key);
    }
    tx.oncomplete = () => {
      idb.close();
      resolve();
    };
    tx.onerror = () => {
      idb.close();
      reject(tx.error);
    };
  });
}
