import { db } from '../db/database';
import {
  ScheduleTemplate,
  CreateTemplateDto,
  ScheduleRule,
  CalendarSession,
} from '../db/types';
import { generateId } from '../utils/uuid';
import { getWeekday, toISODate, getDatesInRange, isDateInRange, getEndOfNextMonth, shouldAutoExtendSchedule } from '../utils/dateUtils';
import { calendarSessionService } from './CalendarSessionService';
import { addDays, differenceInCalendarDays, isAfter, startOfDay } from 'date-fns';

export class ScheduleService {
  /**
   * Ensures schedule templates for the given clients have generated sessions up to `dateTo`.
   * For auto-extend schedules this may also roll `valid_to` forward.
   */
  async ensureSessionsUpTo(dateTo: Date, clientIds?: string[]): Promise<void> {
    const targetDate = startOfDay(dateTo);
    const today = startOfDay(new Date());
    const neededHorizon = Math.max(1, differenceInCalendarDays(targetDate, today) + 1);

    const templates = clientIds && clientIds.length > 0
      ? await db.scheduleTemplates.where('client_id').anyOf(clientIds).toArray()
      : await db.scheduleTemplates.toArray();

    for (const tmpl of templates) {
      const isAutoExtend = tmpl.auto_extend ?? (tmpl.valid_to === undefined || tmpl.valid_to === null);

      if (isAutoExtend) {
        // Keep at least one full next month ahead of the target date (and of today).
        const desiredBase = isAfter(targetDate, today) ? targetDate : today;
        const desiredValidTo = getEndOfNextMonth(desiredBase);

        if (!tmpl.valid_to || isAfter(desiredValidTo, tmpl.valid_to)) {
          await db.scheduleTemplates.update(tmpl.id, {
            valid_to: desiredValidTo,
            auto_extend: true,
          });
        }
      }

      await this.generateSessions(tmpl.id, neededHorizon);
    }
  }

  async createTemplate(
    clientId: string,
    template: CreateTemplateDto
  ): Promise<ScheduleTemplate> {
    const now = new Date();
    const rules: ScheduleRule[] = template.rules.map((rule) => ({
      ...rule,
      rule_id: generateId(),
    }));

    // Set valid_from to today if not provided
    const validFrom = template.valid_from || now;
    const autoExtend = template.auto_extend ?? false;

    // For auto-extend schedules we always keep a rolling valid_to (end of next month).
    // For fixed schedules, valid_to may be omitted.
    let validTo = template.valid_to;
    if (autoExtend) {
      validTo = validTo ?? getEndOfNextMonth(now);
    }

    const scheduleTemplate: ScheduleTemplate = {
      id: generateId(),
      client_id: clientId,
      timezone: template.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      rules,
      generation_horizon_days: template.generation_horizon_days || 90,
      valid_from: validFrom,
      valid_to: validTo,
      auto_extend: autoExtend,
      created_at: now,
      updated_at: now,
    };

    await db.scheduleTemplates.add(scheduleTemplate);

    // Auto-generate sessions
    await this.generateSessions(scheduleTemplate.id);

    return scheduleTemplate;
  }

