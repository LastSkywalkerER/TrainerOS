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
import { isBefore, isAfter, startOfDay } from 'date-fns';

export class ScheduleService {
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
    // Set valid_to to end of next month if not provided (auto-extend)
    let validTo = template.valid_to;
    if (!validTo) {
      validTo = getEndOfNextMonth(now);
    }

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

    // Handle valid_to auto-extend logic only if valid_to is explicitly set to undefined/null
    // If user provides a date (even if earlier), respect it
    if (updates.valid_to === undefined && !updated.valid_to) {
      // Only auto-set if valid_to was not provided and is not set
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
      if (oldTimestamp && newTimestamp && newTimestamp < oldTimestamp) {
        // New date is earlier - cancel sessions on or after new date
        await this.cancelSessionsAfterDate(template.client_id, newValidTo);
      } else if (!oldTimestamp && newTimestamp) {
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
    if (updates.rules || updates.generation_horizon_days || updates.valid_from || updates.valid_to) {
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

    // Check if client is archived - don't generate sessions after archive_date
    if (client.archive_date) {
      const archiveDate = startOfDay(client.archive_date);
      const today = startOfDay(new Date());
      if (today >= archiveDate) {
        return [];
      }
    }

    // Check auto-extend logic for schedule validity
    // Only auto-extend if valid_to is not set (undefined/null) - meaning user wants auto-extend
    // If valid_to is explicitly set by user, respect their choice even if it's in the past
    // We check if valid_to is undefined/null, not just if it's falsy
    if (template.valid_to === undefined || template.valid_to === null) {
      // Auto-extend valid_to to end of next month only if it was not explicitly set
      const newValidTo = getEndOfNextMonth(new Date());
      await db.scheduleTemplates.update(templateId, { valid_to: newValidTo });
      template.valid_to = newValidTo;
    } else if (shouldAutoExtendSchedule(template.valid_to)) {
      // If valid_to is set but approaching expiration, auto-extend (only for auto-extended schedules)
      // But we need to be careful - if user just set a date, don't override it
      // This should only happen for schedules that were previously auto-extended
      // For now, we'll skip this to avoid overriding user's explicit choice
    }

    // Check schedule validity period
    const today = new Date();
    if (template.valid_from && isBefore(today, startOfDay(template.valid_from))) {
      // Schedule hasn't started yet
      return [];
    }

    if (template.valid_to && isAfter(today, startOfDay(template.valid_to))) {
      // Schedule has expired
      return [];
    }

    // Don't generate sessions for paused clients (but allow if they're active)
    if (client.status !== 'active') {
      return [];
    }

    const horizon = horizonDays || template.generation_horizon_days;
    const dates = getDatesInRange(today, horizon);
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
