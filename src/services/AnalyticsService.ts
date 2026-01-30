import { db } from '../db/database';
import {
  ClientStats,
  MonthlyStats,
  CalendarSession,
} from '../db/types';
import { getAllocatedAmount, calculateSessionPrice } from '../utils/calculations';
import { parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

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

    for (const session of sessions) {
      if (session.status === 'canceled') {
        continue;
      }

      total_sessions++;
      const allocated = await getAllocatedAmount(session.id);
      const price = await calculateSessionPrice(clientId, session.id);

      if (allocated >= price) {
        paid_sessions++;
      } else if (allocated > 0) {
        partially_paid_sessions++;
        unpaid_sessions++;
        total_debt += price - allocated;
      } else {
        unpaid_sessions++;
        total_debt += price;
      }

      // Find next unpaid session
      if (!nextUnpaidSession && allocated < price) {
        const sessionDate = parseISO(session.date);
        const now = new Date();
        if (sessionDate >= now) {
          nextUnpaidSession = session;
        }
      } else if (nextUnpaidSession && allocated < price) {
        const sessionDate = parseISO(session.date);
        const nextDate = parseISO(nextUnpaidSession.date);
        if (sessionDate < nextDate && sessionDate >= new Date()) {
          nextUnpaidSession = session;
        }
      }
    }

    const total_paid = payments.reduce((sum, p) => sum + p.amount, 0);

    // Calculate total allocated
    const allocations = await db.paymentAllocations.toArray();
    const clientSessions = sessions.map((s) => s.id);
    const total_allocated = allocations
      .filter((a) => clientSessions.includes(a.session_id))
      .reduce((sum, a) => sum + a.allocated_amount, 0);

    const balance = total_paid - total_allocated;

    return {
      total_sessions,
      paid_sessions,
      unpaid_sessions,
      partially_paid_sessions,
      total_paid,
      total_allocated,
      total_debt,
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
}

export const analyticsService = new AnalyticsService();
