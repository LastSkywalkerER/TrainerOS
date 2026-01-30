import { useState, useEffect } from 'react';
import { CalendarSession } from '../db/types';
import { calendarSessionService } from '../services/CalendarSessionService';
import { clientService } from '../services/ClientService';
import { Client } from '../db/types';
import { formatTime, toISODate } from '../utils/dateUtils';
import { SessionForm } from '../components/SessionForm';
import { SessionDetails } from '../components/SessionDetails';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  format,
  startOfDay,
  endOfDay,
} from 'date-fns';

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
    let dateFrom: Date;
    let dateTo: Date;

    if (view === 'month') {
      dateFrom = startOfMonth(currentDate);
      dateTo = endOfMonth(currentDate);
    } else if (view === 'week') {
      dateFrom = startOfWeek(currentDate, { weekStartsOn: 1 });
      dateTo = endOfWeek(currentDate, { weekStartsOn: 1 });
    } else {
      // day view - use start and end of day for proper date comparison
      dateFrom = startOfDay(currentDate);
      dateTo = endOfDay(currentDate);
    }

    const [allSessions, allClients] = await Promise.all([
      calendarSessionService.getByDateRange(dateFrom, dateTo),
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


  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {view === 'month'
            ? format(currentDate, 'MMMM yyyy')
            : view === 'week'
            ? `Неделя ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'dd.MM')} - ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'dd.MM.yyyy')}`
            : format(currentDate, 'dd.MM.yyyy')}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (view === 'month') {
                setCurrentDate(subMonths(currentDate, 1));
              } else if (view === 'week') {
                setCurrentDate(subWeeks(currentDate, 1));
              } else {
                setCurrentDate(subDays(currentDate, 1));
              }
            }}
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
            onClick={() => {
              if (view === 'month') {
                setCurrentDate(addMonths(currentDate, 1));
              } else if (view === 'week') {
                setCurrentDate(addWeeks(currentDate, 1));
              } else {
                setCurrentDate(addDays(currentDate, 1));
              }
            }}
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

      {/* Week View */}
      {view === 'week' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
            {eachDayOfInterval({
              start: startOfWeek(currentDate, { weekStartsOn: 1 }),
              end: endOfWeek(currentDate, { weekStartsOn: 1 }),
            }).map((day, index) => {
              const isToday = toISODate(day) === toISODate(new Date());
              const weekdayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
              return (
                <div
                  key={day.toISOString()}
                  className={`p-2 text-center border-r border-gray-200 dark:border-gray-700 ${
                    isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className={`text-xs text-gray-500 dark:text-gray-400 mb-1`}>
                    {weekdayNames[index]}
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      isToday ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7">
            {eachDayOfInterval({
              start: startOfWeek(currentDate, { weekStartsOn: 1 }),
              end: endOfWeek(currentDate, { weekStartsOn: 1 }),
            }).map((day) => {
              const daySessions = getSessionsForDate(day).sort((a, b) =>
                a.start_time.localeCompare(b.start_time)
              );
              const isToday = toISODate(day) === toISODate(new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-96 p-2 border-r border-gray-200 dark:border-gray-700 ${
                    isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="space-y-2">
                    {daySessions.map((session) => {
                      const client = clients.find((c) => c.id === session.client_id);
                      return (
                        <div
                          key={session.id}
                          onClick={() => setSelectedSession(session)}
                          className="p-2 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800"
                        >
                          <div className="text-xs font-semibold">{formatTime(session.start_time)}</div>
                          <div className="text-xs">{client?.full_name}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {session.duration_minutes} мин
                          </div>
                        </div>
                      );
                    })}
                    {daySessions.length === 0 && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                        Нет занятий
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day View */}
      {view === 'day' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {format(currentDate, 'EEEE, d MMMM yyyy')}
            </div>
          </div>
          <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
            {(() => {
              const daySessions = getSessionsForDate(currentDate).sort((a, b) =>
                a.start_time.localeCompare(b.start_time)
              );
              const timeSlots: number[] = [];
              for (let hour = 6; hour <= 23; hour++) {
                timeSlots.push(hour);
              }

              // Group sessions by hour
              const sessionsByHour = new Map<number, CalendarSession[]>();
              daySessions.forEach((session) => {
                const [sessionHour] = session.start_time.split(':').map(Number);
                if (!sessionsByHour.has(sessionHour)) {
                  sessionsByHour.set(sessionHour, []);
                }
                sessionsByHour.get(sessionHour)!.push(session);
              });

              return (
                <div className="relative">
                  {timeSlots.map((hour) => {
                    const hourSessions = sessionsByHour.get(hour) || [];

                    return (
                      <div
                        key={hour}
                        className="border-b border-gray-100 dark:border-gray-700 p-2 min-h-16"
                      >
                        <div className="flex">
                          <div className="w-16 text-sm text-gray-600 dark:text-gray-400 font-medium">
                            {String(hour).padStart(2, '0')}:00
                          </div>
                          <div className="flex-1">
                            {hourSessions.map((session) => {
                              const client = clients.find((c) => c.id === session.client_id);
                              const [hours, minutes] = session.start_time.split(':').map(Number);
                              const endMinutes = minutes + session.duration_minutes;
                              const endHours = hours + Math.floor(endMinutes / 60);
                              const endMins = endMinutes % 60;
                              const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

                              return (
                                <div
                                  key={session.id}
                                  onClick={() => setSelectedSession(session)}
                                  className="mb-2 p-2 rounded bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800"
                                >
                                  <div className="text-sm font-semibold">
                                    {formatTime(session.start_time)} - {endTime}
                                  </div>
                                  <div className="text-sm">{client?.full_name}</div>
                                  <div className="text-xs text-gray-600 dark:text-gray-400">
                                    {session.duration_minutes} минут
                                  </div>
                                </div>
                              );
                            })}
                            {hourSessions.length === 0 && (
                              <div className="text-xs text-gray-400 dark:text-gray-500">—</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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
