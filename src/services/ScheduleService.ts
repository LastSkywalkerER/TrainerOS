import { db } from '../db/database';
import {
  ScheduleTemplate,
  CreateTemplateDto,
  ScheduleRule,
  CalendarSession,
} from '../db/types';
import { generateId } from '../utils/uuid';
import { getWeekday, toISODate, getDatesInRange } from '../utils/dateUtils';
import { calendarSessionService } from './CalendarSessionService';

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

    const scheduleTemplate: ScheduleTemplate = {
      id: generateId(),
      client_id: clientId,
      timezone: template.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      rules,
      generation_horizon_days: template.generation_horizon_days || 90,
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

    await db.scheduleTemplates.update(id, updated);

    // Regenerate sessions if template changed
    if (updates.rules || updates.generation_horizon_days) {
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
    if (!client || (client.status !== 'active')) {
      // Don't generate sessions for paused/archived clients
      return [];
    }

    const horizon = horizonDays || template.generation_horizon_days;
    const today = new Date();
    const dates = getDatesInRange(today, horizon);
    const generatedSessions: CalendarSession[] = [];

    for (const rule of template.rules) {
      if (!rule.is_active) {
        continue;
      }

      for (const date of dates) {
        const weekday = getWeekday(date);
        if (weekday !== rule.weekday) {
          continue;
        }

        const dateStr = toISODate(date);

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
}

export const scheduleService = new ScheduleService();
