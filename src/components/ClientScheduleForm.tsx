import { useState, useEffect } from 'react';
import { ScheduleTemplate, ScheduleRule, CalendarSession, Client } from '../db/types';
import { scheduleService } from '../services/ScheduleService';
import { calendarSessionService } from '../services/CalendarSessionService';
import { clientService } from '../services/ClientService';
import { generateId } from '../utils/uuid';
import { toISODate, formatDate, getWeekday } from '../utils/dateUtils';
import { getEndOfNextMonth } from '../utils/dateUtils';
import { addDays } from 'date-fns';
import { ConfirmDialog } from './ConfirmDialog';

interface ClientScheduleFormProps {
  clientId: string;
  onSave?: () => void;
}

export function ClientScheduleForm({ clientId, onSave }: ClientScheduleFormProps) {
  const [template, setTemplate] = useState<ScheduleTemplate | null>(null);
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [conflicts, setConflicts] = useState<CalendarSession[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [formData, setFormData] = useState({
    weekday: 1 as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    start_time: '09:00',
    base_price: '',
    is_active: true,
  });
  const [templatePeriod, setTemplatePeriod] = useState({
    valid_from: toISODate(new Date()),
    valid_to: '',
    noEndDate: true,
  });

  useEffect(() => {
    loadTemplate();
    loadClients();
  }, [clientId]);

  useEffect(() => {
    if (showAddForm) {
      checkConflicts();
    }
  }, [formData.weekday, formData.start_time, showAddForm]);

  async function loadTemplate() {
    const existingTemplate = await scheduleService.getTemplateByClient(clientId);
    if (existingTemplate) {
      setTemplate(existingTemplate);
      // Ensure weekday is a number when loading from database
      const normalizedRules = existingTemplate.rules.map((rule) => ({
        ...rule,
        weekday: Number(rule.weekday) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
      }));
      setRules(normalizedRules);
      setTemplatePeriod({
        valid_from: existingTemplate.valid_from ? toISODate(existingTemplate.valid_from) : toISODate(new Date()),
        valid_to: existingTemplate.valid_to ? toISODate(existingTemplate.valid_to) : '',
        noEndDate: existingTemplate.valid_to === undefined || existingTemplate.valid_to === null,
      });
    } else {
      setTemplate(null);
      setRules([]);
      setTemplatePeriod({
        valid_from: toISODate(new Date()),
        valid_to: '',
        noEndDate: true,
      });
    }
  }

  async function loadClients() {
    const allClients = await clientService.getAll();
    setClients(allClients);
  }

  async function checkConflicts() {
    if (!formData.weekday || !formData.start_time) {
      setConflicts([]);
      return;
    }

    // Check conflicts for the next 8 occurrences of the selected weekday
    const today = new Date();
    const conflictsList: CalendarSession[] = [];
    const checkedDates = new Set<string>();

    // Find the first occurrence of the target weekday
    const currentWeekday = getWeekday(today);
    let daysUntilFirst = (formData.weekday - currentWeekday + 7) % 7;
    if (daysUntilFirst === 0) {
      daysUntilFirst = 7; // If today is the target weekday, check next week's occurrence
    }
    let firstDate = addDays(today, daysUntilFirst);

    // Check the next 8 occurrences
    for (let i = 0; i < 8; i++) {
      const date = addDays(firstDate, i * 7);
      const dateStr = toISODate(date);
      
      if (checkedDates.has(dateStr)) continue;
      checkedDates.add(dateStr);

      const dateConflicts = await calendarSessionService.checkConflicts(
        dateStr,
        formData.start_time
      );
      
      // Filter out conflicts for the current client (since this is their schedule)
      const otherClientConflicts = dateConflicts.filter(
        (c) => c.client_id !== clientId
      );
      
      conflictsList.push(...otherClientConflicts);
    }

    // Remove duplicates based on session id
    const uniqueConflicts = conflictsList.filter(
      (conflict, index, self) =>
        index === self.findIndex((c) => c.id === conflict.id)
    );

    setConflicts(uniqueConflicts);
  }

  function handleAddRule() {
    const newRule: ScheduleRule = {
      rule_id: generateId(),
      weekday: formData.weekday,
      start_time: formData.start_time,
      base_price: formData.base_price ? parseFloat(formData.base_price) : undefined,
      is_active: formData.is_active,
    };
    setRules([...rules, newRule]);
    setFormData({
      weekday: 1,
      start_time: '09:00',
      base_price: '',
      is_active: true,
    });
    setShowAddForm(false);
  }

  function handleEditRule(index: number) {
    const rule = rules[index];
    setFormData({
      weekday: rule.weekday,
      start_time: rule.start_time,
      base_price: rule.base_price?.toString() || '',
      is_active: rule.is_active,
    });
    setEditingRuleIndex(index);
    setShowAddForm(true);
  }

  function handleUpdateRule() {
    if (editingRuleIndex === null) return;
    const updatedRules = [...rules];
    updatedRules[editingRuleIndex] = {
      ...updatedRules[editingRuleIndex],
      weekday: formData.weekday,
      start_time: formData.start_time,
      base_price: formData.base_price ? parseFloat(formData.base_price) : undefined,
      is_active: formData.is_active,
    };
    setRules(updatedRules);
    setFormData({
      weekday: 1,
      start_time: '09:00',
      base_price: '',
      is_active: true,
    });
    setEditingRuleIndex(null);
    setShowAddForm(false);
  }

  function handleDeleteRule(index: number) {
    setDeleteConfirmIndex(index);
  }

  function confirmDeleteRule() {
    if (deleteConfirmIndex !== null) {
      setRules(rules.filter((_, i) => i !== deleteConfirmIndex));
      setDeleteConfirmIndex(null);
    }
  }

  async function handleSave() {
    if (rules.length === 0) {
      setSaveStatus('error');
      setErrorMessage('Добавьте хотя бы одно правило расписания');
      setTimeout(() => setSaveStatus('idle'), 3000);
      return;
    }

    setSaveStatus('saving');
    setErrorMessage('');

    try {
      const validFrom = templatePeriod.valid_from ? new Date(templatePeriod.valid_from) : new Date();
      // If noEndDate is true, set validTo to undefined (auto-extend)
      // If noEndDate is false but valid_to is empty, use end of next month as default
      // If valid_to is provided, use it (even if it's earlier than current date)
      const validTo = templatePeriod.noEndDate 
        ? undefined 
        : (templatePeriod.valid_to && templatePeriod.valid_to.trim() !== '' 
          ? new Date(templatePeriod.valid_to) 
          : getEndOfNextMonth());

      if (template) {
        // For update, preserve existing rule_id or generate new ones
        const rulesForUpdate: ScheduleRule[] = rules.map((rule) => ({
          ...rule,
          rule_id: rule.rule_id || generateId(),
        }));
        await scheduleService.updateTemplate(template.id, { 
          rules: rulesForUpdate,
          valid_from: validFrom,
          valid_to: validTo,
        });
        // Regenerate sessions after updating (updateTemplate already regenerates, but we need to ensure it happens)
        // Actually, updateTemplate already calls generateSessions if rules/valid_from/valid_to changed
        // So we don't need to call regenerateSessions again here
      } else {
        // For create, remove rule_id as CreateTemplateDto expects rules without rule_id
        const rulesForCreate = rules.map(({ rule_id, ...rule }) => rule);
        // createTemplate already calls generateSessions internally
        await scheduleService.createTemplate(clientId, { 
          rules: rulesForCreate,
          valid_from: validFrom,
          valid_to: validTo,
        });
      }
      
      // Reload template to show updated data
      await loadTemplate();
      
      // Call callback if provided
      onSave?.();
      
      // Show success status
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error saving schedule:', error);
      setSaveStatus('error');
      setErrorMessage('Ошибка при сохранении расписания: ' + (error as Error).message);
      setTimeout(() => setSaveStatus('idle'), 5000);
    }
  }

  function handleCancelEdit() {
    setFormData({
      weekday: 1,
      start_time: '09:00',
      base_price: '',
      is_active: true,
    });
    setEditingRuleIndex(null);
    setShowAddForm(false);
  }

  const weekdayNames = {
    1: 'Понедельник',
    2: 'Вторник',
    3: 'Среда',
    4: 'Четверг',
    5: 'Пятница',
    6: 'Суббота',
    7: 'Воскресенье',
  };

  return (
    <div className="space-y-4">
      {/* Schedule Period */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Период действия расписания</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Действует с
            </label>
            <input
              type="date"
              value={templatePeriod.valid_from}
              onChange={(e) => setTemplatePeriod({ ...templatePeriod, valid_from: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div className="flex items-center mb-2">
            <input
              type="checkbox"
              id="noEndDate"
              checked={templatePeriod.noEndDate}
              onChange={(e) => setTemplatePeriod({ ...templatePeriod, noEndDate: e.target.checked })}
              className="mr-2"
            />
            <label htmlFor="noEndDate" className="text-sm text-gray-700 dark:text-gray-300">
              Без конечной даты (автоматическое продление)
            </label>
          </div>
          {!templatePeriod.noEndDate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Действует до
              </label>
              <input
                type="date"
                value={templatePeriod.valid_to}
                onChange={(e) => setTemplatePeriod({ ...templatePeriod, valid_to: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          )}
          {template && template.valid_from && template.valid_to && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Текущий период: {formatDate(template.valid_from)} - {formatDate(template.valid_to)}
            </div>
          )}
        </div>
      </div>

      {/* Existing Rules */}
      {rules.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">Правила расписания</h3>
          <div className="space-y-2">
            {rules.map((rule, index) => (
              <div
                key={index}
                className={`p-3 rounded border ${
                  rule.is_active
                    ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50'
                    : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 opacity-60'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-white">
                      {weekdayNames[rule.weekday]}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {rule.start_time}
                    </div>
                    {rule.base_price !== undefined && rule.base_price !== null && (
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Базовая стоимость: {rule.base_price.toFixed(2)} BYN
                      </div>
                    )}
                    {!rule.is_active && (
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        Неактивно
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditRule(index)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteRule(index)}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">
            {editingRuleIndex !== null ? 'Редактировать правило' : 'Добавить правило'}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                День недели *
              </label>
              <select
                value={formData.weekday}
                onChange={(e) =>
                  setFormData({ ...formData, weekday: parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6 | 7 })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {Object.entries(weekdayNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Время начала *
              </label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Базовая стоимость (BYN)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.base_price}
                onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                placeholder="Оставьте пустым, если используется пакет"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="mr-2"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700 dark:text-gray-300">
                Активно
              </label>
            </div>

            {/* Conflict Warning */}
            {conflicts.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <div className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold mb-1">
                  ⚠️ Конфликт времени
                </div>
                <div className="text-sm text-yellow-700 dark:text-yellow-300">
                  В это время уже запланированы занятия:
                  <ul className="list-disc list-inside mt-1">
                    {conflicts.map((conflict) => {
                      const client = clients.find((c) => c.id === conflict.client_id);
                      return (
                        <li key={conflict.id}>
                          {client?.full_name || 'Неизвестно'} ({conflict.start_time})
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={editingRuleIndex !== null ? handleUpdateRule : handleAddRule}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingRuleIndex !== null ? 'Сохранить' : 'Добавить'}
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {(saveStatus === 'success' || saveStatus === 'error') && (
        <div className="fixed bottom-4 right-4 z-50 animate-[slideUp_0.3s_ease-out]">
          <div
            className={`shadow-xl rounded-lg px-4 py-3 min-w-[280px] max-w-md flex items-center gap-3 backdrop-blur-sm ${
              saveStatus === 'success'
                ? 'bg-green-50/95 dark:bg-green-900/80 border border-green-200/50 dark:border-green-800/50'
                : 'bg-red-50/95 dark:bg-red-900/80 border border-red-200/50 dark:border-red-800/50'
            }`}
          >
            {saveStatus === 'success' ? (
              <>
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 dark:bg-green-400/20 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1 text-sm font-medium text-green-700 dark:text-green-300">
                  Расписание сохранено
                </div>
              </>
            ) : (
              <>
                <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500/20 dark:bg-red-400/20 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div className="flex-1 text-sm font-medium text-red-700 dark:text-red-300">
                  {errorMessage || 'Ошибка при сохранении'}
                </div>
              </>
            )}
            <button
              onClick={() => setSaveStatus('idle')}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 -mr-1"
              aria-label="Закрыть"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Добавить правило
          </button>
        )}
        {rules.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              handleSave();
            }}
            disabled={saveStatus === 'saving'}
            className={`px-4 py-2 rounded-lg ${
              saveStatus === 'saving'
                ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {saveStatus === 'saving' ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Сохранение...
              </span>
            ) : (
              'Сохранить расписание'
            )}
          </button>
        )}
      </div>

      {rules.length === 0 && !showAddForm && (
        <div className="text-center text-gray-500 dark:text-gray-400 py-8">
          Нет правил расписания. Добавьте первое правило, чтобы начать.
        </div>
      )}

      {deleteConfirmIndex !== null && (
        <ConfirmDialog
          message="Удалить это правило расписания?"
          onConfirm={confirmDeleteRule}
          onCancel={() => setDeleteConfirmIndex(null)}
          confirmText="Удалить"
          cancelText="Отмена"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
        />
      )}
    </div>
  );
}
