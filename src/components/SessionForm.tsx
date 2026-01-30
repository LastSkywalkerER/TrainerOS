import { useState, useEffect } from 'react';
import { Client, CreateSessionDto, CalendarSession } from '../db/types';
import { toISODate } from '../utils/dateUtils';
import { calendarSessionService } from '../services/CalendarSessionService';
import { AlertDialog } from './AlertDialog';
import { ConfirmDialog } from './ConfirmDialog';

interface SessionFormProps {
  clients: Client[];
  session?: any;
  onSave: (data: CreateSessionDto & { client_id: string }) => void;
  onCancel: () => void;
}

export function SessionForm({ clients, session, onSave, onCancel }: SessionFormProps) {
  const [formData, setFormData] = useState({
    client_id: session?.client_id || '',
    date: session?.date || toISODate(new Date()),
    start_time: session?.start_time || '10:00',
    price_override: session?.price_override || undefined,
    notes: session?.notes || '',
  });
  const [conflicts, setConflicts] = useState<CalendarSession[]>([]);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [conflictConfirm, setConflictConfirm] = useState(false);

  useEffect(() => {
    checkConflicts();
  }, [formData.date, formData.start_time, formData.client_id]);

  async function checkConflicts() {
    if (!formData.date || !formData.start_time) return;
    const conflictsList = await calendarSessionService.checkConflicts(
      formData.date,
      formData.start_time,
      session?.id
    );
    setConflicts(conflictsList);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.client_id) {
      setAlertMessage('Выберите клиента');
      return;
    }
    if (conflicts.length > 0 && !conflictConfirm) {
      setConflictConfirm(true);
      return;
    }
    onSave(formData);
    setConflictConfirm(false);
  }

  function handleConflictConfirm() {
    setConflictConfirm(false);
    onSave(formData);
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onCancel}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
          {session ? 'Редактировать занятие' : 'Новое занятие'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Клиент *
            </label>
            <select
              required
              value={formData.client_id}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Выберите клиента</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Дата *
            </label>
            <input
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Время начала *
            </label>
            <input
              type="time"
              required
              value={formData.start_time}
              onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Переопределение цены (BYN)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.price_override || ''}
              onChange={(e) => setFormData({ ...formData, price_override: e.target.value ? parseFloat(e.target.value) : undefined })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Заметки
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
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

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
      {alertMessage && (
        <AlertDialog message={alertMessage} onClose={() => setAlertMessage(null)} />
      )}
      {conflictConfirm && (
        <ConfirmDialog
          message={`В это время уже есть занятия у других клиентов: ${conflicts.map(c => {
            const client = clients.find(cl => cl.id === c.client_id);
            return client?.full_name || 'Неизвестно';
          }).join(', ')}. Продолжить?`}
          onConfirm={handleConflictConfirm}
          onCancel={() => setConflictConfirm(false)}
          confirmText="Продолжить"
          cancelText="Отмена"
        />
      )}
    </div>
  );
}