  async updateTemplate(
    id: string,
    updates: Partial<ScheduleTemplate>
  ): Promise<ScheduleTemplate> {
    const template = await db.scheduleTemplates.get(id);
    if (!template) {
      throw new Error(`ScheduleTemplate with id ${id} not found`);
    }

    const updated: ScheduleTemplate = {
      ...template,
      ...updates,
      updated_at: new Date(),
    };

    // If rules changed, regenerate sessions
    if (updates.rules) {
      updated.rules = updates.rules.map((rule) => ({
        ...rule,
        rule_id: rule.rule_id || generateId(),
      }));
    }

    // If switching to auto-extend and valid_to is missing, initialize rolling horizon.
    if (updated.auto_extend && !updated.valid_to) {
      updated.valid_to = getEndOfNextMonth(new Date());
    }

    await db.scheduleTemplates.update(id, updated);

    // If valid_to was updated, check if we need to cancel sessions
    // Do this BEFORE regenerating sessions to avoid recreating canceled sessions
    if (updates.valid_to !== undefined) {
      const oldValidTo = template.valid_to;
      const newValidTo = updated.valid_to;
      
      // Compare dates properly - convert to timestamps for reliable comparison
      const oldTimestamp = oldValidTo ? oldValidTo.getTime() : null;
      const newTimestamp = newValidTo ? newValidTo.getTime() : null;
      
      // If valid_to was set to an earlier date, cancel sessions on/after the new date
      if (oldTimestamp && newTimestamp && newTimestamp < oldTimestamp && newValidTo) {
        // New date is earlier - cancel sessions on or after new date
        await this.cancelSessionsAfterDate(template.client_id, newValidTo);
      } else if (!oldTimestamp && newTimestamp && newValidTo) {
        // valid_to was set for the first time - cancel sessions on or after that date
        await this.cancelSessionsAfterDate(template.client_id, newValidTo);
      }
    }

    // If valid_from was updated to a later date, cancel sessions before that date
    if (updates.valid_from !== undefined && template.valid_from && updated.valid_from) {
      if (updated.valid_from > template.valid_from) {
        await this.cancelSessionsBeforeDate(template.client_id, updated.valid_from);
      }
    }

    // Regenerate sessions if template changed
    // This will respect the new valid_to and not create sessions after it
    if (updates.rules || updates.generation_horizon_days || updates.valid_from || updates.valid_to || updates.auto_extend !== undefined) {
      await this.generateSessions(id);
    }

    return updated;
  }

