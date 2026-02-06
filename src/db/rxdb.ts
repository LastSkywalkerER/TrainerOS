// RxDB database initialization and singleton

import { createRxDatabase, removeRxDatabase, addRxPlugin } from 'rxdb';
import type { RxDatabase, RxCollection, RxStorage } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import {
  clientSchema,
  scheduleTemplateSchema,
  calendarSessionSchema,
  packageSchema,
  paymentSchema,
  paymentAllocationSchema,
} from './schemas';

const DB_NAME = 'trainer_os';

let devModeInitialized = false;

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

/** Initialize dev-mode plugins (once) */
async function ensureDevMode(): Promise<void> {
  if (devModeInitialized || !import.meta.env.DEV) return;
  devModeInitialized = true;
  const { RxDBDevModePlugin } = await import('rxdb/plugins/dev-mode');
  addRxPlugin(RxDBDevModePlugin);
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
  await ensureDevMode();

  const storage = await getStorage();
  const db = await createRxDatabase<TrainerOSCollections>({
    name: DB_NAME,
    storage,
    ignoreDuplicate: true,
  });

  await db.addCollections({
    clients: { schema: clientSchema },
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
    const db = await dbPromise;
    await db.remove();
    dbPromise = null;
    return;
  }
  await removeRxDatabase(DB_NAME, getRxStorageDexie());
}
