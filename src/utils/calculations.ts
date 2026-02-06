import { getDb } from '../db/rxdb';
import { CalendarSession } from '../db/types';
import { parseISO } from 'date-fns';
import { isDateInRange } from './dateUtils';
import {
  toCalendarSessionEntity,
  toScheduleTemplateEntity,
  toPackageEntity,
  toPaymentEntity,
  toClientEntity,
  toPaymentAllocationEntity,
} from '../db/dateHelpers';

export type PaymentStatus = 'paid' | 'partially_paid' | 'unpaid';

export async function calculateSessionPrice(
  clientId: string,
  sessionId: string
): Promise<number> {
  const db = await getDb();
  const doc = await db.calendar_sessions.findOne(sessionId).exec();
  if (!doc) {
    return 0;
  }
  const session = toCalendarSessionEntity(doc.toJSON());

  // Price override has priority
  if (session.price_override !== undefined && session.price_override !== null) {
    return session.price_override;
  }

  // Check base_price from schedule rule if session was generated from template
  if (session.template_rule_id) {
    const templateDocs = await db.schedule_templates.find({
      selector: { client_id: clientId },
    }).exec();
    const templates = templateDocs
      .map((d: any) => toScheduleTemplateEntity(d.toJSON()))
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

    if (templates.length > 0) {
      const template = templates[templates.length - 1];
      const rule = template.rules.find((r) => r.rule_id === session.template_rule_id);
      if (rule && rule.base_price !== undefined && rule.base_price !== null) {
        return rule.base_price;
      }
    }
  }

  // Get active package
  const packageDocs = await db.packages.find({
    selector: { client_id: clientId, status: 'active' },
  }).exec();
  const activePackages = packageDocs
    .map((d: any) => toPackageEntity(d.toJSON()))
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());

  if (activePackages.length === 0) {
    return 0;
  }

  const pkg = activePackages[activePackages.length - 1];
  return pkg.total_price / pkg.sessions_count;
}

export async function calculateSessionStatus(
  sessionId: string
): Promise<PaymentStatus> {
  const db = await getDb();
  const allocationDocs = await db.payment_allocations.find({
    selector: { session_id: sessionId },
  }).exec();

  const allocated = allocationDocs.reduce((sum, a: any) => sum + a.toJSON().allocated_amount, 0);
  const sessionDoc = await db.calendar_sessions.findOne(sessionId).exec();

  if (!sessionDoc) {
    return 'unpaid';
  }
  const session = toCalendarSessionEntity(sessionDoc.toJSON());

  const price = await calculateSessionPrice(session.client_id, sessionId);

  if (allocated >= price) {
    return 'paid';
  } else if (allocated > 0) {
    return 'partially_paid';
  } else {
    return 'unpaid';
  }
}

export async function getAllocatedAmount(sessionId: string): Promise<number> {
  const db = await getDb();
  const docs = await db.payment_allocations.find({
    selector: { session_id: sessionId },
  }).exec();

  return docs.reduce((sum, d: any) => sum + d.toJSON().allocated_amount, 0);
}

/**
 * Calculate effective allocated amount for a session, considering client's unallocated balance
 * This distributes positive balance automatically to unpaid sessions starting from the first unpaid one
 */
export async function getEffectiveAllocatedAmount(
  sessionId: string,
  clientId: string
): Promise<number> {
  const db = await getDb();
  const sessionDoc = await db.calendar_sessions.findOne(sessionId).exec();
  if (!sessionDoc) {
    return 0;
  }
  const session = toCalendarSessionEntity(sessionDoc.toJSON());

  // Get actual allocated amount
  const allocated = await getAllocatedAmount(sessionId);
  const price = await calculateSessionPrice(clientId, sessionId);

  // If already fully paid, return allocated amount
  if (allocated >= price) {
    return allocated;
  }

  // Calculate client's unallocated balance
  const paymentDocs = await db.payments.find({ selector: { client_id: clientId } }).exec();
  const payments = paymentDocs.map((d: any) => toPaymentEntity(d.toJSON()));
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  // Get client to check pause period
  const clientDoc = await db.clients.findOne(clientId).exec();
  if (!clientDoc) {
    return allocated;
  }
  const client = toClientEntity(clientDoc.toJSON());

  // Helper function to check if session is in pause period
  const isSessionInPause = (s: CalendarSession): boolean => {
    if (!client.pause_from || !client.pause_to) {
      return false;
    }
    const sDate = parseISO(s.date);
    return isDateInRange(sDate, client.pause_from, client.pause_to);
  };

  // Get all sessions for client, sorted by date
  const allSessionDocs = await db.calendar_sessions.find({
    selector: { client_id: clientId },
  }).exec();
  const allSessions = allSessionDocs
    .map((d: any) => toCalendarSessionEntity(d.toJSON()))
    .filter((s) => s.status !== 'canceled' && !isSessionInPause(s))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate total allocated across all sessions
  const allAllocationDocs = await db.payment_allocations.find().exec();
  const allAllocations = allAllocationDocs.map((d: any) => toPaymentAllocationEntity(d.toJSON()));
  const clientSessionIds = allSessions.map((s) => s.id);
  const totalAllocated = allAllocations
    .filter((a) => clientSessionIds.includes(a.session_id))
    .reduce((sum, a) => sum + a.allocated_amount, 0);

  const unallocatedBalance = totalPaid - totalAllocated;

  if (unallocatedBalance <= 0) {
    return allocated;
  }

  if (isSessionInPause(session)) {
    return allocated;
  }

  // Distribute unallocated balance to unpaid sessions starting from the first unpaid one
  let remainingBalance = unallocatedBalance;
  let balanceAppliedToThisSession = 0;
  const sessionDate = parseISO(session.date);

  for (const s of allSessions) {
    if (remainingBalance <= 0) {
      break;
    }

    const sDate = parseISO(s.date);

    if (sDate > sessionDate) {
      break;
    }

    const sAllocated = await getAllocatedAmount(s.id);
    const sPrice = await calculateSessionPrice(clientId, s.id);
    const sNeeded = sPrice - sAllocated;

    if (sNeeded > 0) {
      if (s.id === sessionId) {
        const toApply = Math.min(remainingBalance, sNeeded);
        balanceAppliedToThisSession = toApply;
        remainingBalance -= toApply;
        break;
      } else {
        const toApply = Math.min(remainingBalance, sNeeded);
        remainingBalance -= toApply;
      }
    }
  }

  return allocated + balanceAppliedToThisSession;
}

/**
 * Calculate session status considering client's unallocated balance
 */
export async function calculateSessionStatusWithBalance(
  sessionId: string,
  clientId: string
): Promise<PaymentStatus> {
  const db = await getDb();
  const sessionDoc = await db.calendar_sessions.findOne(sessionId).exec();
  if (!sessionDoc) {
    return 'unpaid';
  }

  const effectiveAllocated = await getEffectiveAllocatedAmount(sessionId, clientId);
  const price = await calculateSessionPrice(clientId, sessionId);

  if (effectiveAllocated >= price) {
    return 'paid';
  } else if (effectiveAllocated > 0) {
    return 'partially_paid';
  } else {
    return 'unpaid';
  }
}
