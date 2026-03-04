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
const MAX_TEXT_LENGTH = 8000;
const ENV_API_KEY = (import.meta as any).env?.VITE_OPENROUTER_API_KEY as string | undefined;

const PARSE_PROMPT = `Ты помогаешь тренеру по фитнесу импортировать данные из файла в приложение.
Проанализируй данные ниже и извлеки клиентов, занятия и платежи.

Правила:
- date: формат YYYY-MM-DD. Преобразуй любые форматы дат (3 марта, 03.03, March 3, 03/03/2025 и т.д.)
- Если год не указан, используй текущий год
- time: формат HH:mm (24-часовой). "9 утра" → "09:00", "half past 3" → "15:30"
- status: только "planned", "completed" или "canceled". По умолчанию "planned"
- method: только "cash", "card", "transfer" или "other"
- Если поле неизвестно или не указано — используй null (не пустую строку)
- Один клиент может фигурировать в нескольких занятиях — это нормально
- Если видишь только имя клиента без занятия — добавь в clients
- Верни ТОЛЬКО валидный JSON без markdown-блоков, без комментариев

Целевая схема:
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

Данные из файла:
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
    const workbook = XLSX.read(buffer, { type: 'array' });

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
    // Удаляем возможные markdown-блоки
    const cleaned = content
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

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
  async applyImport(
    data: ParsedImportData,
    selectedClients: Set<number>,
    selectedSessions: Set<number>,
    selectedPayments: Set<number>
  ): Promise<ImportResult> {
    const result: ImportResult = {
      clientsCreated: 0,
      sessionsCreated: 0,
      paymentsCreated: 0,
      errors: [],
    };

    // Кэш: имя → client_id (для этой сессии импорта)
    const clientCache = new Map<string, string>();

    // Загружаем существующих клиентов для матчинга
    const existingClients = await clientService.getAll();

    const findOrCreateClient = async (name: string): Promise<string | null> => {
      const nameLower = name.toLowerCase().trim();

      if (clientCache.has(nameLower)) {
        return clientCache.get(nameLower)!;
      }

      // Ищем по имени (substring match в обе стороны)
      const match = existingClients.find((c) => {
        const cLower = c.full_name.toLowerCase();
        return cLower.includes(nameLower) || nameLower.includes(cLower);
      });

      if (match) {
        clientCache.set(nameLower, match.id);
        return match.id;
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
