import { getDb } from '../db/rxdb';
import {
  ScheduleTemplate,
  CreateTemplateDto,
  ScheduleRule,
  CalendarSession,
} from '../db/types';
import { generateId } from '../utils/uuid';
import { getWeekday, toISODate, getDatesInRange, isDateInRange, getEndOfNextMonth, shouldAutoExtendSchedule } from '../utils/dateUtils';
import { calendarSessionService } from './CalendarSessionService';
import { isAfter, startOfDay } from 'date-fns';
import {
  toDbDate,
  toScheduleTemplateEntity,
  toClientEntity,
  scheduleTemplateToDb,
  stripUndefined,
} from '../db/dateHelpers';

export class ScheduleService {
  async createTemplate(
    clientId: string,
    template: CreateTemplateDto
  ): Promise<ScheduleTemplate> {
    const now = new Date();
    const rules: ScheduleRule[] = template.rules.map((rule) => ({
      ...rule,
      rule_id: generateId(),
      weekday: Number(rule.weekday) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    }));

    const validFrom = template.valid_from || now;
    const validTo = template.valid_to;

    const scheduleTemplate: ScheduleTemplate = {
      id: generateId(),
      client_id: clientId,
      timezone: template.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      rules,
      generation_horizon_days: template.generation_horizon_days || 90,
      valid_from: validFrom,
      valid_to: validTo,
      created_at: now,
      updated_at: now,
    };

    const db = await getDb();
    await db.schedule_templates.insert(stripUndefined(scheduleTemplateToDb(scheduleTemplate)));

    // Auto-generate sessions
    await this.generateSessions(scheduleTemplate.id);

    return scheduleTemplate;
  }

  async updateTemplate(
    id: string,
    updates: Partial<ScheduleTemplate>
  ): Promise<ScheduleTemplate> {
    const db = await getDb();
    const doc = await db.schedule_templates.findOne(id).exec();
    if (!doc) {
      throw new Error(`ScheduleTemplate with id ${id} not found`);
    }

    const template = toScheduleTemplateEntity(doc.toJSON());
    const updated: ScheduleTemplate = {
      ...template,
      ...updates,
      updated_at: new Date(),
    };

    if (updates.rules) {
      updated.rules = updates.rules.map((rule) => ({
        ...rule,
        rule_id: rule.rule_id || generateId(),
        weekday: Number(rule.weekday) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      }));
    }

    await doc.patch(stripUndefined(scheduleTemplateToDb(updated)));

    // If valid_to was updated, check if we need to cancel sessions
    if (updates.valid_to !== undefined) {
      const oldValidTo = template.valid_to;
      const newValidTo = updated.valid_to;

      const oldTimestamp = oldValidTo ? oldValidTo.getTime() : null;
      const newTimestamp = newValidTo ? newValidTo.getTime() : null;

      if (oldTimestamp && newTimestamp && newTimestamp < oldTimestamp && newValidTo) {
        await this.cancelSessionsAfterDate(template.client_id, newValidTo);
      } else if (!oldTimestamp && newTimestamp && newValidTo) {
        await this.cancelSessionsAfterDate(template.client_id, newValidTo);
      }
    }

    if (updates.rules || updates.generation_horizon_days || updates.valid_from || updates.valid_to) {
      const effectiveValidFrom = updated.valid_from || template.valid_from;

      if (updates.valid_from !== undefined && template.valid_from && updated.valid_from) {
        if (updated.valid_from > template.valid_from) {
          await this.cancelSessionsAfterDate(template.client_id, updated.valid_from);
        } else if (updated.valid_from < template.valid_from) {
          await this.cancelTemplateSessions(template.client_id);
        } else {
          if (effectiveValidFrom) {
            await this.cancelSessionsAfterDate(template.client_id, effectiveValidFrom);
          } else {
            await this.cancelTemplateSessions(template.client_id);
          }
        }
      } else {
        if (effectiveValidFrom) {
          await this.cancelSessionsAfterDate(template.client_id, effectiveValidFrom);
        } else {
          await this.cancelTemplateSessions(template.client_id);
        }
      }
      await this.generateSessions(id);
    }

    return updated;
  }

