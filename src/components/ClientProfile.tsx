import { useState, useEffect } from 'react';
import { Client } from '../db/types';
import { analyticsService } from '../services/AnalyticsService';
import { ClientStats } from '../db/types';
import { formatDate, formatDateTime } from '../utils/dateUtils';

interface ClientProfileProps {
  client: Client;
  onBack: () => void;
  onEdit: () => void;
}

type Tab = 'info' | 'schedule' | 'payments' | 'stats';

export function ClientProfile({ client, onBack, onEdit }: ClientProfileProps) {
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [stats, setStats] = useState<ClientStats | null>(null);

  useEffect(() => {
    loadStats();
  }, [client.id]);

  async function loadStats() {
    const clientStats = await analyticsService.getClientStats(client.id);
    setStats(clientStats);
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button onClick={onBack} className="mr-4 text-gray-600 dark:text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold flex-1 text-gray-900 dark:text-white">
            {client.full_name}
          </h1>
          <button onClick={onEdit} className="text-blue-600 dark:text-blue-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {(['info', 'schedule', 'payments', 'stats'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium ${
                activeTab === tab
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              {tab === 'info' ? 'Информация' : tab === 'schedule' ? 'Расписание' : tab === 'payments' ? 'Платежи' : 'Расчёты'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === 'info' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">Контакты</h2>
              {client.phone && (
                <div className="text-gray-700 dark:text-gray-300 mb-1">📞 {client.phone}</div>
              )}
              {client.telegram && (
                <div className="text-gray-700 dark:text-gray-300 mb-1">✈️ {client.telegram}</div>
              )}
            </div>

            {client.notes && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">Заметки</h2>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{client.notes}</p>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">Статус</h2>
              <span className={`px-3 py-1 rounded ${
                client.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                client.status === 'paused' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {client.status === 'active' ? 'Активен' : client.status === 'paused' ? 'На паузе' : 'Архив'}
              </span>
            </div>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            Расписание будет реализовано в следующем компоненте
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            Платежи будут реализованы в следующем компоненте
          </div>
        )}

        {activeTab === 'stats' && stats && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <h2 className="font-semibold mb-4 text-gray-900 dark:text-white">Статистика</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Всего занятий:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{stats.total_sessions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Оплачено:</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">{stats.paid_sessions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Не оплачено:</span>
                  <span className="font-semibold text-red-600 dark:text-red-400">{stats.unpaid_sessions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Частично оплачено:</span>
                  <span className="font-semibold text-yellow-600 dark:text-yellow-400">{stats.partially_paid_sessions}</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <h2 className="font-semibold mb-4 text-gray-900 dark:text-white">Финансы</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Всего оплачено:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{stats.total_paid.toFixed(2)} BYN</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Распределено:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{stats.total_allocated.toFixed(2)} BYN</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Долг:</span>
                  <span className="font-semibold text-red-600 dark:text-red-400">{stats.total_debt.toFixed(2)} BYN</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Баланс:</span>
                  <span className={`font-semibold ${stats.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {stats.balance.toFixed(2)} BYN
                  </span>
                </div>
              </div>
            </div>

            {stats.next_unpaid_session && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">Ближайшее неоплаченное занятие</h2>
                <div className="text-gray-700 dark:text-gray-300">
                  {formatDate(stats.next_unpaid_session.date)} в {stats.next_unpaid_session.start_time}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
