// Seed legacy Dexie database for migration testing
// Simulates old TrainerOS app data. Use ?seed=legacy-migration to run.
// After reload, migrateDexieToRxDB will migrate data to RxDB.

import Dexie from 'dexie';
import { resetDatabase } from './rxdb';
import { generateId } from '../utils/uuid';
import { subMonths, addMonths } from 'date-fns';

const MIGRATION_FLAG = 'trainer-os-dexie-migrated';

/** Create legacy Dexie DB with mock data (matches old TrainerOS schema v5) */
async function createLegacyDexieWithData(): Promise<void> {
  const db = new Dexie('TrainerOS');
  db.version(5).stores({
    clients: 'id, status, full_name',
    scheduleTemplates: 'id, client_id',
    calendarSessions: 'id, client_id, date, status, [client_id+date]',
    packages: 'id, client_id, status',
    payments: 'id, client_id, paid_at',
    paymentAllocations: 'id, payment_id, session_id, [payment_id+session_id]',
  });

  await db.open();

  const now = new Date();

  // Clients (no is_system - legacy format)
  const client1 = {
    id: generateId(),
    full_name: 'Анна Петрова',
    phone: '+7 999 123-45-67',
    telegram: '@anna_p',
    notes: 'Предпочитает утренние занятия',
    status: 'active',
    start_date: subMonths(now, 3),
    created_at: subMonths(now, 3),
    updated_at: now,
  };
  const client2 = {
    id: generateId(),
    full_name: 'Борис Сидоров',
    phone: '+7 999 234-56-78',
    status: 'active',
    start_date: subMonths(now, 2),
    created_at: subMonths(now, 2),
    updated_at: now,
  };
  const client3 = {
    id: generateId(),
    full_name: 'Мария Козлова',
    telegram: '@maria_k',
    status: 'active',
    start_date: subMonths(now, 1),
    created_at: subMonths(now, 1),
    updated_at: now,
  };

  await db.table('clients').bulkAdd([client1, client2, client3]);

  // Schedule templates
  const ruleId1 = generateId();
  const ruleId2 = generateId();
  const template1 = {
    id: generateId(),
    client_id: client1.id,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    rules: [
      { rule_id: ruleId1, weekday: 1, start_time: '09:00', is_active: true, base_price: 2000 },
      { rule_id: ruleId2, weekday: 3, start_time: '09:00', is_active: true, base_price: 2000 },
    ],
    generation_horizon_days: 60,
    created_at: now,
    updated_at: now,
  };
  await db.table('scheduleTemplates').add(template1);

  // Calendar sessions (a few sample sessions)
  const session1 = {
    id: generateId(),
    client_id: client1.id,
    date: '2025-03-20',
    start_time: '09:00',
    status: 'planned',
    template_rule_id: ruleId1,
    is_custom: false,
    notes: '<p>План: разминка, ОФП, растяжка. Анна попросила уделить внимание спине.</p>',
    created_at: now,
    updated_at: now,
  };
  const session2 = {
    id: generateId(),
    client_id: client1.id,
    date: '2025-03-22',
    start_time: '09:00',
    status: 'completed',
    template_rule_id: ruleId2,
    is_custom: false,
    notes: '<p>Хорошая тренировка. Выполнили все запланированное. Следующий раз — добавить упражнения на пресс.</p>',
    created_at: now,
    updated_at: now,
  };
  const session3 = {
    id: generateId(),
    client_id: client2.id,
    date: '2025-03-21',
    start_time: '18:00',
    status: 'planned',
    is_custom: true,
    created_at: now,
    updated_at: now,
  };
  await db.table('calendarSessions').bulkAdd([session1, session2, session3]);

  // Packages
  const pkg1 = {
    id: generateId(),
    client_id: client1.id,
    title: 'Абонемент 8 занятий',
    total_price: 15000,
    sessions_count: 8,
    allocation_mode: 'money',
    status: 'active',
    valid_from: subMonths(now, 1),
    valid_until: addMonths(now, 2),
    created_at: now,
    updated_at: now,
  };
  await db.table('packages').add(pkg1);

  // Payments
  const payment1 = {
    id: generateId(),
    client_id: client1.id,
    paid_at: subMonths(now, 1),
    amount: 15000,
    method: 'card',
    comment: 'Оплата абонемента',
    created_at: now,
    updated_at: now,
  };
  await db.table('payments').add(payment1);

  // Payment allocations
  const alloc1 = {
    id: generateId(),
    payment_id: payment1.id,
    session_id: session2.id,
    allocated_amount: 2000,
    created_at: now,
  };
  await db.table('paymentAllocations').add(alloc1);

  db.close();
  console.log('[Seed] Legacy Dexie DB created with 3 clients, sessions, packages, payments');
}

/**
 * Prepare environment for migration test:
 * 1. Reset RxDB (clear current data)
 * 2. Clear Dexie migration flag
 * 3. Create legacy Dexie DB with mock data
 * 4. Reload page - app will run migrateDexieToRxDB on next load
 */
export async function seedLegacyForMigrationTest(): Promise<void> {
  console.log('[Seed] Preparing legacy migration test...');

  // Reset RxDB so we start fresh
  await resetDatabase();

  // Clear migration flag so migrateDexieToRxDB will run
  localStorage.removeItem(MIGRATION_FLAG);

  // Delete existing Dexie TrainerOS if any (to avoid conflicts)
  const dbs = await Dexie.getDatabaseNames();
  if (dbs.includes('TrainerOS')) {
    await Dexie.delete('TrainerOS');
  }

  // Create legacy Dexie with mock data
  await createLegacyDexieWithData();

  // Remove seed param so we don't run again after reload
  window.history.replaceState({}, '', window.location.pathname);
  console.log('[Seed] Legacy DB ready. Reloading to trigger migration...');
  window.location.reload();
}
