import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarSession } from '../db/types';
import { calendarSessionService } from '../services/CalendarSessionService';
import { clientService } from '../services/ClientService';
import { Client } from '../db/types';
import { formatTime, toISODate, isDateInRange } from '../utils/dateUtils';
import { parseISO } from 'date-fns';
import { SessionForm } from '../components/SessionForm';
import { SessionDetails } from '../components/SessionDetails';
import { calculateSessionStatusWithBalance, PaymentStatus } from '../utils/calculations';
import { TutorialGuide, TutorialStep } from '../components/TutorialGuide';
import { tutorialService } from '../services/TutorialService';
import { useTutorial } from '../contexts/TutorialContext';
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
import { ru } from 'date-fns/locale';

export function CalendarScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { getTriggeredPage, clearTrigger } = useTutorial();
  
  // Initialize state from URL params
  const getViewFromUrl = (): 'month' | 'week' | 'day' => {
    const viewParam = searchParams.get('view');
    if (viewParam === 'month' || viewParam === 'week' || viewParam === 'day') {
      return viewParam;
    }
    return 'month';
  };

  const getDateFromUrl = (): Date => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const parsed = parseISO(dateParam);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  };

  const [view, setView] = useState<'month' | 'week' | 'day'>(getViewFromUrl());
  const [currentDate, setCurrentDate] = useState<Date>(getDateFromUrl());
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sessionStatuses, setSessionStatuses] = useState<Map<string, PaymentStatus>>(new Map());
  const [selectedSession, setSelectedSession] = useState<CalendarSession | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSession, setEditingSession] = useState<CalendarSession | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  // Create tutorial steps dynamically based on view
  const getTutorialSteps = (): TutorialStep[] => {
    const steps: TutorialStep[] = [
      {
        target: '#tutorial-view-switcher',
        title: 'Переключение вида',
        description: 'Выберите удобный вид календаря: месяц, неделя или день.',
        position: 'bottom',
      },
      {
        target: '#tutorial-date-nav',
        title: 'Навигация по датам',
        description: 'Перемещайтесь между периодами с помощью стрелок или кнопки "Сегодня".',
        position: 'bottom',
      },
    ];

    // Add session tutorial step only if there are sessions or in month view
    if (view === 'month' && sessions.length > 0) {
      steps.push({
        target: '#tutorial-sessions',
        title: 'Занятия в календаре',
        description: 'В квадратиках дней отображаются занятия. Кликните на любое занятие, чтобы просмотреть детали, добавить заметки или отредактировать его.',
        position: 'bottom',
      });
    } else if (view === 'month') {
      // If no sessions, show general info about calendar grid
      steps.push({
        target: '.grid.grid-cols-7',
        title: 'Занятия в календаре',
        description: 'В квадратиках дней будут отображаться занятия. Кликните на любое занятие, чтобы просмотреть детали, добавить заметки или отредактировать его.',
        position: 'center',
      });
    }

    steps.push(
      {
        target: '#tutorial-fab',
        title: 'Добавление занятия',
        description: 'Добавьте новое занятие в календарь, нажав эту кнопку.',
        position: 'top',
      },
      {
        target: '#tutorial-nav',
        title: 'Навигация',
        description: 'Переключайтесь между разделами приложения: Клиенты, Календарь, Платежи и Итоги.',
        position: 'top',
      }
    );

    return steps;
  };

  const tutorialSteps = getTutorialSteps();

  // Initialize from URL on mount
  useEffect(() => {
    const viewParam = searchParams.get('view');
    const dateParam = searchParams.get('date');
    const sessionId = searchParams.get('session');

    if (viewParam === 'month' || viewParam === 'week' || viewParam === 'day') {
      setView(viewParam);
    }
    
    if (dateParam) {
      const parsed = parseISO(dateParam);
      if (!isNaN(parsed.getTime())) {
        setCurrentDate(parsed);
      }
    }

    if (sessionId) {
      calendarSessionService.getById(sessionId).then((session) => {
        if (session) {
          setSelectedSession(session);
        }
      });
    }
  }, []); // Only run on mount

  // Sync URL params when view or date changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('view', view);
    params.set('date', toISODate(currentDate));
    // Preserve session param if it exists
    const sessionId = searchParams.get('session');
    if (sessionId) {
      params.set('session', sessionId);
    }
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentDate]);

  // Update URL when session is selected
  const handleSessionSelect = (session: CalendarSession | null) => {
    setSelectedSession(session);
    const params = new URLSearchParams(searchParams);
    if (session) {
      params.set('session', session.id);
    } else {
      params.delete('session');
    }
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    loadData();
  }, [currentDate, view]);

  // Check if tutorial should be shown
  useEffect(() => {
    if (selectedSession || showForm) {
      return;
    }

    const triggeredPage = getTriggeredPage();
    if (triggeredPage === 'calendar') {
      setShowTutorial(true);
      clearTrigger();
      return;
    }

    // Check if tutorial was completed
    if (!tutorialService.isCompleted('calendar')) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        setShowTutorial(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [selectedSession, showForm, getTriggeredPage, clearTrigger]);

  async function loadData() {
    let dateFrom: Date;
    let dateTo: Date;

    if (view === 'month') {
      // Load data for the full calendar view (including days from previous/next month)
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      dateFrom = startOfWeek(monthStart, { weekStartsOn: 1 });
      dateTo = endOfWeek(monthEnd, { weekStartsOn: 1 });
    } else if (view === 'week') {
      dateFrom = startOfWeek(currentDate, { weekStartsOn: 1 });
      dateTo = endOfWeek(currentDate, { weekStartsOn: 1 });
    } else {
      // day view - use start and end of day for proper date comparison
      dateFrom = startOfDay(currentDate);
      dateTo = endOfDay(currentDate);
    }

    // Load all clients (active, paused, archived) to show names for all sessions
    const [allSessions, allClients] = await Promise.all([
      calendarSessionService.getByDateRange(dateFrom, dateTo),
      clientService.getAll(),
    ]);
    setSessions(allSessions);
    setClients(allClients);

    // Load payment statuses for all sessions (with balance distribution)
    const statusMap = new Map<string, PaymentStatus>();
    await Promise.all(
      allSessions.map(async (session) => {
        if (session.status !== 'canceled') {
          const status = await calculateSessionStatusWithBalance(session.id, session.client_id);
          statusMap.set(session.id, status);
        }
      })
    );
    setSessionStatuses(statusMap);
  }

  // Calculate calendar view: start from Monday of the week containing month start,
  // end on Sunday of the week containing month end
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 }); // Sunday
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  function getSessionsForDate(date: Date): CalendarSession[] {
    const dateStr = toISODate(date);
    return sessions.filter((s) => s.date === dateStr && s.status !== 'canceled');
  }

  function isSessionInPause(session: CalendarSession): boolean {
    const client = clients.find((c) => c.id === session.client_id);
    if (!client || !client.pause_from || !client.pause_to) {
      return false;
    }
    const sessionDate = parseISO(session.date);
    return isDateInRange(sessionDate, client.pause_from, client.pause_to);
  }

  function getSessionColorClasses(status: PaymentStatus | undefined, isPaused: boolean): string {
    // Sessions in pause period are always gray
    if (isPaused) {
      return 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 opacity-60';
    }
    if (!status) {
      return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
    }
    switch (status) {
      case 'paid':
        return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
      case 'unpaid':
        return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
      case 'partially_paid':
        return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200';
      default:
        return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
    }
  }

  function hasNotes(session: CalendarSession): boolean {
    if (!session.notes) return false;
    const trimmed = session.notes.trim();
    if (trimmed === '' || trimmed === '<p></p>') return false;
    // Strip HTML tags and check if there's actual text content
    const textContent = trimmed.replace(/<[^>]*>/g, '').trim();
    return textContent.length > 0;
  }

  function isCustomEdited(session: CalendarSession): boolean {
    // Session is custom edited if:
    // 1. It was created manually (is_custom: true)
    // 2. OR it was manually edited after creation (is_edited: true)
    return session.is_custom || session.is_edited === true;
  }


  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {view === 'month'
            ? format(currentDate, 'MMMM yyyy', { locale: ru })
            : view === 'week'
            ? `Неделя ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'dd.MM')} - ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'dd.MM.yyyy')}`
            : format(currentDate, 'dd.MM.yyyy')}
        </h1>
        <div id="tutorial-date-nav" data-tutorial-id="tutorial-date-nav" className="flex gap-2">
          <button
            onClick={() => {
              let newDate: Date;
              if (view === 'month') {
                newDate = subMonths(currentDate, 1);
              } else if (view === 'week') {
                newDate = subWeeks(currentDate, 1);
              } else {
                newDate = subDays(currentDate, 1);
              }
              setCurrentDate(newDate);
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
              let newDate: Date;
              if (view === 'month') {
                newDate = addMonths(currentDate, 1);
              } else if (view === 'week') {
                newDate = addWeeks(currentDate, 1);
              } else {
                newDate = addDays(currentDate, 1);
              }
              setCurrentDate(newDate);
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
      <div id="tutorial-view-switcher" data-tutorial-id="tutorial-view-switcher" className="flex gap-2 mb-4">
        {(['month', 'week', 'day'] as const).map((v) => (
          <button
            key={v}
            onClick={() => {
              setView(v);
            }}
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
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              // Find first day with sessions for tutorial
              const firstDayWithSessions = days.find(d => getSessionsForDate(d).length > 0);
              const isFirstDayWithSessions = firstDayWithSessions && toISODate(day) === toISODate(firstDayWithSessions);
              return (
                <div
                  key={day.toISOString()}
                  onClick={() => {
                    setView('day');
                    setCurrentDate(day);
                  }}
                  className={`min-h-24 p-2 border border-gray-200 dark:border-gray-700 cursor-pointer ${
                    isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  } ${!isCurrentMonth ? 'bg-gray-50 dark:bg-gray-900/50 opacity-50' : ''}`}
                >
                  <div className={`text-sm mb-1 ${
                    isToday 
                      ? 'font-bold text-blue-600 dark:text-blue-400' 
                      : isCurrentMonth 
                        ? 'text-gray-600 dark:text-gray-400' 
                        : 'text-gray-400 dark:text-gray-600'
                  }`}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {daySessions.slice(0, 3).map((session, sessionIndex) => {
                      const client = clients.find((c) => c.id === session.client_id);
                      const paymentStatus = sessionStatuses.get(session.id);
                      const isPaused = isSessionInPause(session);
                      const colorClasses = getSessionColorClasses(paymentStatus, isPaused);
                      // Add tutorial ID to first session in first day with sessions
                      const isFirstSession = isFirstDayWithSessions && sessionIndex === 0;
                      return (
                        <div
                          key={session.id}
                          id={isFirstSession ? 'tutorial-sessions' : undefined}
                          data-tutorial-id={isFirstSession ? 'tutorial-sessions' : undefined}
                          className={`text-xs p-1 rounded ${colorClasses} hover:opacity-80 truncate flex items-center gap-1`}
                        >
                          {hasNotes(session) && (
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          )}
                          {isCustomEdited(session) && (
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          )}
                          <span className="truncate">{formatTime(session.start_time)} {client?.full_name}</span>
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
                      const paymentStatus = sessionStatuses.get(session.id);
                      const isPaused = isSessionInPause(session);
                      const colorClasses = getSessionColorClasses(paymentStatus, isPaused);
                      return (
                        <div
                          key={session.id}
                          onClick={() => handleSessionSelect(session)}
                          className={`p-2 rounded ${colorClasses} cursor-pointer hover:opacity-80 overflow-hidden`}
                        >
                          {/* Icons row */}
                          {(hasNotes(session) || isCustomEdited(session)) && (
                            <div className="flex items-center gap-1 mb-1">
                              {hasNotes(session) && (
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              )}
                              {isCustomEdited(session) && (
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              )}
                            </div>
                          )}
                          {/* Time row */}
                          <div className="text-xs font-semibold mb-1">
                            {formatTime(session.start_time)}
                          </div>
                          {/* Client name row - truncate if too long */}
                          <div className="text-xs truncate overflow-hidden whitespace-nowrap" title={client?.full_name}>
                            {client?.full_name || 'Неизвестный клиент'}
                          </div>
                          {/* Duration row */}
                          <div className="text-xs opacity-75">
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
              {format(currentDate, 'EEEE, d MMMM yyyy', { locale: ru })}
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
                              const paymentStatus = sessionStatuses.get(session.id);
                              const isPaused = isSessionInPause(session);
                              const colorClasses = getSessionColorClasses(paymentStatus, isPaused);
                              const [hours, minutes] = session.start_time.split(':').map(Number);
                              const endMinutes = minutes + session.duration_minutes;
                              const endHours = hours + Math.floor(endMinutes / 60);
                              const endMins = endMinutes % 60;
                              const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

                              return (
                                <div
                                  key={session.id}
                                  onClick={() => handleSessionSelect(session)}
                                  className={`mb-2 p-2 rounded ${colorClasses} cursor-pointer hover:opacity-80`}
                                >
                                  <div className="text-sm font-semibold flex items-center gap-1">
                                    {hasNotes(session) && (
                                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                    )}
                                    {isCustomEdited(session) && (
                                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    )}
                                    {formatTime(session.start_time)} - {endTime}
                                  </div>
                                  <div className="text-sm">{client?.full_name}</div>
                                  <div className="text-xs opacity-75">
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
          id="tutorial-fab"
          data-tutorial-id="tutorial-fab"
          onClick={() => setShowForm(true)}
          className="fixed bottom-24 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      {/* Tutorial Guide */}
      <TutorialGuide
        steps={tutorialSteps}
        isActive={showTutorial && !selectedSession && !showForm}
        onComplete={() => {
          setShowTutorial(false);
          tutorialService.markCompleted('calendar');
        }}
        onSkip={() => {
          setShowTutorial(false);
          tutorialService.markCompleted('calendar');
        }}
      />

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
          onClose={() => handleSessionSelect(null)}
          onEdit={() => {
            setEditingSession(selectedSession);
            handleSessionSelect(null);
            setShowForm(true);
          }}
          onCancel={async () => {
            await calendarSessionService.cancel(selectedSession.id);
            handleSessionSelect(null);
            await loadData();
          }}
          onNotesSaved={async (updatedSession) => {
            // Update selected session with new notes
            setSelectedSession(updatedSession);
            // Also update in sessions list
            await loadData();
          }}
        />
      )}
    </div>
  );
}
