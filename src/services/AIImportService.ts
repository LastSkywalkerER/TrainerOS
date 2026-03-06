import * as XLSX from 'xlsx';
import { secureKeyStore } from './SecureKeyStore';
import { clientService } from './ClientService';
import { calendarSessionService } from './CalendarSessionService';
import { paymentService } from './PaymentService';
import { SessionStatus, PaymentMethod } from '../db/types';

export interface ParsedClient {
  name: string;
  phone?: string;
  telegram?: string;
  notes?: string;
}

export interface ParsedSession {
  client_name: string;
  date: string;         // YYYY-MM-DD
  time?: string;        // HH:mm
  status?: SessionStatus;
  price?: number;
  notes?: string;
}

export interface ParsedPayment {
  client_name: string;
  amount: number;
  date?: string;        // YYYY-MM-DD
  method?: PaymentMethod;
  comment?: string;
}

export interface ParsedImportData {
  clients: ParsedClient[];
  sessions: ParsedSession[];
  payments: ParsedPayment[];
}

export interface ImportResult {
  clientsCreated: number;
  sessionsCreated: number;
  paymentsCreated: number;
  errors: string[];
}

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-2.0-flash-001';
const MAX_TEXT_LENGTH = 16000;
const ENV_API_KEY = (import.meta as any).env?.VITE_OPENROUTER_API_KEY as string | undefined;

const PARSE_PROMPT = `You are helping a fitness trainer import data from a file into a training management app.

STEP 1 — STRUCTURE ANALYSIS:
Before extracting data, identify the file's pattern:
- What do sheet/tab names represent? (client names, trainer names, weekdays, activity types — or something else? Do not assume.)
- What serves as section headers within a sheet? (workout dates, client names, activity types — or something else?)
- How is data formatted under the headers? (exercises as NxM sets/reps, body measurements, payment records, schedule — or something else?)
Write a brief 1-2 sentence description of the pattern before the JSON.

STEP 2 — EXTRACTION:
Based on the identified pattern, extract clients, sessions, and payments.

Rules:
- If a section header is a date: all content in that section (until the next date) = one session. Store ALL content (exercises, measurements, any other data) in the session's notes field — regardless of what type of data it is.
- If a section header is a client name: the content = that client's sessions or data.
- If a sheet = a client: all sessions on that sheet belong to that client.
- If a sheet = a trainer or a day: look for client names inside the sheet as sub-headers.
- Adapt to the actual file structure — do not force a template.
- date: YYYY-MM-DD format. Convert any format (3 марта, 03.03, 2025-01-09, Mar 3, etc.). If the year is missing, infer it from neighboring dates or use the current year.
- time: HH:mm format (24-hour). "9 утра" → "09:00"
- status: only "planned", "completed", or "canceled". Default: "planned"
- method: only "cash", "card", "transfer", or "other"
- If a field is unknown — use null
- session notes: convert ALL content under a session header into clean, human-readable multi-line text. Use this universal approach: identify what each row/column represents by its label or position, then write each logical item on its own line as "Label: value1, value2, ...". Examples by content type:
  * Workout table (col headers = exercises, rows = sets): "Жим ногами: 10x15, 20x15, 39x15\nРазведение ног: 30x12, 40x13"
  * Transposed workout (row headers = exercises, cols = sets): same result — transpose mentally and write exercise per line
  * Body measurements (row headers = body part, cols = dates or attempts): "Плечи: 127, 127.6, 122\nГрудь: 104.3, 105.5, 102\nТалия: 102, 98.1"
  * Free text or mixed: preserve as-is, one logical item per line
  * Preserve inline comments ("отказ", "около отказ", "чуть криво") next to their value
  * Ignore empty cells — do not write "null" or blank entries
- One client can appear in multiple sessions — that is normal
- Return ONLY valid JSON with no markdown blocks and no comments

Target schema:
{
  "clients": [
    { "name": "string", "phone": "string|null", "telegram": "string|null", "notes": "string|null" }
  ],
  "sessions": [
    { "client_name": "string", "date": "YYYY-MM-DD", "time": "HH:mm|null", "status": "planned|completed|canceled", "price": number|null, "notes": "string|null" }
  ],
  "payments": [
    { "client_name": "string", "amount": number, "date": "YYYY-MM-DD|null", "method": "cash|card|transfer|other|null", "comment": "string|null" }
  ]
}

File data:
`;

