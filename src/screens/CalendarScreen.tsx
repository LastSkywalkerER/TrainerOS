import { useState, useEffect, useRef } from 'react';
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
  const weekHeaderScrollRef = useRef<HTMLDivElement>(null);
  const weekContentScrollRef = useRef<HTMLDivElement>(null);
  const weekDaysColumnScrollRef = useRef<HTMLDivElement>(null);

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
      {view === 'week' && (() => {
        const weekDays = eachDayOfInterval({
          start: startOfWeek(currentDate, { weekStartsOn: 1 }),
          end: endOfWeek(currentDate, { weekStartsOn: 1 }),
        });
        const weekdayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        
        // Generate time slots from 6:00 to 23:00 (each hour)
        const timeSlots: number[] = [];
        for (let hour = 6; hour <= 23; hour++) {
          timeSlots.push(hour);
        }

        // Fixed width for each hour column (must match in header and grid)
        const HOUR_COLUMN_WIDTH = 120;

        // Sync horizontal scroll between header and content
        const handleHeaderScroll = (e: React.UIEvent<HTMLDivElement>) => {
          if (weekContentScrollRef.current) {
            weekContentScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        };

        const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
          if (weekHeaderScrollRef.current) {
            weekHeaderScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        };

        // Sync vertical scroll between days column and content grid
        const handleDaysColumnScroll = (e: React.UIEvent<HTMLDivElement>) => {
          if (weekContentScrollRef.current) {
            weekContentScrollRef.current.scrollTop = e.currentTarget.scrollTop;
          }
        };

        const handleContentVerticalScroll = (e: React.UIEvent<HTMLDivElement>) => {
          if (weekDaysColumnScrollRef.current) {
            weekDaysColumnScrollRef.current.scrollTop = e.currentTarget.scrollTop;
          }
        };

        // Helper function to parse time string to minutes
        const timeToMinutes = (timeStr: string): number => {
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours * 60 + minutes;
        };

        // Helper function to check if two sessions overlap
        const sessionsOverlap = (session1: CalendarSession, session2: CalendarSession): boolean => {
          const start1 = timeToMinutes(session1.start_time);
          const start2 = timeToMinutes(session2.start_time);
          // Assume default duration of 1 hour if not specified
          const end1 = start1 + 60;
          const end2 = start2 + 60;
          return !(end1 <= start2 || end2 <= start1);
        };

        // Layout algorithm: assign rows to overlapping sessions for vertical distribution
        // Sessions at the same time get distributed vertically with spacing
        const layoutSessions = (daySessions: CalendarSession[]): Map<string, { row: number; totalRows: number }> => {
          const layout = new Map<string, { row: number; totalRows: number }>();
          const sortedSessions = [...daySessions].sort((a, b) => 
            timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
          );

          // Group sessions by exact start time
          const sessionsByTime = new Map<string, CalendarSession[]>();
          for (const session of sortedSessions) {
            const timeKey = session.start_time;
            if (!sessionsByTime.has(timeKey)) {
              sessionsByTime.set(timeKey, []);
            }
            sessionsByTime.get(timeKey)!.push(session);
          }

          // For each time slot, assign rows to sessions
          for (const [, timeSessions] of sessionsByTime.entries()) {
            if (timeSessions.length === 1) {
              // Single session - no need for row distribution
              layout.set(timeSessions[0].id, { row: 0, totalRows: 1 });
            } else {
              // Multiple sessions at the same time - distribute vertically
              for (let i = 0; i < timeSessions.length; i++) {
                layout.set(timeSessions[i].id, { row: i, totalRows: timeSessions.length });
              }
            }
          }

          // Handle overlapping sessions (different start times but overlapping)
          // Group overlapping sessions
          const overlapGroups: CalendarSession[][] = [];
          const sessionToOverlapGroup = new Map<string, number>();

          for (const session of sortedSessions) {
            const overlappingGroupIndices = new Set<number>();
            
            // Find all groups that contain sessions overlapping with this session
            for (const [otherId, groupIndex] of sessionToOverlapGroup.entries()) {
              const otherSession = sortedSessions.find(s => s.id === otherId);
              if (otherSession && sessionsOverlap(session, otherSession) && session.start_time !== otherSession.start_time) {
                overlappingGroupIndices.add(groupIndex);
              }
            }
            
            if (overlappingGroupIndices.size === 0) {
              // Check if this session already has a layout (same time group)
              if (!layout.has(session.id)) {
                // Create new overlap group
                const newGroupIndex = overlapGroups.length;
                overlapGroups.push([session]);
                sessionToOverlapGroup.set(session.id, newGroupIndex);
                layout.set(session.id, { row: 0, totalRows: 1 });
              }
            } else {
              // Merge overlapping groups
              const groupIndices = Array.from(overlappingGroupIndices);
              const targetGroupIndex = groupIndices[0];
              
              // Add session to target group
              overlapGroups[targetGroupIndex].push(session);
              sessionToOverlapGroup.set(session.id, targetGroupIndex);
              
              // Merge other groups into target group
              for (let i = groupIndices.length - 1; i > 0; i--) {
                const groupIndex = groupIndices[i];
                const groupToMerge = overlapGroups[groupIndex];
                for (const s of groupToMerge) {
                  sessionToOverlapGroup.set(s.id, targetGroupIndex);
                }
                overlapGroups[targetGroupIndex].push(...groupToMerge);
                overlapGroups[groupIndex] = []; // Mark as merged
              }
              
              // Update layout for all sessions in the merged group
              const mergedGroup = overlapGroups[targetGroupIndex];
              for (let i = 0; i < mergedGroup.length; i++) {
                const existingLayout = layout.get(mergedGroup[i].id);
                if (existingLayout) {
                  // If session was in same-time group, keep its row but update totalRows
                  layout.set(mergedGroup[i].id, { 
                    row: existingLayout.row, 
                    totalRows: Math.max(existingLayout.totalRows, mergedGroup.length) 
                  });
                } else {
                  layout.set(mergedGroup[i].id, { row: i, totalRows: mergedGroup.length });
                }
              }
            }
          }

          // Set default layout for sessions not in any group
          for (const session of sortedSessions) {
            if (!layout.has(session.id)) {
              layout.set(session.id, { row: 0, totalRows: 1 });
            }
          }

          return layout;
        };

        // Helper function to calculate position and dimensions for a session
        const getSessionPosition = (session: CalendarSession, layout: Map<string, { row: number; totalRows: number }>) => {
          const [hours, minutes] = session.start_time.split(':').map(Number);
          const startMinutes = hours * 60 + minutes;
          
          // Find which hour slot this session starts in
          const slotIndex = timeSlots.findIndex((slotHour) => {
            const slotStartMinutes = slotHour * 60;
            return startMinutes >= slotStartMinutes && startMinutes < slotStartMinutes + 60;
          });
          
          if (slotIndex === -1) return { slotIndex: -1, leftPercent: 0, topPercent: 0, heightPercent: 100 };
          
          // Calculate horizontal position within the hour slot (0-60 minutes)
          const slotStartMinutes = timeSlots[slotIndex] * 60;
          const offsetInSlot = startMinutes - slotStartMinutes;
          const leftPercent = (offsetInSlot / 60) * 100;
          
          // Get layout info for vertical distribution
          const layoutInfo = layout.get(session.id);
          const row = layoutInfo?.row ?? 0;
          const totalRows = layoutInfo?.totalRows ?? 1;
          
          // Calculate vertical position and height
          // Add spacing between rows (2px gap between sessions)
          const GAP_SIZE = 2; // pixels
          const CELL_HEIGHT = 60; // pixels (height of hour cell)
          const totalGaps = (totalRows - 1) * GAP_SIZE;
          const availableHeight = CELL_HEIGHT - totalGaps;
          const rowHeight = availableHeight / totalRows;
          const topOffset = row * (rowHeight + GAP_SIZE);
          
          const topPercent = (topOffset / CELL_HEIGHT) * 100;
          const heightPercent = (rowHeight / CELL_HEIGHT) * 100;
          
          return { slotIndex, leftPercent, topPercent, heightPercent };
        };

        // Group sessions by day and calculate layouts
        const sessionsByDay = weekDays.map((day) => {
          const daySessions = getSessionsForDate(day);
          return {
            sessions: daySessions.sort((a, b) => a.start_time.localeCompare(b.start_time)),
            layout: layoutSessions(daySessions),
          };
        });

        return (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            {/* Fixed header with hours */}
            <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex">
                {/* Empty cell for days column */}
                <div className="w-20 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"></div>
                {/* Hours header - scrollable horizontally, synced with content */}
                <div 
                  ref={weekHeaderScrollRef}
                  onScroll={handleHeaderScroll}
                  className="flex flex-1 overflow-x-auto"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  {timeSlots.map((hour) => (
                    <div
                      key={hour}
                      className="flex-shrink-0 p-2 text-center border-r border-gray-200 dark:border-gray-700"
                      style={{ width: `${HOUR_COLUMN_WIDTH}px` }}
                    >
                      <div className="text-xs font-semibold text-gray-900 dark:text-white">
                        {String(hour).padStart(2, '0')}:00
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Scrollable content area */}
            <div className="flex" style={{ maxHeight: 'calc(100vh - 300px)' }}>
              {/* Days column - scrollable vertically, synced with content */}
              <div 
                ref={weekDaysColumnScrollRef}
                onScroll={handleDaysColumnScroll}
                className="flex-shrink-0 w-20 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 sticky left-0 z-10 overflow-y-auto"
                style={{ scrollbarWidth: 'thin', maxHeight: 'calc(100vh - 300px)' }}
              >
                {weekDays.map((day, index) => {
                  const isToday = toISODate(day) === toISODate(new Date());
                  return (
                    <div
                      key={day.toISOString()}
                      className={`border-b border-gray-200 dark:border-gray-700 p-2 text-center ${
                        isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      style={{ height: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
                    >
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
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

              {/* Scrollable hours grid - synced with header horizontally and days column vertically */}
              <div 
                ref={weekContentScrollRef}
                onScroll={(e) => {
                  handleContentScroll(e);
                  handleContentVerticalScroll(e);
                }}
                className="flex flex-1 flex-col overflow-auto"
                style={{ scrollbarWidth: 'thin', maxHeight: 'calc(100vh - 300px)' }}
              >
                {weekDays.map((day, dayIndex) => {
                  const { sessions: daySessions, layout } = sessionsByDay[dayIndex];
                  const isToday = toISODate(day) === toISODate(new Date());
                  
                  return (
                    <div
                      key={day.toISOString()}
                      className={`flex relative ${
                        isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      style={{ minHeight: '60px' }}
                    >
                      {/* Hour slots - exact width match with header */}
                      {timeSlots.map((hour) => (
                        <div
                          key={hour}
                          className="flex-shrink-0 border-r border-gray-100 dark:border-gray-700 border-b border-gray-200 dark:border-gray-700 relative"
                          style={{ width: `${HOUR_COLUMN_WIDTH}px`, height: '60px' }}
                        ></div>
                      ))}
                      
                      {/* Sessions positioned absolutely */}
                      {daySessions.map((session) => {
                        const client = clients.find((c) => c.id === session.client_id);
                        const paymentStatus = sessionStatuses.get(session.id);
                        const isPaused = isSessionInPause(session);
                        const colorClasses = getSessionColorClasses(paymentStatus, isPaused);
                        const { slotIndex, leftPercent, topPercent, heightPercent } = getSessionPosition(session, layout);
                        
                        // Skip sessions that start before 6:00 or after 23:00
                        const [hours] = session.start_time.split(':').map(Number);
                        if (hours < 6 || hours > 23 || slotIndex === -1) return null;
                        
                        // Calculate position using exact column width
                        const left = slotIndex * HOUR_COLUMN_WIDTH + (leftPercent / 100) * HOUR_COLUMN_WIDTH;
                        const top = (topPercent / 100) * 60; // 60px is the height of hour cell
                        const height = (heightPercent / 100) * 60;
                        
                        return (
                          <div
                            key={session.id}
                            onClick={() => handleSessionSelect(session)}
                            className={`absolute rounded p-1 ${colorClasses} cursor-pointer hover:opacity-80 overflow-hidden text-xs shadow-sm`}
                            style={{
                              left: `${left}px`,
                              width: `${HOUR_COLUMN_WIDTH - 4}px`, // Full width minus small margin
                              top: `${top}px`,
                              height: `${height}px`,
                            }}
                            title={`${formatTime(session.start_time)} - ${client?.full_name || 'Неизвестный клиент'}`}
                          >
                            {/* Time with icons */}
                            <div className="font-semibold truncate flex items-center gap-1">
                              {hasNotes(session) && (
                                <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              )}
                              {isCustomEdited(session) && (
                                <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              )}
                              {formatTime(session.start_time)}
                            </div>
                            {/* Client name */}
                            <div className="truncate overflow-hidden whitespace-nowrap">
                              {client?.full_name || 'Неизвестный'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

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
              
              // Generate time slots only for full hours from 6:00 to 23:00
              const timeSlots: number[] = [];
              for (let hour = 6; hour <= 23; hour++) {
                timeSlots.push(hour);
              }

              // Helper function to parse time string to minutes
              const timeToMinutes = (timeStr: string): number => {
                const [hours, minutes] = timeStr.split(':').map(Number);
                return hours * 60 + minutes;
              };

              // Helper function to check if two sessions overlap
              const sessionsOverlap = (session1: CalendarSession, session2: CalendarSession): boolean => {
                const start1 = timeToMinutes(session1.start_time);
                const start2 = timeToMinutes(session2.start_time);
                // Assume default duration of 1 hour if not specified
                const end1 = start1 + 60;
                const end2 = start2 + 60;
                return !(end1 <= start2 || end2 <= start1);
              };

              // Layout algorithm: assign columns to overlapping sessions for day view
              const layoutDaySessions = (sessions: CalendarSession[]): Map<string, { column: number; totalColumns: number }> => {
                const layout = new Map<string, { column: number; totalColumns: number }>();
                const sortedSessions = [...sessions].sort((a, b) => 
                  timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
                );

                // Track which sessions are in which column groups
                const columnGroups: CalendarSession[][] = [];
                const sessionToGroup = new Map<string, number>();

                // Build column groups by finding all overlapping sessions
                for (const session of sortedSessions) {
                  const overlappingGroupIndices = new Set<number>();
                  
                  // Find all groups that contain sessions overlapping with this session
                  for (const [otherId, groupIndex] of sessionToGroup.entries()) {
                    const otherSession = sortedSessions.find(s => s.id === otherId);
                    if (otherSession && sessionsOverlap(session, otherSession)) {
                      overlappingGroupIndices.add(groupIndex);
                    }
                  }
                  
                  if (overlappingGroupIndices.size === 0) {
                    // Create new group
                    const newGroupIndex = columnGroups.length;
                    columnGroups.push([session]);
                    sessionToGroup.set(session.id, newGroupIndex);
                  } else {
                    // Merge all overlapping groups
                    const groupIndices = Array.from(overlappingGroupIndices);
                    const targetGroupIndex = groupIndices[0];
                    
                    // Add session to target group
                    columnGroups[targetGroupIndex].push(session);
                    sessionToGroup.set(session.id, targetGroupIndex);
                    
                    // Merge other groups into target group
                    for (let i = groupIndices.length - 1; i > 0; i--) {
                      const groupIndex = groupIndices[i];
                      const groupToMerge = columnGroups[groupIndex];
                      for (const s of groupToMerge) {
                        sessionToGroup.set(s.id, targetGroupIndex);
                      }
                      columnGroups[targetGroupIndex].push(...groupToMerge);
                      columnGroups[groupIndex] = []; // Mark as merged
                    }
                  }
                }

                // Assign columns within each group using greedy algorithm
                for (const group of columnGroups) {
                  if (group.length === 0) continue;
                  
                  const columns: CalendarSession[][] = [];
                  
                  // Sort group by start time
                  const sortedGroup = [...group].sort((a, b) => 
                    timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
                  );
                  
                  // Assign each session to a column
                  for (const session of sortedGroup) {
                    let assigned = false;
                    // Try to find a column where this session doesn't overlap
                    for (let colIndex = 0; colIndex < columns.length; colIndex++) {
                      const column = columns[colIndex];
                      if (!column.some(s => sessionsOverlap(session, s))) {
                        column.push(session);
                        assigned = true;
                        break;
                      }
                    }
                    // If no column found, create a new one
                    if (!assigned) {
                      columns.push([session]);
                    }
                  }
                  
                  // Set layout info for all sessions in this group
                  const maxColumns = columns.length;
                  for (let colIndex = 0; colIndex < columns.length; colIndex++) {
                    for (const session of columns[colIndex]) {
                      layout.set(session.id, { column: colIndex, totalColumns: maxColumns });
                    }
                  }
                }

                // Set default layout for sessions not in any group (no overlaps)
                for (const session of sortedSessions) {
                  if (!layout.has(session.id)) {
                    layout.set(session.id, { column: 0, totalColumns: 1 });
                  }
                }

                return layout;
              };

              // Calculate position for a session relative to hour rows
              const getSessionPosition = (session: CalendarSession, layout: Map<string, { column: number; totalColumns: number }>) => {
                const [hours, minutes] = session.start_time.split(':').map(Number);
                if (hours < 6 || hours > 23) return null;
                
                // Find which hour row this session belongs to (the hour it starts in)
                const hourRow = hours;
                const hourRowIndex = timeSlots.indexOf(hourRow);
                if (hourRowIndex === -1) return null;
                
                // Calculate offset within the hour (0-60 minutes)
                // This will be used as percentage from top of the hour row
                const offsetInHour = minutes;
                const topPercent = (offsetInHour / 60) * 100;
                
                // Get layout info for this session
                const layoutInfo = layout.get(session.id);
                const column = layoutInfo?.column ?? 0;
                const totalColumns = layoutInfo?.totalColumns ?? 1;
                
                return { hourRowIndex, topPercent, column, totalColumns };
              };

              // Calculate layout for all day sessions
              const dayLayout = layoutDaySessions(daySessions);

              return (
                <div className="relative">
                  {timeSlots.map((hour) => {
                    const hourTime = `${String(hour).padStart(2, '0')}:00`;
                    
                    // Find all sessions that start in this hour
                    const hourSessions = daySessions.filter((session) => {
                      const [sessionHour] = session.start_time.split(':').map(Number);
                      return sessionHour === hour;
                    });

                    return (
                      <div
                        key={hour}
                        className="relative border-b border-gray-100 dark:border-gray-700"
                        style={{ minHeight: '80px' }}
                      >
                        <div className="flex">
                          <div className="w-20 text-sm text-gray-600 dark:text-gray-400 font-medium p-2">
                            {hourTime}
                          </div>
                          <div className="flex-1 relative p-2" style={{ minHeight: '80px' }}>
                            {/* Sessions positioned absolutely based on their exact time */}
                            {hourSessions.map((session) => {
                              const client = clients.find((c) => c.id === session.client_id);
                              const paymentStatus = sessionStatuses.get(session.id);
                              const isPaused = isSessionInPause(session);
                              const colorClasses = getSessionColorClasses(paymentStatus, isPaused);
                              const position = getSessionPosition(session, dayLayout);
                              
                              if (!position) return null;
                              
                              // Calculate width and left position based on column layout
                              const widthPercent = 100 / position.totalColumns;
                              const leftPercent = (position.column * widthPercent);
                              
                              return (
                                <div
                                  key={session.id}
                                  onClick={() => handleSessionSelect(session)}
                                  className={`absolute p-2 rounded ${colorClasses} cursor-pointer hover:opacity-80 shadow-sm`}
                                  style={{
                                    top: `${position.topPercent}%`,
                                    left: `calc(${leftPercent}% + 8px)`,
                                    width: `calc(${widthPercent}% - 16px)`,
                                    minHeight: '48px',
                                  }}
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
                                    {formatTime(session.start_time)}
                                  </div>
                                  <div className="text-sm">{client?.full_name}</div>
                                </div>
                              );
                            })}
                            {hourSessions.length === 0 && (
                              <div className="text-xs text-gray-400 dark:text-gray-500 absolute top-2 left-2">—</div>
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
