import { db } from '../db/database';
import {
  Client,
  ScheduleTemplate,
  CalendarSession,
  Package,
  Payment,
  PaymentAllocation,
} from '../db/types';

export interface BackupData {
  version: string;
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
   * Export all application data to JSON
   */
  async exportAllData(): Promise<string> {
    // Get all data from all tables
    const [clients, scheduleTemplates, calendarSessions, packages, payments, paymentAllocations] = await Promise.all([
      db.clients.toArray(),
      db.scheduleTemplates.toArray(),
      db.calendarSessions.toArray(),
      db.packages.toArray(),
      db.payments.toArray(),
      db.paymentAllocations.toArray(),
    ]);

    const backupData: BackupData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      clients,
      scheduleTemplates,
      calendarSessions,
      packages,
      payments,
      paymentAllocations,
    };

    // Serialize dates properly - JSON.stringify will convert Date objects to ISO strings
    return JSON.stringify(backupData, null, 2);
  }

  /**
   * Import and merge data from JSON backup
   * Merges with existing data: updates if ID exists, adds if not
   */
  async importData(jsonString: string): Promise<void> {
    const backupData: BackupData = JSON.parse(jsonString);

    // Deserialize dates - convert ISO strings back to Date objects
    const deserializeDates = (obj: any): any => {
      if (obj === null || obj === undefined) {
        return obj;
      }
      
      if (Array.isArray(obj)) {
        return obj.map(item => deserializeDates(item));
      }
      
      if (typeof obj === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(obj)) {
        // Check if it looks like an ISO date string
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

    // Use transaction for atomicity
    await db.transaction('rw', [
      db.clients,
      db.scheduleTemplates,
      db.calendarSessions,
      db.packages,
      db.payments,
      db.paymentAllocations,
    ], async () => {
      // Deserialize all data first
      const deserializedData = {
        clients: deserializeDates(backupData.clients),
        scheduleTemplates: deserializeDates(backupData.scheduleTemplates),
        calendarSessions: deserializeDates(backupData.calendarSessions),
        packages: deserializeDates(backupData.packages),
        payments: deserializeDates(backupData.payments),
        paymentAllocations: deserializeDates(backupData.paymentAllocations),
      };

      // Import clients
      for (const client of deserializedData.clients) {
        const existing = await db.clients.get(client.id);
        if (existing) {
          // Update existing - preserve created_at, update updated_at
          await db.clients.update(client.id, {
            ...client,
            created_at: existing.created_at,
            updated_at: new Date(),
          });
        } else {
          // Add new
          await db.clients.add(client);
        }
      }

      // Import schedule templates
      for (const template of deserializedData.scheduleTemplates) {
        const existing = await db.scheduleTemplates.get(template.id);
        if (existing) {
          await db.scheduleTemplates.update(template.id, {
            ...template,
            created_at: existing.created_at,
            updated_at: new Date(),
          });
        } else {
          await db.scheduleTemplates.add(template);
        }
      }

      // Import calendar sessions
      for (const session of deserializedData.calendarSessions) {
        const existing = await db.calendarSessions.get(session.id);
        if (existing) {
          await db.calendarSessions.update(session.id, {
            ...session,
            created_at: existing.created_at,
            updated_at: new Date(),
          });
        } else {
          await db.calendarSessions.add(session);
        }
      }

      // Import packages
      for (const pkg of deserializedData.packages) {
        const existing = await db.packages.get(pkg.id);
        if (existing) {
          await db.packages.update(pkg.id, {
            ...pkg,
            created_at: existing.created_at,
            updated_at: new Date(),
          });
        } else {
          await db.packages.add(pkg);
        }
      }

      // Import payments
      for (const payment of deserializedData.payments) {
        const existing = await db.payments.get(payment.id);
        if (existing) {
          await db.payments.update(payment.id, {
            ...payment,
            created_at: existing.created_at,
            updated_at: new Date(),
          });
        } else {
          await db.payments.add(payment);
        }
      }

      // Import payment allocations
      for (const allocation of deserializedData.paymentAllocations) {
        const existing = await db.paymentAllocations.get(allocation.id);
        if (existing) {
          await db.paymentAllocations.update(allocation.id, {
            ...allocation,
            created_at: existing.created_at,
          });
        } else {
          await db.paymentAllocations.add(allocation);
        }
      }
    });
  }
}

export const backupService = new BackupService();
