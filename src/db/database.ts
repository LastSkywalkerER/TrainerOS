import Dexie, { Table } from 'dexie';
import {
  Client,
  ScheduleTemplate,
  CalendarSession,
  Package,
  Payment,
  PaymentAllocation,
} from './types';

export class TrainerOSDatabase extends Dexie {
  clients!: Table<Client, string>;
  scheduleTemplates!: Table<ScheduleTemplate, string>;
  calendarSessions!: Table<CalendarSession, string>;
  packages!: Table<Package, string>;
  payments!: Table<Payment, string>;
  paymentAllocations!: Table<PaymentAllocation, string>;

  constructor() {
    super('TrainerOS');
    
    this.version(1).stores({
      clients: 'id, status, full_name',
      scheduleTemplates: 'id, client_id',
      calendarSessions: 'id, client_id, date, status, [client_id+date]',
      packages: 'id, client_id, status',
      payments: 'id, client_id, paid_at',
      paymentAllocations: 'id, payment_id, session_id, [payment_id+session_id]',
    });

    // Version 2: Add pause_from, pause_to, archive_date to clients
    // Add valid_from, valid_to to scheduleTemplates
    // No index changes needed, just schema update
    this.version(2).stores({
      clients: 'id, status, full_name',
      scheduleTemplates: 'id, client_id',
      calendarSessions: 'id, client_id, date, status, [client_id+date]',
      packages: 'id, client_id, status',
      payments: 'id, client_id, paid_at',
      paymentAllocations: 'id, payment_id, session_id, [payment_id+session_id]',
    });

    // Version 3: Add start_date to clients
    // No index changes needed, just schema update
    this.version(3).stores({
      clients: 'id, status, full_name',
      scheduleTemplates: 'id, client_id',
      calendarSessions: 'id, client_id, date, status, [client_id+date]',
      packages: 'id, client_id, status',
      payments: 'id, client_id, paid_at',
      paymentAllocations: 'id, payment_id, session_id, [payment_id+session_id]',
    });
  }
}

export const db = new TrainerOSDatabase();