  async generateSessions(
    templateId: string,
    horizonDays?: number
  ): Promise<CalendarSession[]> {
    const template = await db.scheduleTemplates.get(templateId);
    if (!template) {
      throw new Error(`ScheduleTemplate with id ${templateId} not found`);
    }

    const client = await db.clients.get(template.client_id);
    if (!client) {
      return [];
    }

    // Auto-extend rolling schedules by keeping valid_to at least "end of next month".
    // Backward compatibility: legacy "no end date" templates stored without valid_to.
    const isAutoExtend = template.auto_extend ?? (template.valid_to === undefined || template.valid_to === null);
    if (isAutoExtend) {
      const desiredValidTo = getEndOfNextMonth(new Date());
      if (!template.valid_to || shouldAutoExtendSchedule(template.valid_to)) {
        if (!template.valid_to || isAfter(desiredValidTo, template.valid_to)) {
          await db.scheduleTemplates.update(templateId, { valid_to: desiredValidTo });
          template.valid_to = desiredValidTo;
          template.auto_extend = true;
        }
      }
    }

    const horizon = horizonDays || template.generation_horizon_days;
    const today = startOfDay(new Date());

    // Generation range:
    // - start at valid_from (so backdated schedules generate sessions in the past)
    // - end at today + horizonDays (future horizon)
    // - also respect valid_to if provided
    const rangeStart = startOfDay(template.valid_from ?? today);
    let rangeEnd = startOfDay(addDays(today, Math.max(0, horizon - 1)));
    if (template.valid_to) {
      const vt = startOfDay(template.valid_to);
      if (vt < rangeEnd) {
        rangeEnd = vt;
      }
    }

    if (rangeEnd < rangeStart) {
      return [];
    }

    const daysToGenerate = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
    const dates = getDatesInRange(rangeStart, daysToGenerate);
    const generatedSessions: CalendarSession[] = [];

    for (const rule of template.rules) {
      if (!rule.is_active) {
        continue;
      }

      for (const date of dates) {
        const dateStr = toISODate(date);
        
        // Check if date is within schedule validity period
        if (template.valid_from) {
          const validFromStr = toISODate(template.valid_from);
          if (dateStr < validFromStr) {
            continue;
          }
        }
        if (template.valid_to) {
          const validToStr = toISODate(template.valid_to);
          // Skip dates after valid_to (dates > valid_to)
          if (dateStr > validToStr) {
            continue;
          }
        }

        // Check if date is in pause period
        if (client.pause_from && client.pause_to) {
          if (isDateInRange(date, client.pause_from, client.pause_to)) {
            continue; // Skip dates in pause period
          }
        }

        // Check if date is on or after archive_date
        if (client.archive_date) {
          const archiveDateStr = toISODate(client.archive_date);
          const dateStr = toISODate(date);
          if (dateStr >= archiveDateStr) {
            continue; // Skip dates on or after archive_date
          }
        }

        const weekday = getWeekday(date);
        if (weekday !== rule.weekday) {
          continue;
        }

        // dateStr already defined above

        // Check if session already exists (idempotent generation)
        const existing = await db.calendarSessions
          .where('[client_id+date]')
          .equals([template.client_id, dateStr])
          .and((s) => s.start_time === rule.start_time)
          .first();

        if (existing) {
          // Skip if exists and is not canceled (don't overwrite custom or planned sessions)
          if (existing.status !== 'canceled' || existing.is_custom) {
            continue;
          }
        }

        // Create session with base_price from rule if set
        const session = await calendarSessionService.createFromTemplate(
          template.client_id,
          {
            date: dateStr,
            start_time: rule.start_time,
            duration_minutes: rule.duration_minutes,
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
      await this.generateSessions(template.id);
    }
  }

  async getTemplateByClient(clientId: string): Promise<ScheduleTemplate | null> {
    const templates = await db.scheduleTemplates
      .where('client_id')
      .equals(clientId)
      .sortBy('created_at');

    // Return the most recent template
    return templates.length > 0 ? templates[templates.length - 1] : null;
  }

  async getAllTemplatesByClient(clientId: string): Promise<ScheduleTemplate[]> {
    return db.scheduleTemplates
      .where('client_id')
      .equals(clientId)
      .sortBy('created_at');
  }

  async clearScheduleFromDate(clientId: string, archiveDate: Date): Promise<void> {
    // Cancel all future sessions starting from archive_date
    const archiveDateStr = toISODate(archiveDate);
    const sessions = await db.calendarSessions
      .where('client_id')
      .equals(clientId)
      .and((s) => s.date >= archiveDateStr && s.status !== 'canceled')
      .toArray();

    for (const session of sessions) {
      await calendarSessionService.cancel(session.id);
    }
  }

  async cancelSessionsAfterDate(clientId: string, date: Date): Promise<void> {
    // Cancel all sessions on or after the specified date (only template-generated sessions)
    // Note: date is the valid_to date, so we cancel sessions >= date (on or after)
    const dateStr = toISODate(date);
    
    const allSessions = await db.calendarSessions
      .where('client_id')
      .equals(clientId)
      .toArray();
    
    // Filter sessions that are on or after the date, not canceled, and not custom
    const sessionsToCancel = allSessions.filter((s) => 
      s.date >= dateStr && 
      s.status !== 'canceled' && 
      !s.is_custom
    );
    
    if (sessionsToCancel.length > 0) {
      console.log(`Canceling ${sessionsToCancel.length} sessions for client ${clientId} on or after ${dateStr}`);
      
      for (const session of sessionsToCancel) {
        await calendarSessionService.cancel(session.id);
      }
    }
  }

  async cancelSessionsBeforeDate(clientId: string, date: Date): Promise<void> {
    // Cancel all sessions before the specified date (only template-generated sessions)
    const dateStr = toISODate(date);
    const sessions = await db.calendarSessions
      .where('client_id')
      .equals(clientId)
      .and((s) => s.date < dateStr && s.status !== 'canceled' && !s.is_custom)
      .toArray();

    for (const session of sessions) {
      await calendarSessionService.cancel(session.id);
    }
  }
}

export const scheduleService = new ScheduleService();
