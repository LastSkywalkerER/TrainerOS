import { getDb } from '../db/rxdb';
import {
  Client,
  ScheduleTemplate,
  CalendarSession,
  Package,
  Payment,
  PaymentAllocation,
} from '../db/types';
import { APP_VERSION, DB_SCHEMA_VERSION } from '../db/version';
import { migrateDataLegacyToV1, migrateBackupData } from '../db/data-migrations';
import {
  toClientEntity,
  toScheduleTemplateEntity,
  toCalendarSessionEntity,
  toPackageEntity,
  toPaymentEntity,
  toPaymentAllocationEntity,
  clientToDb,
  scheduleTemplateToDb,
  calendarSessionToDb,
  packageToDb,
  paymentToDb,
  paymentAllocationToDb,
  stripUndefined,
} from '../db/dateHelpers';

export interface BackupData {
  version: string;       // Legacy field kept for backward compat
  appVersion: string;    // App version at time of export
  dbVersion: number;     // DB schema version at time of export
  exportDate: string;
  clients: Client[];
  scheduleTemplates: ScheduleTemplate[];
  calendarSessions: CalendarSession[];
  packages: Package[];
  payments: Payment[];
  paymentAllocations: PaymentAllocation[];
}

export class BackupService {
  /**
   * Export all application data to JSON with version metadata
   */
  async exportAllData(): Promise<string> {
    const db = await getDb();

    const [clientDocs, templateDocs, sessionDocs, packageDocs, paymentDocs, allocationDocs] = await Promise.all([
      db.clients.find().exec(),
      db.schedule_templates.find().exec(),
      db.calendar_sessions.find().exec(),
      db.packages.find().exec(),
      db.payments.find().exec(),
      db.payment_allocations.find().exec(),
    ]);

    const backupData: BackupData = {
      version: '2.0',
      appVersion: APP_VERSION,
      dbVersion: DB_SCHEMA_VERSION,
      exportDate: new Date().toISOString(),
      clients: clientDocs.map((d: any) => toClientEntity(d.toJSON())),
      scheduleTemplates: templateDocs.map((d: any) => toScheduleTemplateEntity(d.toJSON())),
      calendarSessions: sessionDocs.map((d: any) => toCalendarSessionEntity(d.toJSON())),
      packages: packageDocs.map((d: any) => toPackageEntity(d.toJSON())),
      payments: paymentDocs.map((d: any) => toPaymentEntity(d.toJSON())),
      paymentAllocations: allocationDocs.map((d: any) => toPaymentAllocationEntity(d.toJSON())),
    };

    return JSON.stringify(backupData, null, 2);
  }

  /**
   * Import and merge data from JSON backup.
   * Handles version differences: migrates old formats, blocks imports from newer versions.
   */
  async importData(jsonString: string): Promise<void> {
    let backupData: BackupData = JSON.parse(jsonString);

    // Determine source DB version
    let sourceDbVersion = backupData.dbVersion;
    if (sourceDbVersion === undefined || sourceDbVersion === null) {
      // Legacy format (Dexie era) - treat as version 0
      sourceDbVersion = 0;
      backupData = migrateDataLegacyToV1(backupData);
    }

    // Block import from newer DB version
    if (sourceDbVersion > DB_SCHEMA_VERSION) {
      throw new Error(
        `Backup was created with a newer database version (${sourceDbVersion}). ` +
        `Current app supports version ${DB_SCHEMA_VERSION}. ` +
        `Please update the app before importing this backup.`
      );
    }

    // Run data migrations if importing from older version
    if (sourceDbVersion < DB_SCHEMA_VERSION) {
      backupData = migrateBackupData(backupData, sourceDbVersion, DB_SCHEMA_VERSION);
    }

    // Deserialize dates - convert ISO strings back to Date objects
    const deserializeDates = (obj: any): any => {
      if (obj === null || obj === undefined) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(item => deserializeDates(item));
      }

      if (typeof obj === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(obj)) {
        try {
          const date = new Date(obj);
          if (!isNaN(date.getTime())) {
            return date;
          }
        } catch {
          // Not a valid date, keep as is
        }
        return obj;
      }

      if (typeof obj === 'object') {
        const result: any = {};
        for (const key in obj) {
          result[key] = deserializeDates(obj[key]);
        }
        return result;
      }

      return obj;
    };

