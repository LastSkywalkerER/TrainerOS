// One-time migration from old Dexie TrainerOS database to RxDB
// This reads all data from the legacy Dexie DB and inserts it into RxDB collections

import Dexie from 'dexie';
import type { TrainerOSDatabase } from './rxdb';
import { toDbDate, stripUndefined } from './dateHelpers';
import { saveAutoBackup } from './auto-backup';
import { APP_VERSION } from './version';
import type { BackupData } from '../services/BackupService';

const MIGRATION_FLAG = 'trainer-os-dexie-migrated';

function toDate(v: any): Date {
  return v instanceof Date ? v : new Date(v || Date.now());
}

/** Export legacy Dexie data to BackupData format (dbVersion 0) */
async function exportDexieToBackupData(legacyDb: Dexie): Promise<BackupData> {
  const [clients, templates, sessions, packages, payments, allocations] = await Promise.all([
    legacyDb.table('clients').toArray(),
    legacyDb.table('scheduleTemplates').toArray(),
    legacyDb.table('calendarSessions').toArray(),
    legacyDb.table('packages').toArray(),
    legacyDb.table('payments').toArray(),
    legacyDb.table('paymentAllocations').toArray(),
  ]);

  return {
    version: '2.0',
    appVersion: APP_VERSION,
    dbVersion: 0,
    exportDate: new Date().toISOString(),
    clients: clients.map((c: any) => ({
      id: c.id,
      full_name: c.full_name,
      phone: c.phone,
      telegram: c.telegram,
      notes: c.notes,
      status: c.status,
      start_date: toDate(c.start_date || c.created_at),
      pause_from: c.pause_from ? toDate(c.pause_from) : undefined,
      pause_to: c.pause_to ? toDate(c.pause_to) : undefined,
      archive_date: c.archive_date ? toDate(c.archive_date) : undefined,
      created_at: toDate(c.created_at),
      updated_at: toDate(c.updated_at),
    })),
    scheduleTemplates: templates.map((t: any) => ({
      id: t.id,
      client_id: t.client_id,
      timezone: t.timezone,
      rules: t.rules,
      generation_horizon_days: t.generation_horizon_days,
      valid_from: t.valid_from ? toDate(t.valid_from) : undefined,
      valid_to: t.valid_to ? toDate(t.valid_to) : undefined,
      created_at: toDate(t.created_at),
      updated_at: toDate(t.updated_at),
    })),
    calendarSessions: sessions.map((s: any) => ({
      id: s.id,
      client_id: s.client_id,
      date: s.date,
      start_time: s.start_time,
      status: s.status,
      template_rule_id: s.template_rule_id,
      is_custom: s.is_custom,
      is_edited: s.is_edited,
      price_override: s.price_override,
      notes: s.notes,
      created_at: toDate(s.created_at),
      updated_at: toDate(s.updated_at),
    })),
    packages: packages.map((p: any) => ({
      id: p.id,
      client_id: p.client_id,
      title: p.title,
      total_price: p.total_price,
      sessions_count: p.sessions_count,
      allocation_mode: p.allocation_mode,
      status: p.status,
      valid_from: p.valid_from ? toDate(p.valid_from) : undefined,
      valid_until: p.valid_until ? toDate(p.valid_until) : undefined,
      created_at: toDate(p.created_at),
      updated_at: toDate(p.updated_at),
    })),
    payments: payments.map((p: any) => ({
      id: p.id,
      client_id: p.client_id,
      paid_at: toDate(p.paid_at),
      amount: p.amount,
      method: p.method,
      comment: p.comment,
      created_at: toDate(p.created_at),
      updated_at: toDate(p.updated_at),
    })),
    paymentAllocations: allocations.map((a: any) => ({
      id: a.id,
      payment_id: a.payment_id,
      session_id: a.session_id,
      allocated_amount: a.allocated_amount,
      created_at: toDate(a.created_at),
    })),
  };
}

/** Check if migration from Dexie has already been completed */
export function isDexieMigrated(): boolean {
  return localStorage.getItem(MIGRATION_FLAG) === 'true';
}

