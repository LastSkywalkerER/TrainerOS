// Date conversion helpers for RxDB storage
// RxDB stores dates as ISO strings; app uses Date objects

import type {
  Client,
  ScheduleTemplate,
  CalendarSession,
  Package,
  Payment,
  PaymentAllocation,
} from './types';

/** Convert a Date to ISO string for DB storage */
export function toDbDate(date: Date): string {
  return date.toISOString();
}

/** Convert an ISO string from DB back to Date */
export function fromDbDate(isoString: string | undefined | null): Date | undefined {
  if (!isoString) return undefined;
  return new Date(isoString);
}

/** Convert an ISO string to Date, throwing if null */
export function fromDbDateRequired(isoString: string): Date {
  return new Date(isoString);
}

// --- Entity-specific converters ---
// Each converts raw RxDB document data (with ISO date strings) to typed entity (with Date objects)

export function toClientEntity(doc: any): Client {
  return {
    ...doc,
    start_date: fromDbDateRequired(doc.start_date),
    pause_from: fromDbDate(doc.pause_from),
    pause_to: fromDbDate(doc.pause_to),
    archive_date: fromDbDate(doc.archive_date),
    created_at: fromDbDateRequired(doc.created_at),
    updated_at: fromDbDateRequired(doc.updated_at),
  };
}

export function toScheduleTemplateEntity(doc: any): ScheduleTemplate {
  return {
    ...doc,
    valid_from: fromDbDate(doc.valid_from),
    valid_to: fromDbDate(doc.valid_to),
    created_at: fromDbDateRequired(doc.created_at),
    updated_at: fromDbDateRequired(doc.updated_at),
  };
}

export function toCalendarSessionEntity(doc: any): CalendarSession {
  return {
    ...doc,
    created_at: fromDbDateRequired(doc.created_at),
    updated_at: fromDbDateRequired(doc.updated_at),
  };
}

export function toPackageEntity(doc: any): Package {
  return {
    ...doc,
    valid_from: fromDbDate(doc.valid_from),
    valid_until: fromDbDate(doc.valid_until),
    created_at: fromDbDateRequired(doc.created_at),
    updated_at: fromDbDateRequired(doc.updated_at),
  };
}

export function toPaymentEntity(doc: any): Payment {
  return {
    ...doc,
    paid_at: fromDbDateRequired(doc.paid_at),
    created_at: fromDbDateRequired(doc.created_at),
    updated_at: fromDbDateRequired(doc.updated_at),
  };
}

export function toPaymentAllocationEntity(doc: any): PaymentAllocation {
  return {
    ...doc,
    created_at: fromDbDateRequired(doc.created_at),
  };
}

// --- Helpers to prepare entities for DB storage (Date -> ISO string) ---

export function clientToDb(client: Client): Record<string, any> {
  return {
    ...client,
    start_date: toDbDate(client.start_date),
    pause_from: client.pause_from ? toDbDate(client.pause_from) : undefined,
    pause_to: client.pause_to ? toDbDate(client.pause_to) : undefined,
    archive_date: client.archive_date ? toDbDate(client.archive_date) : undefined,
    created_at: toDbDate(client.created_at),
    updated_at: toDbDate(client.updated_at),
  };
}

export function scheduleTemplateToDb(template: ScheduleTemplate): Record<string, any> {
  return {
    ...template,
    valid_from: template.valid_from ? toDbDate(template.valid_from) : undefined,
    valid_to: template.valid_to ? toDbDate(template.valid_to) : undefined,
    created_at: toDbDate(template.created_at),
    updated_at: toDbDate(template.updated_at),
  };
}

export function calendarSessionToDb(session: CalendarSession): Record<string, any> {
  return {
    ...session,
    created_at: toDbDate(session.created_at),
    updated_at: toDbDate(session.updated_at),
  };
}

export function packageToDb(pkg: Package): Record<string, any> {
  return {
    ...pkg,
    valid_from: pkg.valid_from ? toDbDate(pkg.valid_from) : undefined,
    valid_until: pkg.valid_until ? toDbDate(pkg.valid_until) : undefined,
    created_at: toDbDate(pkg.created_at),
    updated_at: toDbDate(pkg.updated_at),
  };
}

export function paymentToDb(payment: Payment): Record<string, any> {
  return {
    ...payment,
    paid_at: toDbDate(payment.paid_at),
    created_at: toDbDate(payment.created_at),
    updated_at: toDbDate(payment.updated_at),
  };
}

export function paymentAllocationToDb(allocation: PaymentAllocation): Record<string, any> {
  return {
    ...allocation,
    created_at: toDbDate(allocation.created_at),
  };
}

/** Strip undefined fields from an object (RxDB doesn't accept undefined) */
export function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}