    // Deserialize all data
    const deserialized = {
      clients: deserializeDates(backupData.clients) as Client[],
      scheduleTemplates: deserializeDates(backupData.scheduleTemplates) as ScheduleTemplate[],
      calendarSessions: deserializeDates(backupData.calendarSessions) as CalendarSession[],
      packages: deserializeDates(backupData.packages) as Package[],
      payments: deserializeDates(backupData.payments) as Payment[],
      paymentAllocations: deserializeDates(backupData.paymentAllocations) as PaymentAllocation[],
    };

    const db = await getDb();

    // Import clients
    for (const client of deserialized.clients) {
      const existing = await db.clients.findOne(client.id).exec();
      if (existing) {
        const existingData = toClientEntity(existing.toJSON());
        const merged = { ...client, created_at: existingData.created_at, updated_at: new Date() };
        await existing.patch(stripUndefined(clientToDb(merged)));
      } else {
        await db.clients.insert(stripUndefined(clientToDb(client)));
      }
    }

    // Import schedule templates
    for (const template of deserialized.scheduleTemplates) {
      const existing = await db.schedule_templates.findOne(template.id).exec();
      if (existing) {
        const existingData = toScheduleTemplateEntity(existing.toJSON());
        const merged = { ...template, created_at: existingData.created_at, updated_at: new Date() };
        await existing.patch(stripUndefined(scheduleTemplateToDb(merged)));
      } else {
        await db.schedule_templates.insert(stripUndefined(scheduleTemplateToDb(template)));
      }
    }

    // Import calendar sessions
    for (const session of deserialized.calendarSessions) {
      const existing = await db.calendar_sessions.findOne(session.id).exec();
      if (existing) {
        const existingData = toCalendarSessionEntity(existing.toJSON());
        const merged = { ...session, created_at: existingData.created_at, updated_at: new Date() };
        await existing.patch(stripUndefined(calendarSessionToDb(merged)));
      } else {
        await db.calendar_sessions.insert(stripUndefined(calendarSessionToDb(session)));
      }
    }

    // Import packages
    for (const pkg of deserialized.packages) {
      const existing = await db.packages.findOne(pkg.id).exec();
      if (existing) {
        const existingData = toPackageEntity(existing.toJSON());
        const merged = { ...pkg, created_at: existingData.created_at, updated_at: new Date() };
        await existing.patch(stripUndefined(packageToDb(merged)));
      } else {
        await db.packages.insert(stripUndefined(packageToDb(pkg)));
      }
    }

    // Import payments
    for (const payment of deserialized.payments) {
      const existing = await db.payments.findOne(payment.id).exec();
      if (existing) {
        const existingData = toPaymentEntity(existing.toJSON());
        const merged = { ...payment, created_at: existingData.created_at, updated_at: new Date() };
        await existing.patch(stripUndefined(paymentToDb(merged)));
      } else {
        await db.payments.insert(stripUndefined(paymentToDb(payment)));
      }
    }

    // Import payment allocations
    for (const allocation of deserialized.paymentAllocations) {
      const existing = await db.payment_allocations.findOne(allocation.id).exec();
      if (existing) {
        const existingData = toPaymentAllocationEntity(existing.toJSON());
        const merged = { ...allocation, created_at: existingData.created_at };
        await existing.patch(stripUndefined(paymentAllocationToDb(merged)));
      } else {
        await db.payment_allocations.insert(stripUndefined(paymentAllocationToDb(allocation)));
      }
    }
  }
}

export const backupService = new BackupService();
