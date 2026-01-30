import { useState, useEffect } from 'react';
import { Client } from '../db/types';
import { analyticsService } from '../services/AnalyticsService';
import { formatDate } from '../utils/dateUtils';

interface ClientCardProps {
  client: Client;
  onClick: () => void;
  onEdit: () => void;
}

export function ClientCard({ client, onClick, onEdit }: ClientCardProps) {
  const [debt, setDebt] = useState<number>(0);
  const [balance, setBalance] = useState<number>(0);
  const [nextSession, setNextSession] = useState<string | null>(null);

  useEffect(() => {
    loadStats();
  }, [client.id]);

  async function loadStats() {
    const stats = await analyticsService.getClientStats(client.id);
    setDebt(stats.total_debt);
    setBalance(stats.balance);
    if (stats.next_unpaid_session) {
      setNextSession(stats.next_unpaid_session.date);
    }
  }

  const statusColors = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    archived: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  };

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {client.full_name}
        </h3>
        <span
          className={`px-2 py-1 text-xs rounded ${statusColors[client.status]}`}
        >
          {client.status === 'active' ? 'Активен' : client.status === 'paused' ? 'На паузе' : 'Архив'}
        </span>
      </div>

      {(client.phone || client.telegram) && (
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          {client.phone && <div>📞 {client.phone}</div>}
          {client.telegram && <div>✈️ {client.telegram}</div>}
        </div>
      )}

      <div className="flex justify-between items-center mt-3">
        <div className="text-sm">
          {debt > 0 && (
            <div className="text-red-600 dark:text-red-400 font-semibold">
              Долг: {debt.toFixed(2)} BYN
            </div>
          )}
          {balance > 0 && (
            <div className="text-green-600 dark:text-green-400">
              Баланс: {balance.toFixed(2)} BYN
            </div>
          )}
          {nextSession && (
            <div className="text-gray-600 dark:text-gray-400">
              Ближайшее: {formatDate(nextSession)}
            </div>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
