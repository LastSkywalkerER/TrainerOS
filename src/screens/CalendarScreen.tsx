import { useState, useEffect } from 'react';
import { CalendarSession } from '../db/types';
import { calendarSessionService } from '../services/CalendarSessionService';
import { clientService } from '../services/ClientService';
import { Client } from '../db/types';
import { formatDate, formatTime, toISODate } from '../utils/dateUtils';
import { calculateSessionStatus } from '../utils/calculations';
import { SessionForm } from '../components/SessionForm';
import { SessionDetails } from '../components/SessionDetails';
import { startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';

export function CalendarScreen() {
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedSession, setSelectedSession] = useState<CalendarSession | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSession, setEditingSession] = useState<CalendarSession | null>(null);

  useEffect(() => {
    loadData();
  }, [currentDate, view]);

  async function loadData() {
    const [allSessions, allClients] = await Promise.all([
      calendarSessionService.getByDateRange(
        startOfMonth(currentDate),
        endOfMonth(currentDate)
      ),
      clientService.getAll({ status: 'active' }),
    ]);
    setSessions(allSessions);
    setClients(allClients);
  }

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  function getSessionsForDate(date: Date): CalendarSession[] {
    const dateStr = toISODate(date);
    return sessions.filter((s) => s.date === dateStr && s.status !== 'canceled');
  }

  function getStatusColor(status: string): string {
    // This will be calculated dynamically, but for now use a placeholder
    return 'bg-blue-100';
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Календарь</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
            className="p-2 text-gray-600 dark:text-gray-400"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded"
          >
            Сегодня
          </button>
          <button
            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
            className="p-2 text-gray-600 dark:text-gray-400"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* View Switcher */}
      <div className="flex gap-2 mb-4">
        {(['month', 'week', 'day'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 rounded ${
              view === v
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {v === 'month' ? 'Месяц' : v === 'week' ? 'Неделя' : 'День'}
          </button>
        ))}
      </div>

      {/* Calendar Grid */}
      {view === 'month' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
              <div key={day} className="p-2 text-center text-sm font-semibold text-gray-600 dark:text-gray-400">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const daySessions = getSessionsForDate(day);
              const isToday = toISODate(day) === toISODate(new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-24 p-2 border border-gray-200 dark:border-gray-700 ${
                    isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className={`text-sm mb-1 ${isToday ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {daySessions.slice(0, 3).map((session) => {
                      const client = clients.find((c) => c.id === session.client_id);
                      return (
                        <div
                          key={session.id}
                          onClick={() => setSelectedSession(session)}
                          className="text-xs p-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800 truncate"
                        >
                          {formatTime(session.start_time)} {client?.full_name}
                        </div>
                      );
                    })}
                    {daySessions.length > 3 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        +{daySessions.length - 3} ещё
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FAB */}
      {!showForm && !selectedSession && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed bottom-24 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      {/* Session Form */}
      {showForm && (
        <SessionForm
          clients={clients}
          session={editingSession}
          onSave={async (data) => {
            if (editingSession) {
              await calendarSessionService.update(editingSession.id, data);
            } else {
              await calendarSessionService.createCustom(data.client_id, data);
            }
            setShowForm(false);
            setEditingSession(null);
            await loadData();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingSession(null);
          }}
        />
      )}

      {/* Session Details */}
      {selectedSession && (
        <SessionDetails
          session={selectedSession}
          client={clients.find((c) => c.id === selectedSession.client_id)}
          onClose={() => setSelectedSession(null)}
          onEdit={() => {
            setEditingSession(selectedSession);
            setSelectedSession(null);
            setShowForm(true);
          }}
          onCancel={async () => {
            await calendarSessionService.cancel(selectedSession.id);
            setSelectedSession(null);
            await loadData();
          }}
          onComplete={async () => {
            await calendarSessionService.complete(selectedSession.id);
            setSelectedSession(null);
            await loadData();
          }}
        />
      )}
    </div>
  );
}
