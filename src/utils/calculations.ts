import { db } from '../db/database';
import { parseISO } from 'date-fns';

export type PaymentStatus = 'paid' | 'partially_paid' | 'unpaid';

export async function calculateSessionPrice(
  clientId: string,
  sessionId: string
): Promise<number> {
  const session = await db.calendarSessions.get(sessionId);
  if (!session) {
    return 0;
  }

  // Price override has priority
  if (session.price_override !== undefined && session.price_override !== null) {
    return session.price_override;
  }

  // Check base_price from schedule rule if session was generated from template
  if (session.template_rule_id) {
    const templates = await db.scheduleTemplates
      .where('client_id')
      .equals(clientId)
      .sortBy('created_at');
    
    if (templates.length > 0) {
      const template = templates[templates.length - 1];
      const rule = template.rules.find((r) => r.rule_id === session.template_rule_id);
      if (rule && rule.base_price !== undefined && rule.base_price !== null) {
        return rule.base_price;
      }
    }
  }

  // Get active package
  const activePackage = await db.packages
    .where('client_id')
    .equals(clientId)
    .and((p) => p.status === 'active')
    .sortBy('created_at');

  if (activePackage.length === 0) {
    return 0;
  }

  // Use the most recent active package
  const pkg = activePackage[activePackage.length - 1];
  return pkg.total_price / pkg.sessions_count;
}

export async function calculateSessionStatus(
  sessionId: string
): Promise<PaymentStatus> {
  const allocations = await db.paymentAllocations
    .where('session_id')
    .equals(sessionId)
    .toArray();

  const allocated = allocations.reduce((sum, a) => sum + a.allocated_amount, 0);
  const session = await db.calendarSessions.get(sessionId);
  
  if (!session) {
    return 'unpaid';
  }

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
  const allocations = await db.paymentAllocations
    .where('session_id')
    .equals(sessionId)
    .toArray();

  return allocations.reduce((sum, a) => sum + a.allocated_amount, 0);
}

/**
 * Calculate effective allocated amount for a session, considering client's unallocated balance
 * This distributes positive balance automatically to unpaid sessions starting from the first unpaid one
 */
export async function getEffectiveAllocatedAmount(
  sessionId: string,
  clientId: string
): Promise<number> {
  const session = await db.calendarSessions.get(sessionId);
  if (!session) {
    return 0;
  }

  // Get actual allocated amount
  const allocated = await getAllocatedAmount(sessionId);
  const price = await calculateSessionPrice(clientId, sessionId);

  // If already fully paid, return allocated amount
  if (allocated >= price) {
    return allocated;
  }

  // Calculate client's unallocated balance
  const payments = await db.payments
    .where('client_id')
    .equals(clientId)
    .toArray();
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  // Get all sessions for client, then filter and sort in JavaScript
  // Dexie doesn't support sortBy after and()
  const allSessions = (await db.calendarSessions
    .where('client_id')
    .equals(clientId)
    .toArray())
    .filter((s) => s.status !== 'canceled')
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate total allocated across all sessions
  const allAllocations = await db.paymentAllocations.toArray();
  const clientSessionIds = allSessions.map((s) => s.id);
  const totalAllocated = allAllocations
    .filter((a) => clientSessionIds.includes(a.session_id))
    .reduce((sum, a) => sum + a.allocated_amount, 0);

  const unallocatedBalance = totalPaid - totalAllocated;

  // If no unallocated balance, return actual allocated
  if (unallocatedBalance <= 0) {
    return allocated;
  }

  // Distribute unallocated balance to unpaid sessions starting from the first unpaid one
  // First, calculate how much balance would be applied to sessions before this one
  let remainingBalance = unallocatedBalance;
  let balanceAppliedToThisSession = 0;
  const sessionDate = parseISO(session.date);

  for (const s of allSessions) {
    if (remainingBalance <= 0) {
      break;
    }

    const sDate = parseISO(s.date);
    
    // Only consider sessions up to and including the current session
    if (sDate > sessionDate) {
      break;
    }

    const sAllocated = await getAllocatedAmount(s.id);
    const sPrice = await calculateSessionPrice(clientId, s.id);
    const sNeeded = sPrice - sAllocated;

    if (sNeeded > 0) {
      if (s.id === sessionId) {
        // This is the current session - apply remaining balance to it
        const toApply = Math.min(remainingBalance, sNeeded);
        balanceAppliedToThisSession = toApply;
        remainingBalance -= toApply;
        break;
      } else {
        // Apply balance to previous unpaid sessions first
        const toApply = Math.min(remainingBalance, sNeeded);
        remainingBalance -= toApply;
      }
    }
  }

  return allocated + balanceAppliedToThisSession;
}

/**
 * Calculate session status considering client's unallocated balance
 * This automatically distributes positive balance to unpaid sessions
 */
export async function calculateSessionStatusWithBalance(
  sessionId: string,
  clientId: string
): Promise<PaymentStatus> {
  const session = await db.calendarSessions.get(sessionId);
  if (!session) {
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
