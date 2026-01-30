import { db } from '../db/database';
import {
  ClientStats,
  MonthlyStats,
  ClientMonthlyStats,
  CalendarSession,
} from '../db/types';
import { calculateSessionPrice, getEffectiveAllocatedAmount } from '../utils/calculations';
import { parseISO, startOfMonth, endOfMonth, isWithinInterval, format } from 'date-fns';

export class AnalyticsService {
  async getClientStats(clientId: string): Promise<ClientStats> {
    const sessions = await db.calendarSessions
      .where('client_id')
      .equals(clientId)
      .toArray();

    const payments = await db.payments
      .where('client_id')
      .equals(clientId)
      .toArray();

    let total_sessions = 0;
    let paid_sessions = 0;
    let unpaid_sessions = 0;
    let partially_paid_sessions = 0;
    let total_debt = 0;
    let nextUnpaidSession: CalendarSession | null = null;

    // Calculate effective allocated amounts considering unallocated balance
    // This distributes positive balance automatically to unpaid sessions
    for (const session of sessions) {
      if (session.status === 'canceled') {
        continue;
      }

      total_sessions++;
      const effectiveAllocated = await getEffectiveAllocatedAmount(session.id, clientId);
      const price = await calculateSessionPrice(clientId, session.id);

      if (effectiveAllocated >= price) {
        paid_sessions++;
      } else if (effectiveAllocated > 0) {
        partially_paid_sessions++;
        unpaid_sessions++;
        total_debt += price - effectiveAllocated;
      } else {
        unpaid_sessions++;
        total_debt += price;
      }

      // Find next unpaid session (using effective allocated)
      if (!nextUnpaidSession && effectiveAllocated < price) {
        const sessionDate = parseISO(session.date);
        const now = new Date();
        if (sessionDate >= now) {
          nextUnpaidSession = session;
        }
      } else if (nextUnpaidSession && effectiveAllocated < price) {
        const sessionDate = parseISO(session.date);
        const nextDate = parseISO(nextUnpaidSession.date);
        if (sessionDate < nextDate && sessionDate >= new Date()) {
          nextUnpaidSession = session;
        }
      }
    }

    const total_paid = payments.reduce((sum, p) => sum + p.amount, 0);

    // Calculate total allocated (real allocations)
    const allocations = await db.paymentAllocations.toArray();
    const clientSessions = sessions.map((s) => s.id);
    const total_allocated = allocations
      .filter((a) => clientSessions.includes(a.session_id))
      .reduce((sum, a) => sum + a.allocated_amount, 0);

    // Calculate total effective allocated (with balance distribution)
    let total_effective_allocated = 0;
    for (const session of sessions) {
      if (session.status === 'canceled') {
        continue;
      }
      const effectiveAllocated = await getEffectiveAllocatedAmount(session.id, clientId);
      total_effective_allocated += effectiveAllocated;
    }

    // Balance should be calculated based on effective allocated amount
    // This represents the remaining unallocated balance after virtual distribution
    const balance = Math.max(0, total_paid - total_effective_allocated);

    // Since we're using effective allocated amounts (which already account for balance),
    // total_debt already reflects the distribution of balance
    // So we don't need to subtract balance again
    const net_debt = Math.max(0, total_debt);

    return {
      total_sessions,
      paid_sessions,
      unpaid_sessions,
      partially_paid_sessions,
      total_paid,
      total_allocated,
      total_effective_allocated,
      total_debt: net_debt,
      balance,
      next_unpaid_session: nextUnpaidSession,
    };
  }

  async getClientDebt(clientId: string): Promise<number> {
    const stats = await this.getClientStats(clientId);
    return stats.total_debt;
  }

  async getNextUnpaidSession(
    clientId: string
  ): Promise<CalendarSession | null> {
    const stats = await this.getClientStats(clientId);
    return stats.next_unpaid_session;
  }

  async getBalance(clientId: string): Promise<number> {
    const stats = await this.getClientStats(clientId);
    return stats.balance;
  }

  async getMonthlyStats(month: Date): Promise<MonthlyStats> {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);

    const allClients = await db.clients
      .where('status')
      .equals('active')
      .toArray();

