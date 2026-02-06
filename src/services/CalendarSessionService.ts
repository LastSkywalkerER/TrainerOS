import { getDb } from '../db/rxdb';
import {
  CalendarSession,
  CreateSessionDto,
} from '../db/types';
import { generateId } from '../utils/uuid';
import { format, parseISO } from 'date-fns';
import {
  toCalendarSessionEntity,
  calendarSessionToDb,
  stripUndefined,
} from '../db/dateHelpers';

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
      status: 'planned',
      is_custom: true,
      price_override: session.price_override,
      notes: session.notes,
      created_at: now,
      updated_at: now,
    };

    const db = await getDb();
    await db.calendar_sessions.insert(stripUndefined(calendarSessionToDb(calendarSession)));
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
      status: 'planned',
      template_rule_id: templateRuleId,
      is_custom: false,
      price_override: session.price_override,
      notes: session.notes,
      created_at: now,
      updated_at: now,
    };

    const db = await getDb();
    await db.calendar_sessions.insert(stripUndefined(calendarSessionToDb(calendarSession)));
    return calendarSession;
  }

  async update(
    id: string,
    updates: Partial<CalendarSession>
  ): Promise<CalendarSession> {
    const db = await getDb();
    const doc = await db.calendar_sessions.findOne(id).exec();
    if (!doc) {
      throw new Error(`CalendarSession with id ${id} not found`);
    }

    const session = toCalendarSessionEntity(doc.toJSON());

    // Check if main session parameters are being edited (not just notes or status)
    const isEditingMainParams =
      'date' in updates ||
      'start_time' in updates ||
      'price_override' in updates ||
      'client_id' in updates;

    const updated: CalendarSession = {
      ...session,
      ...updates,
      // Set is_edited to true if main parameters are being edited
      is_edited: isEditingMainParams ? true : session.is_edited,
      updated_at: new Date(),
    };

    await doc.patch(stripUndefined(calendarSessionToDb(updated)));
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
    const db = await getDb();
    const docs = await db.calendar_sessions.find({ selector: { client_id: clientId } }).exec();
    let sessions = docs.map((d: any) => toCalendarSessionEntity(d.toJSON()));

    if (filters?.dateFrom || filters?.dateTo) {
      sessions = sessions.filter((s) => {
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

    return sessions;
  }

  async getByDateRange(
    dateFrom: Date,
    dateTo: Date
  ): Promise<CalendarSession[]> {
    const db = await getDb();
    const fromDateStr = format(dateFrom, 'yyyy-MM-dd');
    const toDateStr = format(dateTo, 'yyyy-MM-dd');

    const docs = await db.calendar_sessions.find({
      selector: {
        date: { $gte: fromDateStr, $lte: toDateStr },
      },
    }).exec();

    return docs.map((d: any) => toCalendarSessionEntity(d.toJSON()));
  }

  async checkConflicts(
    date: string,
    time: string,
    excludeSessionId?: string
  ): Promise<CalendarSession[]> {
    const db = await getDb();
    const docs = await db.calendar_sessions.find({
      selector: {
        date: date,
        start_time: time,
        status: { $ne: 'canceled' },
      },
    }).exec();

    let sessions = docs.map((d: any) => toCalendarSessionEntity(d.toJSON()));

    if (excludeSessionId) {
      sessions = sessions.filter((s) => s.id !== excludeSessionId);
    }

    return sessions;
  }

  async getById(id: string): Promise<CalendarSession | null> {
    const db = await getDb();
    const doc = await db.calendar_sessions.findOne(id).exec();
    return doc ? toCalendarSessionEntity(doc.toJSON()) : null;
  }
}

export const calendarSessionService = new CalendarSessionService();