  async generateSessions(
    templateId: string,
    horizonDays?: number
  ): Promise<CalendarSession[]> {
    const db = await getDb();
    const doc = await db.schedule_templates.findOne(templateId).exec();
    if (!doc) {
      throw new Error(`ScheduleTemplate with id ${templateId} not found`);
    }

    const template = toScheduleTemplateEntity(doc.toJSON());

    const clientDoc = await db.clients.findOne(template.client_id).exec();
    if (!clientDoc) {
      return [];
    }
    const client = toClientEntity(clientDoc.toJSON());

    if (client.status === 'archived' && client.archive_date) {
      const archiveDate = startOfDay(client.archive_date);
      const today = startOfDay(new Date());
      if (today >= archiveDate) {
        return [];
      }
    }

    const today = new Date();
    let effectiveValidTo = template.valid_to;
    if (template.valid_to === undefined || template.valid_to === null) {
      effectiveValidTo = getEndOfNextMonth(new Date());
    } else if (shouldAutoExtendSchedule(template.valid_to)) {
      const newValidTo = getEndOfNextMonth(new Date());
      await doc.patch({ valid_to: toDbDate(newValidTo) });
      effectiveValidTo = newValidTo;
    }

    if (template.valid_to && isAfter(today, startOfDay(template.valid_to))) {
      return [];
    }

    if (client.status !== 'active') {
      return [];
    }

    const horizon = horizonDays || template.generation_horizon_days;
    const startDate = template.valid_from || today;
    const dates = getDatesInRange(startDate, horizon);
    const generatedSessions: CalendarSession[] = [];

    for (const rule of template.rules) {
      if (!rule.is_active) {
        continue;
      }

      for (const date of dates) {
        const dateStr = toISODate(date);

        if (template.valid_from) {
          const validFromStr = toISODate(template.valid_from);
          if (dateStr < validFromStr) {
            continue;
          }
        }
        if (effectiveValidTo) {
          const validToStr = toISODate(effectiveValidTo);
          if (dateStr > validToStr) {
            continue;
          }
        }

        if (client.pause_from && client.pause_to) {
          if (isDateInRange(date, client.pause_from, client.pause_to)) {
            continue;
          }
        }

        const weekday = getWeekday(date);
        if (Number(weekday) !== Number(rule.weekday)) {
          continue;
        }

        // Check if session already exists (idempotent generation)
        const existingDocs = await db.calendar_sessions.find({
          selector: {
            client_id: template.client_id,
            date: dateStr,
            start_time: rule.start_time,
          },
        }).exec();

        const existing = existingDocs.length > 0 ? existingDocs[0] : null;
        if (existing) {
          const existingData = existing.toJSON();
          if (existingData.status !== 'canceled' || existingData.is_custom) {
            continue;
          }
        }

        const session = await calendarSessionService.createFromTemplate(
          template.client_id,
          {
            date: dateStr,
            start_time: rule.start_time,
            price_override: rule.base_price,
          },
          rule.rule_id
        );

        generatedSessions.push(session);
      }
    }

    return generatedSessions;
  }

  async regenerateSessions(clientId: string): Promise<void> {
    const template = await this.getTemplateByClient(clientId);
    if (template) {
      await this.cancelTemplateSessions(clientId);
      await this.generateSessions(template.id);
    }
  }

  async cancelTemplateSessions(clientId: string): Promise<void> {
    const db = await getDb();
    const docs = await db.calendar_sessions.find({ selector: { client_id: clientId } }).exec();

    const sessionsToCancel = docs.filter((d: any) => {
      const data = d.toJSON();
      return !data.is_custom && data.status !== 'canceled';
    });

    for (const doc of sessionsToCancel) {
      await calendarSessionService.cancel(doc.id);
    }
  }

  async getTemplateByClient(clientId: string): Promise<ScheduleTemplate | null> {
    const db = await getDb();
    const docs = await db.schedule_templates.find({ selector: { client_id: clientId } }).exec();
    const templates = docs.map((d: any) => toScheduleTemplateEntity(d.toJSON()));

    // Sort by created_at and return the most recent
    templates.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    return templates.length > 0 ? templates[templates.length - 1] : null;
  }

  async getAllTemplatesByClient(clientId: string): Promise<ScheduleTemplate[]> {
    const db = await getDb();
    const docs = await db.schedule_templates.find({ selector: { client_id: clientId } }).exec();
    const templates = docs.map((d: any) => toScheduleTemplateEntity(d.toJSON()));
    templates.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    return templates;
  }

  async clearScheduleFromDate(clientId: string, archiveDate: Date): Promise<void> {
    const archiveDateStr = toISODate(archiveDate);
    const db = await getDb();
    const docs = await db.calendar_sessions.find({
      selector: {
        client_id: clientId,
        date: { $gte: archiveDateStr },
        status: { $ne: 'canceled' },
      },
    }).exec();

    for (const doc of docs) {
      await calendarSessionService.cancel(doc.id);
    }
  }

  async cancelSessionsAfterDate(clientId: string, date: Date): Promise<void> {
    const dateStr = toISODate(date);
    const db = await getDb();
    const docs = await db.calendar_sessions.find({
      selector: { client_id: clientId },
    }).exec();

    const sessionsToCancel = docs.filter((d: any) => {
      const data = d.toJSON();
      return data.date >= dateStr && data.status !== 'canceled' && !data.is_custom;
    });

    if (sessionsToCancel.length > 0) {
      console.log(`Canceling ${sessionsToCancel.length} sessions for client ${clientId} on or after ${dateStr}`);
      for (const doc of sessionsToCancel) {
        await calendarSessionService.cancel(doc.id);
      }
    }
  }

  async cancelSessionsBeforeDate(clientId: string, date: Date): Promise<void> {
    const dateStr = toISODate(date);
    const db = await getDb();
    const docs = await db.calendar_sessions.find({ selector: { client_id: clientId } }).exec();

    const sessionsToCancel = docs.filter((d: any) => {
      const data = d.toJSON();
      return data.date < dateStr && data.status !== 'canceled' && !data.is_custom;
    });

    for (const doc of sessionsToCancel) {
      await calendarSessionService.cancel(doc.id);
    }
  }
}

export const scheduleService = new ScheduleService();