    const allSessions = await db.calendarSessions.toArray();
    const monthSessions = allSessions.filter((s) => {
      const sessionDate = parseISO(s.date);
      return isWithinInterval(sessionDate, {
        start: monthStart,
        end: monthEnd,
      });
    });

    const allPayments = await db.payments.toArray();
    const monthPayments = allPayments.filter((p) => {
      return isWithinInterval(p.paid_at, {
        start: monthStart,
        end: monthEnd,
      });
    });

    const total_payments = monthPayments.reduce(
      (sum, p) => sum + p.amount,
      0
    );

    // Calculate total debt for active clients
    let total_debt = 0;
    for (const client of allClients) {
      const debt = await this.getClientDebt(client.id);
      total_debt += debt;
    }

    return {
      month,
      total_clients: allClients.length,
      total_sessions: monthSessions.length,
      total_payments,
      total_debt,
    };
  }

  async getClientMonthlyStats(clientId: string): Promise<ClientMonthlyStats[]> {
    const sessions = await db.calendarSessions
      .where('client_id')
      .equals(clientId)
      .toArray();

    const payments = await db.payments
      .where('client_id')
      .equals(clientId)
      .toArray();

    const allocations = await db.paymentAllocations.toArray();
    const clientSessions = sessions.map((s) => s.id);
    const clientAllocations = allocations.filter((a) =>
      clientSessions.includes(a.session_id)
    );

    // Group sessions and payments by month
    const monthlyData = new Map<string, {
      month: Date;
      sessions: CalendarSession[];
      payments: typeof payments;
      allocations: typeof clientAllocations;
    }>();

    for (const session of sessions) {
      if (session.status === 'canceled') {
        continue;
      }

      const sessionDate = parseISO(session.date);
      const monthKey = format(sessionDate, 'yyyy-MM');
      const monthStart = startOfMonth(sessionDate);

      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, {
          month: monthStart,
          sessions: [],
          payments: [],
          allocations: [],
        });
      }

      monthlyData.get(monthKey)!.sessions.push(session);
    }

    for (const payment of payments) {
      const paymentDate = payment.paid_at;
      const monthKey = format(paymentDate, 'yyyy-MM');
      const monthStart = startOfMonth(paymentDate);

      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, {
          month: monthStart,
          sessions: [],
          payments: [],
          allocations: [],
        });
      }

      monthlyData.get(monthKey)!.payments.push(payment);
    }

    // Add allocations to their respective months based on session dates
    for (const allocation of clientAllocations) {
      const session = sessions.find((s) => s.id === allocation.session_id);
      if (!session) continue;

      const sessionDate = parseISO(session.date);
      const monthKey = format(sessionDate, 'yyyy-MM');

      if (monthlyData.has(monthKey)) {
        monthlyData.get(monthKey)!.allocations.push(allocation);
      }
    }

    // Calculate stats for each month using effective allocated amounts (with balance distribution)
    const result: ClientMonthlyStats[] = [];

    for (const [, data] of monthlyData.entries()) {
      let total_sessions = 0;
      let paid_sessions = 0;
      let unpaid_sessions = 0;
      let partially_paid_sessions = 0;
      let total_debt = 0;
      let total_effective_allocated = 0;

      // Calculate stats for this month's sessions using effective allocated amounts
      for (const session of data.sessions) {
        total_sessions++;
        const effectiveAllocated = await getEffectiveAllocatedAmount(session.id, clientId);
        const price = await calculateSessionPrice(clientId, session.id);
        total_effective_allocated += effectiveAllocated;

        if (effectiveAllocated >= price) {
          paid_sessions++;
        } else if (effectiveAllocated > 0) {
          partially_paid_sessions++;
          unpaid_sessions++;
          total_debt += price - effectiveAllocated;
        } else {
          unpaid_sessions++;
          total_debt += price;
        }
      }

      const total_paid = data.payments.reduce((sum, p) => sum + p.amount, 0);

      result.push({
        month: data.month,
        total_sessions,
        paid_sessions,
        unpaid_sessions,
        partially_paid_sessions,
        total_debt,
        total_paid,
        total_allocated: total_effective_allocated, // Use effective allocated for display
      });
    }

    // Sort by month descending (most recent first)
    return result.sort((a, b) => b.month.getTime() - a.month.getTime());
  }
}

export const analyticsService = new AnalyticsService();
