import { db } from '../db/database';

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
