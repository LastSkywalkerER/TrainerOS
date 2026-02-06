import { getDb } from '../db/rxdb';
import {
  ClientStats,
  MonthlyStats,
  ClientMonthlyStats,
  CalendarSession,
} from '../db/types';
import { calculateSessionPrice, getEffectiveAllocatedAmount } from '../utils/calculations';
import { parseISO, startOfMonth, endOfMonth, isWithinInterval, format } from 'date-fns';
import { isDateInRange } from '../utils/dateUtils';
import {
  toClientEntity,
  toCalendarSessionEntity,
  toPaymentEntity,
  toPaymentAllocationEntity,
} from '../db/dateHelpers';

export class AnalyticsService {
  async getClientStats(clientId: string): Promise<ClientStats> {
    const db = await getDb();

    const sessionDocs = await db.calendar_sessions.find({ selector: { client_id: clientId } }).exec();
    const sessions = sessionDocs.map((d: any) => toCalendarSessionEntity(d.toJSON()));

    const paymentDocs = await db.payments.find({ selector: { client_id: clientId } }).exec();
    const payments = paymentDocs.map((d: any) => toPaymentEntity(d.toJSON()));

    const clientDoc = await db.clients.findOne(clientId).exec();
    if (!clientDoc) {
      throw new Error(`Client with id ${clientId} not found`);
    }
    const client = toClientEntity(clientDoc.toJSON());

    let total_sessions = 0;
    let paid_sessions = 0;
    let unpaid_sessions = 0;
    let partially_paid_sessions = 0;
    let total_debt = 0;
    let nextUnpaidSession: CalendarSession | null = null;

    const isSessionInPause = (session: CalendarSession): boolean => {
      if (!client.pause_from || !client.pause_to) {
        return false;
      }
      const sessionDate = parseISO(session.date);
      return isDateInRange(sessionDate, client.pause_from, client.pause_to);
    };

    for (const session of sessions) {
      if (session.status === 'canceled') {
        continue;
      }

      if (isSessionInPause(session)) {
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
    const allAllocationDocs = await db.payment_allocations.find().exec();
    const allAllocations = allAllocationDocs.map((d: any) => toPaymentAllocationEntity(d.toJSON()));
    const clientSessionIds = sessions.map((s) => s.id);
    const total_allocated = allAllocations
      .filter((a) => clientSessionIds.includes(a.session_id))
      .reduce((sum, a) => sum + a.allocated_amount, 0);

    // Calculate total effective allocated (with balance distribution)
    let total_effective_allocated = 0;
    for (const session of sessions) {
      if (session.status === 'canceled') {
        continue;
      }
      if (isSessionInPause(session)) {
        continue;
      }
      const effectiveAllocated = await getEffectiveAllocatedAmount(session.id, clientId);
      total_effective_allocated += effectiveAllocated;
    }

    const balance = Math.max(0, total_paid - total_effective_allocated);
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
    const db = await getDb();

    const clientDocs = await db.clients.find({ selector: { status: 'active' } }).exec();
    const allClients = clientDocs.map((d: any) => toClientEntity(d.toJSON()));

    const sessionDocs = await db.calendar_sessions.find().exec();
    const allSessions = sessionDocs.map((d: any) => toCalendarSessionEntity(d.toJSON()));
    const monthSessions = allSessions.filter((s) => {
      const sessionDate = parseISO(s.date);
      return isWithinInterval(sessionDate, {
        start: monthStart,
        end: monthEnd,
      });
    });

    const paymentDocs = await db.payments.find().exec();
    const allPayments = paymentDocs.map((d: any) => toPaymentEntity(d.toJSON()));
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
    const db = await getDb();

    const sessionDocs = await db.calendar_sessions.find({ selector: { client_id: clientId } }).exec();
    const sessions = sessionDocs.map((d: any) => toCalendarSessionEntity(d.toJSON()));

    const paymentDocs = await db.payments.find({ selector: { client_id: clientId } }).exec();
    const payments = paymentDocs.map((d: any) => toPaymentEntity(d.toJSON()));

    const allAllocationDocs = await db.payment_allocations.find().exec();
    const allAllocations = allAllocationDocs.map((d: any) => toPaymentAllocationEntity(d.toJSON()));
    const clientSessionIds = sessions.map((s) => s.id);
    const clientAllocations = allAllocations.filter((a) =>
      clientSessionIds.includes(a.session_id)
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

    for (const allocation of clientAllocations) {
      const session = sessions.find((s) => s.id === allocation.session_id);
      if (!session) continue;

      const sessionDate = parseISO(session.date);
      const monthKey = format(sessionDate, 'yyyy-MM');

      if (monthlyData.has(monthKey)) {
        monthlyData.get(monthKey)!.allocations.push(allocation);
      }
    }

    const result: ClientMonthlyStats[] = [];

    for (const [, data] of monthlyData.entries()) {
      let total_sessions = 0;
      let paid_sessions = 0;
      let unpaid_sessions = 0;
      let partially_paid_sessions = 0;
      let total_debt = 0;
      let total_effective_allocated = 0;

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
        total_allocated: total_effective_allocated,
      });
    }

    return result.sort((a, b) => b.month.getTime() - a.month.getTime());
  }
}

export const analyticsService = new AnalyticsService();