/** Perform one-time migration from legacy Dexie DB to RxDB */
export async function migrateDexieToRxDB(rxdb: TrainerOSDatabase): Promise<void> {
  if (isDexieMigrated()) {
    return;
  }

  // Check if the old Dexie database exists
  const databases = await Dexie.getDatabaseNames();
  if (!databases.includes('TrainerOS')) {
    // No legacy database, mark as migrated and skip
    localStorage.setItem(MIGRATION_FLAG, 'true');
    return;
  }

  console.log('[Migration] Starting Dexie -> RxDB migration...');

  // Open old Dexie database with the latest known schema
  const legacyDb = new Dexie('TrainerOS');
  legacyDb.version(5).stores({
    clients: 'id, status, full_name',
    scheduleTemplates: 'id, client_id',
    calendarSessions: 'id, client_id, date, status, [client_id+date]',
    packages: 'id, client_id, status',
    payments: 'id, client_id, paid_at',
    paymentAllocations: 'id, payment_id, session_id, [payment_id+session_id]',
  });

  try {
    await legacyDb.open();

    // Create pre-migration backup so user can restore/rollback via Settings
    try {
      const backupData = await exportDexieToBackupData(legacyDb);
      await saveAutoBackup(JSON.stringify(backupData, null, 2));
      console.log('[Migration] Pre-migration backup saved (legacy Dexie data)');
    } catch (e) {
      console.error('[Migration] Failed to save pre-migration backup:', e);
    }

    // Migrate clients
    const clients = await legacyDb.table('clients').toArray();
    if (clients.length > 0) {
      const docs = clients.map((c: any) => stripUndefined({
        id: c.id,
        full_name: c.full_name,
        phone: c.phone || undefined,
        telegram: c.telegram || undefined,
        notes: c.notes || undefined,
        status: c.status,
        is_system: false, // Legacy clients are never system clients
        start_date: toDbDate(c.start_date instanceof Date ? c.start_date : new Date(c.start_date || c.created_at)),
        pause_from: c.pause_from ? toDbDate(c.pause_from instanceof Date ? c.pause_from : new Date(c.pause_from)) : undefined,
        pause_to: c.pause_to ? toDbDate(c.pause_to instanceof Date ? c.pause_to : new Date(c.pause_to)) : undefined,
        archive_date: c.archive_date ? toDbDate(c.archive_date instanceof Date ? c.archive_date : new Date(c.archive_date)) : undefined,
        created_at: toDbDate(c.created_at instanceof Date ? c.created_at : new Date(c.created_at)),
        updated_at: toDbDate(c.updated_at instanceof Date ? c.updated_at : new Date(c.updated_at)),
      }));
      await rxdb.clients.bulkInsert(docs);
      console.log(`[Migration] Migrated ${docs.length} clients`);
    }

    // Migrate schedule templates
    const templates = await legacyDb.table('scheduleTemplates').toArray();
    if (templates.length > 0) {
      const docs = templates.map((t: any) => stripUndefined({
        id: t.id,
        client_id: t.client_id,
        timezone: t.timezone,
        rules: t.rules,
        generation_horizon_days: t.generation_horizon_days,
        valid_from: t.valid_from ? toDbDate(t.valid_from instanceof Date ? t.valid_from : new Date(t.valid_from)) : undefined,
        valid_to: t.valid_to ? toDbDate(t.valid_to instanceof Date ? t.valid_to : new Date(t.valid_to)) : undefined,
        created_at: toDbDate(t.created_at instanceof Date ? t.created_at : new Date(t.created_at)),
        updated_at: toDbDate(t.updated_at instanceof Date ? t.updated_at : new Date(t.updated_at)),
      }));
      await rxdb.schedule_templates.bulkInsert(docs);
      console.log(`[Migration] Migrated ${docs.length} schedule templates`);
    }

    // Migrate calendar sessions
    const sessions = await legacyDb.table('calendarSessions').toArray();
    if (sessions.length > 0) {
      const docs = sessions.map((s: any) => stripUndefined({
        id: s.id,
        client_id: s.client_id,
        date: s.date,
        start_time: s.start_time,
        status: s.status,
        template_rule_id: s.template_rule_id || undefined,
        is_custom: s.is_custom,
        is_edited: s.is_edited || undefined,
        price_override: s.price_override !== undefined && s.price_override !== null ? s.price_override : undefined,
        notes: s.notes || undefined,
        created_at: toDbDate(s.created_at instanceof Date ? s.created_at : new Date(s.created_at)),
        updated_at: toDbDate(s.updated_at instanceof Date ? s.updated_at : new Date(s.updated_at)),
      }));
      await rxdb.calendar_sessions.bulkInsert(docs);
      console.log(`[Migration] Migrated ${docs.length} calendar sessions`);
    }

    // Migrate packages
    const packages = await legacyDb.table('packages').toArray();
    if (packages.length > 0) {
      const docs = packages.map((p: any) => stripUndefined({
        id: p.id,
        client_id: p.client_id,
        title: p.title,
        total_price: p.total_price,
        sessions_count: p.sessions_count,
        allocation_mode: p.allocation_mode,
        status: p.status,
        valid_from: p.valid_from ? toDbDate(p.valid_from instanceof Date ? p.valid_from : new Date(p.valid_from)) : undefined,
        valid_until: p.valid_until ? toDbDate(p.valid_until instanceof Date ? p.valid_until : new Date(p.valid_until)) : undefined,
        created_at: toDbDate(p.created_at instanceof Date ? p.created_at : new Date(p.created_at)),
        updated_at: toDbDate(p.updated_at instanceof Date ? p.updated_at : new Date(p.updated_at)),
      }));
      await rxdb.packages.bulkInsert(docs);
      console.log(`[Migration] Migrated ${docs.length} packages`);
    }

    // Migrate payments
    const payments = await legacyDb.table('payments').toArray();
    if (payments.length > 0) {
      const docs = payments.map((p: any) => stripUndefined({
        id: p.id,
        client_id: p.client_id,
        paid_at: toDbDate(p.paid_at instanceof Date ? p.paid_at : new Date(p.paid_at)),
        amount: p.amount,
        method: p.method,
        comment: p.comment || undefined,
        created_at: toDbDate(p.created_at instanceof Date ? p.created_at : new Date(p.created_at)),
        updated_at: toDbDate(p.updated_at instanceof Date ? p.updated_at : new Date(p.updated_at)),
      }));
      await rxdb.payments.bulkInsert(docs);
      console.log(`[Migration] Migrated ${docs.length} payments`);
    }

    // Migrate payment allocations
    const allocations = await legacyDb.table('paymentAllocations').toArray();
    if (allocations.length > 0) {
      const docs = allocations.map((a: any) => stripUndefined({
        id: a.id,
        payment_id: a.payment_id,
        session_id: a.session_id,
        allocated_amount: a.allocated_amount,
        created_at: toDbDate(a.created_at instanceof Date ? a.created_at : new Date(a.created_at)),
      }));
      await rxdb.payment_allocations.bulkInsert(docs);
      console.log(`[Migration] Migrated ${docs.length} payment allocations`);
    }

    // Mark migration as complete
    localStorage.setItem(MIGRATION_FLAG, 'true');
    console.log('[Migration] Dexie -> RxDB migration complete. Old database preserved.');

  } catch (error) {
    console.error('[Migration] Failed to migrate from Dexie:', error);
    throw error;
  } finally {
    legacyDb.close();
  }
}
