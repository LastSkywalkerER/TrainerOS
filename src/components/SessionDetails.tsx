import { useState, useEffect } from 'react';
import { CalendarSession, Client } from '../db/types';
import { formatDate, formatTime } from '../utils/dateUtils';
import { calculateSessionStatusWithBalance, getEffectiveAllocatedAmount, calculateSessionPrice } from '../utils/calculations';

interface SessionDetailsProps {
  session: CalendarSession;
  client: Client | undefined;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onComplete: () => void;
}

export function SessionDetails({
  session,
  client,
  onClose,
  onEdit,
  onCancel,
  onComplete,
}: SessionDetailsProps) {
  const [status, setStatus] = useState<'paid' | 'partially_paid' | 'unpaid'>('unpaid');
  const [allocated, setAllocated] = useState(0);
  const [price, setPrice] = useState(0);

  useEffect(() => {
    loadStatus();
  }, [session.id]);

  async function loadStatus() {
    const [sessionStatus, effectiveAllocated, sessionPrice] = await Promise.all([
      calculateSessionStatusWithBalance(session.id, session.client_id),
      getEffectiveAllocatedAmount(session.id, session.client_id),
      calculateSessionPrice(session.client_id, session.id),
    ]);
    setStatus(sessionStatus);
    setAllocated(effectiveAllocated);
    setPrice(sessionPrice);
  }

  const statusColors = {
    paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    partially_paid: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    unpaid: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  const statusLabels = {
    paid: 'Оплачено',
    partially_paid: 'Частично оплачено',
    unpaid: 'Не оплачено',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Занятие</h2>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Клиент</div>
            <div className="font-semibold text-gray-900 dark:text-white">{client?.full_name || 'Неизвестно'}</div>
          </div>

          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Дата и время</div>
            <div className="font-semibold text-gray-900 dark:text-white">
              {formatDate(session.date)} в {formatTime(session.start_time)}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Длительность</div>
            <div className="font-semibold text-gray-900 dark:text-white">{session.duration_minutes} минут</div>
          </div>

          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Статус занятия</div>
            <span className="px-3 py-1 rounded text-sm bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              {session.status === 'planned' ? 'Запланировано' : session.status === 'completed' ? 'Завершено' : 'Отменено'}
            </span>
          </div>

          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Статус оплаты</div>
            <span className={`px-3 py-1 rounded text-sm ${statusColors[status]}`}>
              {statusLabels[status]}
            </span>
          </div>

          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Цена / Оплачено</div>
            <div className="font-semibold text-gray-900 dark:text-white">
              {price.toFixed(2)} BYN / {allocated.toFixed(2)} BYN
            </div>
            {allocated < price && (
              <div className="text-sm text-red-600 dark:text-red-400">
                Остаток: {(price - allocated).toFixed(2)} BYN
              </div>
            )}
          </div>

          {session.notes && (
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Заметки</div>
              <div className="text-gray-900 dark:text-white whitespace-pre-wrap">{session.notes}</div>
            </div>
          )}

          {/* Warning for paid sessions */}
          {(status === 'paid' || status === 'partially_paid') && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Это занятие уже оплачено. При изменении или отмене оплата останется привязанной к занятию.
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            {session.status === 'planned' && (
              <>
                <button
                  onClick={onEdit}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Редактировать
                </button>
                <button
                  onClick={() => {
                    if ((status === 'paid' || status === 'partially_paid') && !confirm('Занятие оплачено. Вы уверены, что хотите отменить его?')) {
                      return;
                    }
                    onCancel();
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Отменить
                </button>
                <button
                  onClick={onComplete}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Завершить
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
