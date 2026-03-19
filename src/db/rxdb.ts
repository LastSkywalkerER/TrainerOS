// RxDB database initialization and singleton

import { createRxDatabase, removeRxDatabase, addRxPlugin } from 'rxdb';
import type { RxDatabase, RxCollection, RxStorage } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import {
  clientSchema,
  scheduleTemplateSchema,
  calendarSessionSchema,
  packageSchema,
  paymentSchema,
  paymentAllocationSchema,
} from './schemas';

const DB_NAME = 'trainer_os';

let pluginsInitialized = false;

// RxDB collection types
export type TrainerOSCollections = {
  clients: RxCollection;
  schedule_templates: RxCollection;
  calendar_sessions: RxCollection;
  packages: RxCollection;
  payments: RxCollection;
  payment_allocations: RxCollection;
};

export type TrainerOSDatabase = RxDatabase<TrainerOSCollections>;

let dbPromise: Promise<TrainerOSDatabase> | null = null;

/** Get the database singleton (creates if not exists) */
export function getDb(): Promise<TrainerOSDatabase> {
  if (!dbPromise) {
    dbPromise = initDatabase();
  }
  return dbPromise;
}

/** Initialize plugins (once) */
async function ensurePlugins(): Promise<void> {
  if (pluginsInitialized) return;
  pluginsInitialized = true;
  addRxPlugin(RxDBMigrationSchemaPlugin);
  if (import.meta.env.DEV) {
    const { RxDBDevModePlugin } = await import('rxdb/plugins/dev-mode');
    addRxPlugin(RxDBDevModePlugin);
  }
}

/** Build the storage, wrapping with schema validator in dev mode */
async function getStorage(): Promise<RxStorage<any, any>> {
  const baseStorage = getRxStorageDexie();
  if (import.meta.env.DEV) {
    const { wrappedValidateAjvStorage } = await import('rxdb/plugins/validate-ajv');
    return wrappedValidateAjvStorage({ storage: baseStorage });
  }
  return baseStorage;
}

/** Initialize the RxDB database */
async function initDatabase(): Promise<TrainerOSDatabase> {
  await ensurePlugins();

  const storage = await getStorage();
  const db = await createRxDatabase<TrainerOSCollections>({
    name: DB_NAME,
    storage,
    // ignoreDuplicate is only allowed in dev-mode (for HMR)
    ignoreDuplicate: import.meta.env.DEV,
  });

  await db.addCollections({
    clients: {
      schema: clientSchema,
      migrationStrategies: {
        // Migrate from version 0 to 1: add is_system field (false for existing clients)
        1: (oldDoc: any) => {
          if (oldDoc.is_system === undefined) {
            oldDoc.is_system = false;
          }
          return oldDoc;
        },
      },
    },
    schedule_templates: { schema: scheduleTemplateSchema },
    calendar_sessions: { schema: calendarSessionSchema },
    packages: { schema: packageSchema },
    payments: { schema: paymentSchema },
    payment_allocations: { schema: paymentAllocationSchema },
  });

  return db;
}

/** Destroy and recreate the database (for testing / recovery) */
export async function resetDatabase(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      await db.remove();
    } catch {
      // DB may have failed to open (e.g. schema mismatch) - clear anyway
    }
    dbPromise = null;
  }
  await removeRxDatabase(DB_NAME, getRxStorageDexie());
}