class AIImportService {
  async getApiKey(): Promise<string | null> {
    const stored = await secureKeyStore.loadKey();
    return stored || ENV_API_KEY || null;
  }

  async setApiKey(key: string): Promise<void> {
    return secureKeyStore.saveKey(key);
  }

  async clearApiKey(): Promise<void> {
    return secureKeyStore.clearKey();
  }

  async hasApiKey(): Promise<boolean> {
    const key = await secureKeyStore.loadKey();
    return !!(key || ENV_API_KEY);
  }

  // Читает файл и возвращает текстовое содержимое
  async readFile(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      return this._readExcel(file);
    }

    // CSV, TXT и прочее — читаем как текст
    return file.text();
  }

  private async _readExcel(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    const lines: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { skipHidden: true });
      if (csv.trim()) {
        if (workbook.SheetNames.length > 1) {
          lines.push(`=== Лист: ${sheetName} ===`);
        }
        lines.push(csv);
      }
    }

    return lines.join('\n');
  }

  // Отправляет текст в OpenRouter API и возвращает распознанные данные
  async parseText(rawText: string): Promise<ParsedImportData> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('API-ключ OpenRouter не задан');
    }

    const truncated = rawText.slice(0, MAX_TEXT_LENGTH);
    const prompt = PARSE_PROMPT + truncated;

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Trainer OS',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401) {
        throw new Error('Неверный API-ключ OpenRouter');
      }
      if (response.status === 429) {
        throw new Error('Превышен лимит запросов OpenRouter. Попробуйте позже.');
      }
      throw new Error(`Ошибка OpenRouter API: ${response.status} — ${body.slice(0, 200)}`);
    }

    const json = await response.json();
    const content: string = json.choices?.[0]?.message?.content ?? '';

    return this._parseResponse(content);
  }

  private _parseResponse(content: string): ParsedImportData {
    // Strip markdown code blocks, then extract the JSON object/array
    const withoutFences = content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '');

    // Find the first { or [ to skip any preamble text (e.g. structure analysis)
    const jsonStart = Math.min(
      withoutFences.indexOf('{') === -1 ? Infinity : withoutFences.indexOf('{'),
      withoutFences.indexOf('[') === -1 ? Infinity : withoutFences.indexOf('['),
    );
    const cleaned = jsonStart === Infinity ? withoutFences.trim() : withoutFences.slice(jsonStart).trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('Не удалось разобрать ответ AI. Попробуйте снова или упростите файл.');
    }

    const clients: ParsedClient[] = (parsed.clients ?? [])
      .filter((c: any) => c?.name)
      .map((c: any) => ({
        name: String(c.name),
        phone: c.phone ?? undefined,
        telegram: c.telegram ?? undefined,
        notes: c.notes ?? undefined,
      }));

    const sessions: ParsedSession[] = (parsed.sessions ?? [])
      .filter((s: any) => s?.client_name && s?.date)
      .map((s: any) => ({
        client_name: String(s.client_name),
        date: String(s.date),
        time: s.time ?? undefined,
        status: (['planned', 'completed', 'canceled'].includes(s.status) ? s.status : 'planned') as SessionStatus,
        price: typeof s.price === 'number' ? s.price : undefined,
        notes: s.notes ?? undefined,
      }));

    const payments: ParsedPayment[] = (parsed.payments ?? [])
      .filter((p: any) => p?.client_name && typeof p?.amount === 'number')
      .map((p: any) => ({
        client_name: String(p.client_name),
        amount: Number(p.amount),
        date: p.date ?? undefined,
        method: (['cash', 'card', 'transfer', 'other'].includes(p.method) ? p.method : 'other') as PaymentMethod,
        comment: p.comment ?? undefined,
      }));

    return { clients, sessions, payments };
  }

  // Применяет распознанные данные к БД
  // clientMapping: имя из файла → существующий client_id (или null = создать нового)
  async applyImport(
    data: ParsedImportData,
    selectedClients: Set<number>,
    selectedSessions: Set<number>,
    selectedPayments: Set<number>,
    clientMapping: Map<string, string | null> = new Map()
  ): Promise<ImportResult> {
    const result: ImportResult = {
      clientsCreated: 0,
      sessionsCreated: 0,
      paymentsCreated: 0,
      errors: [],
    };

    // Кэш: имя (lowercase) → client_id
    const clientCache = new Map<string, string>();

    // Загружаем существующих клиентов (нужны для создания новых)
    const existingClients = await clientService.getAll();

    const findOrCreateClient = async (name: string): Promise<string | null> => {
      const nameLower = name.toLowerCase().trim();

      if (clientCache.has(nameLower)) {
        return clientCache.get(nameLower)!;
      }

      // Если есть явный маппинг от пользователя
      if (clientMapping.has(name)) {
        const mappedId = clientMapping.get(name)!;
        if (mappedId) {
          clientCache.set(nameLower, mappedId);
          return mappedId;
        }
        // null = создать нового (не искать автоматически)
      }

      // Создаём нового
      try {
        const created = await clientService.create({ full_name: name });
        existingClients.push(created);
        clientCache.set(nameLower, created.id);
        result.clientsCreated++;
        return created.id;
      } catch (e) {
        result.errors.push(`Не удалось создать клиента "${name}": ${e}`);
        return null;
      }
    };

    // Импорт выбранных клиентов (только те, кого нет в БД)
    for (let i = 0; i < data.clients.length; i++) {
      if (!selectedClients.has(i)) continue;
      const c = data.clients[i];
      await findOrCreateClient(c.name);
      // Обновляем телефон/телеграм если новые данные есть
      const clientId = clientCache.get(c.name.toLowerCase().trim());
      if (clientId && (c.phone || c.telegram || c.notes)) {
        const existing = existingClients.find((x) => x.id === clientId);
        if (existing) {
          const updates: Partial<typeof existing> = {};
          if (c.phone && !existing.phone) updates.phone = c.phone;
          if (c.telegram && !existing.telegram) updates.telegram = c.telegram;
          if (c.notes && !existing.notes) updates.notes = c.notes;
          if (Object.keys(updates).length > 0) {
            try {
              await clientService.update(clientId, updates);
            } catch {
              // не критично
            }
          }
        }
      }
    }

    // Импорт выбранных занятий
    for (let i = 0; i < data.sessions.length; i++) {
      if (!selectedSessions.has(i)) continue;
      const s = data.sessions[i];
      try {
        const clientId = await findOrCreateClient(s.client_name);
        if (!clientId) continue;

        await calendarSessionService.createCustom(clientId, {
          date: s.date,
          start_time: s.time ?? '09:00',
          price_override: s.price,
          notes: s.notes,
        });

        // Если занятие завершено — меняем статус
        if (s.status === 'completed' || s.status === 'canceled') {
          const db = await import('../db/rxdb').then((m) => m.getDb());
          const sessions = await db.calendar_sessions
            .find({ selector: { client_id: clientId, date: s.date, start_time: s.time ?? '09:00' } })
            .exec();
          if (sessions.length > 0) {
            await sessions[sessions.length - 1].patch({ status: s.status });
          }
        }

        result.sessionsCreated++;
      } catch (e) {
        result.errors.push(`Занятие ${s.date} (${s.client_name}): ${e}`);
      }
    }

    // Импорт выбранных платежей
    for (let i = 0; i < data.payments.length; i++) {
      if (!selectedPayments.has(i)) continue;
      const p = data.payments[i];
      try {
        const clientId = await findOrCreateClient(p.client_name);
        if (!clientId) continue;

        await paymentService.create(clientId, {
          amount: p.amount,
          method: p.method ?? 'other',
          paid_at: p.date ? new Date(p.date) : new Date(),
          comment: p.comment,
        });
        result.paymentsCreated++;
      } catch (e) {
        result.errors.push(`Платёж ${p.amount} (${p.client_name}): ${e}`);
      }
    }

    return result;
  }
}

export const aiImportService = new AIImportService();
