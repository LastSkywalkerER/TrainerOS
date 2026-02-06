// Data-level migration functions for backup import compatibility
// Each function transforms backup data from one version to the next

import type { BackupData } from '../services/BackupService';

/**
 * Migrate legacy backup format (version "1.0", no dbVersion) to dbVersion 1.
 * The legacy format stored Date objects that were serialized to ISO strings by JSON.stringify.
 * The new format explicitly stores ISO strings. No structural changes needed.
 */
export function migrateDataLegacyToV1(data: BackupData): BackupData {
  return {
    ...data,
    appVersion: data.appVersion || '1.0.0',
    dbVersion: 1,
  };
}

// Chain of migration functions indexed by target version
// Key = target dbVersion, value = migration function from previous version
const migrations: Record<number, (data: BackupData) => BackupData> = {
  // 1: migrateDataV0toV1, // Reserved for future schema changes
};

/**
 * Run all necessary data migrations to bring backup data up to the target version.
 * @param data - The backup data to migrate
 * @param fromVersion - Source dbVersion (0 for legacy)
 * @param toVersion - Target dbVersion
 */
export function migrateBackupData(
  data: BackupData,
  fromVersion: number,
  toVersion: number
): BackupData {
  let migrated = { ...data };

  for (let v = fromVersion + 1; v <= toVersion; v++) {
    const migrationFn = migrations[v];
    if (migrationFn) {
      migrated = migrationFn(migrated);
    }
  }

  migrated.dbVersion = toVersion;
  return migrated;
}
