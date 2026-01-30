import { db } from '../db/database';
import {
  CalendarSession,
  CreateSessionDto,
} from '../db/types';
import { generateId } from '../utils/uuid';
import { format, parseISO } from 'date-fns';

export class CalendarSessionService {
  async createCustom(
    clientId: string,
    session: CreateSessionDto
  ): Promise<CalendarSession> {
    const now = new Date();
    const calendarSession: CalendarSession = {
      id: generateId(),
      client_id: clientId,
      date: session.date,
      start_time: session.start_time,
      duration_minutes: session.duration_minutes,
      status: 'planned',
      is_custom: true,
      price_override: session.price_override,
      notes: session.notes,
      created_at: now,
      updated_at: now,
    };

    await db.calendarSessions.add(calendarSession);
    return calendarSession;
  }

  async createFromTemplate(
    clientId: string,
    session: CreateSessionDto,
    templateRuleId: string
  ): Promise<CalendarSession> {
    const now = new Date();
    const calendarSession: CalendarSession = {
      id: generateId(),
      client_id: clientId,
      date: session.date,
      start_time: session.start_time,
      duration_minutes: session.duration_minutes,
      status: 'planned',
      template_rule_id: templateRuleId,
      is_custom: false,
      price_override: session.price_override,
      notes: session.notes,
      created_at: now,
      updated_at: now,
    };

    await db.calendarSessions.add(calendarSession);
    return calendarSession;
  }

  async update(
    id: string,
    updates: Partial<CalendarSession>
  ): Promise<CalendarSession> {
    const session = await db.calendarSessions.get(id);
    if (!session) {
      throw new Error(`CalendarSession with id ${id} not found`);
    }

    const updated: CalendarSession = {
      ...session,
      ...updates,
      updated_at: new Date(),
    };

    await db.calendarSessions.update(id, updated);
    return updated;
  }

  async cancel(id: string): Promise<void> {
    await this.update(id, { status: 'canceled' });
  }

  async complete(id: string): Promise<void> {
    await this.update(id, { status: 'completed' });
  }

  async move(
    id: string,
    newDate: string,
    newTime: string
  ): Promise<CalendarSession> {
    return this.update(id, {
      date: newDate,
      start_time: newTime,
    });
  }

  async getByClient(
    clientId: string,
    filters?: { dateFrom?: Date; dateTo?: Date }
  ): Promise<CalendarSession[]> {
    let query = db.calendarSessions.where('client_id').equals(clientId);

    if (filters?.dateFrom || filters?.dateTo) {
      const sessions = await query.toArray();
      return sessions.filter((s) => {
        const sessionDate = parseISO(s.date);
        if (filters.dateFrom && sessionDate < filters.dateFrom) {
          return false;
        }
        if (filters.dateTo && sessionDate > filters.dateTo) {
          return false;
        }
        return true;
      });
    }

    return query.toArray();
  }

  async getByDateRange(
    dateFrom: Date,
    dateTo: Date
  ): Promise<CalendarSession[]> {
    const sessions = await db.calendarSessions.toArray();
    const fromDateStr = format(dateFrom, 'yyyy-MM-dd');
    const toDateStr = format(dateTo, 'yyyy-MM-dd');
    
    return sessions.filter((s) => {
      // Compare date strings for exact date matching
      return s.date >= fromDateStr && s.date <= toDateStr;
    });
  }

  async checkConflicts(
    date: string,
    time: string,
    excludeSessionId?: string
  ): Promise<CalendarSession[]> {
    const sessions = await db.calendarSessions
      .where('date')
      .equals(date)
      .and((s) => s.start_time === time && s.status !== 'canceled')
      .toArray();

    if (excludeSessionId) {
      return sessions.filter((s) => s.id !== excludeSessionId);
    }

    return sessions;
  }

  async getById(id: string): Promise<CalendarSession | null> {
    const session = await db.calendarSessions.get(id);
    return session ?? null;
  }
}

export const calendarSessionService = new CalendarSessionService();
