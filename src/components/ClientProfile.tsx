import { useState, useEffect } from 'react';
import { Client, Payment, ClientMonthlyStats, CalendarSession } from '../db/types';
import { analyticsService } from '../services/AnalyticsService';
import { ClientStats } from '../db/types';
import { formatDate, formatTime } from '../utils/dateUtils';
import { ClientScheduleForm } from './ClientScheduleForm';
import { PaymentForm } from './PaymentForm';
import { PauseDialog } from './PauseDialog';
import { ArchiveDialog } from './ArchiveDialog';
import { SessionDraftPanel } from './SessionDraftPanel';
import { SessionCardInlineEditor } from './SessionCardInlineEditor';
import { paymentService } from '../services/PaymentService';
import { clientService } from '../services/ClientService';
import { scheduleService } from '../services/ScheduleService';
import { calendarSessionService } from '../services/CalendarSessionService';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { TutorialGuide, TutorialStep } from './TutorialGuide';
import { tutorialService } from '../services/TutorialService';
import { useTutorial } from '../contexts/TutorialContext';

interface ClientProfileProps {
  client: Client;
  onBack: () => void;
  onEdit: () => void;
  onStatusChange?: () => void;
  initialTab?: Tab;
  showTutorialOnMount?: boolean;
}

type Tab = 'info' | 'schedule' | 'sessions' | 'payments' | 'stats';

export function ClientProfile({ client, onBack, onEdit, onStatusChange, initialTab = 'info', showTutorialOnMount = false }: ClientProfileProps) {
  const { getTriggeredPage, clearTrigger } = useTutorial();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<ClientMonthlyStats[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [currentClient, setCurrentClient] = useState<Client>(client);
  const [showTutorial, setShowTutorial] = useState(false);
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [expandedSessionStatus, setExpandedSessionStatus] = useState<{
    status: 'paid' | 'partially_paid' | 'unpaid';
    allocated: number;
    price: number;
  } | null>(null);
  const [hideEmptyNotes, setHideEmptyNotes] = useState(true);
  const [showDraftPanel, setShowDraftPanel] = useState(false);
  const [draftInitialNotes, setDraftInitialNotes] = useState<string>('');
  const [selectionHtml, setSelectionHtml] = useState<string | null>(null);

  const tutorialSteps: TutorialStep[] = [
    {
      target: '#tutorial-tabs',
      title: 'Вкладки профиля клиента',
      description: 'Переключайтесь между вкладками: Информация - контакты и статус клиента, Расписание - настройка регулярных занятий, Платежи - история платежей, Расчёты - статистика и баланс.',
      position: 'bottom',
    },
  ];

  useEffect(() => {
    setCurrentClient(client);
  }, [client]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    loadStats();
    if (activeTab === 'payments') {
      loadPayments();
    }
    if (activeTab === 'stats') {
      loadMonthlyStats();
    }
    if (activeTab === 'sessions') {
      loadSessions();
    }
  }, [currentClient.id, activeTab]);

  // Check if tutorial should be shown
  useEffect(() => {
    if (showPaymentForm || showPauseDialog || showArchiveDialog) {
      return;
    }

    const triggeredPage = getTriggeredPage();
    if (triggeredPage === 'client-profile') {
      setShowTutorial(true);
      clearTrigger();
      return;
    }

    // Check if tutorial should be shown on mount or if it wasn't completed
    if (showTutorialOnMount || !tutorialService.isCompleted('client-profile' as any)) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        setShowTutorial(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [showPaymentForm, showPauseDialog, showArchiveDialog, getTriggeredPage, clearTrigger, showTutorialOnMount]);

  // Handle manual tutorial trigger from help button
  useEffect(() => {
    const triggeredPage = getTriggeredPage();
    if (triggeredPage === 'client-profile') {
      setShowTutorial(true);
      clearTrigger();
    }
  }, [getTriggeredPage, clearTrigger]);

  async function loadStats() {
    const clientStats = await analyticsService.getClientStats(currentClient.id);
    setStats(clientStats);
  }

  async function loadMonthlyStats() {
    const monthly = await analyticsService.getClientMonthlyStats(currentClient.id);
    setMonthlyStats(monthly);
  }

  async function loadPayments() {
    const clientPayments = await paymentService.getAllByClient(currentClient.id);
    setPayments(clientPayments);
  }

  useEffect(() => {
    if (activeTab !== 'sessions' || showDraftPanel) {
      setSelectionHtml(null);
      return;
    }
    function handleSelectionChange() {
      const sel = document.getSelection();
      const activeEl = document.activeElement as HTMLElement | null;
      const isEditing = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
      if (!sel || sel.isCollapsed) {
        if (isEditing) return; // Skip update when editing to avoid re-render that can steal focus
        setSelectionHtml(null);
        return;
      }
      try {
        const range = sel.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const el = container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element);
        if (!el?.closest('.session-notes-selectable')) {
          setSelectionHtml(null);
          return;
        }
        const frag = range.cloneContents();
        const div = document.createElement('div');
        div.appendChild(frag);
        const html = div.innerHTML.trim();
        setSelectionHtml(html || null);
      } catch {
        setSelectionHtml(null);
      }
    }
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [activeTab, showDraftPanel]);

  async function loadSessions() {
    const clientSessions = await calendarSessionService.getByClient(currentClient.id);
    // Sort by date descending and filter out canceled sessions
    const sortedSessions = clientSessions
      .filter(s => s.status !== 'canceled')
      .sort((a, b) => b.date.localeCompare(a.date) || b.start_time.localeCompare(a.start_time));
    setSessions(sortedSessions);
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
            {currentClient.full_name}
          </h1>
          <button onClick={onEdit} className="text-blue-600 dark:text-blue-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div id="tutorial-tabs" data-tutorial-id="tutorial-tabs" className="flex border-b border-gray-200 dark:border-gray-700">
          {(['info', 'schedule', 'sessions', 'payments', 'stats'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium ${
                activeTab === tab
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              {tab === 'info' ? 'Информация' : tab === 'schedule' ? 'Расписание' : tab === 'sessions' ? 'Занятия' : tab === 'payments' ? 'Платежи' : 'Расчёты'}
            </button>
          ))}
        </div>
      </div>

      {/* Content - extra pb on mobile when draft open (nav hidden); narrow on md when draft open so header stays full width */}
      <div className={`p-4 ${showDraftPanel ? 'pb-[40vh] md:pb-4 md:mr-[400px]' : ''}`}>
        {activeTab === 'info' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">Контакты</h2>
              {currentClient.phone && (
                <div className="text-gray-700 dark:text-gray-300 mb-1">📞 {currentClient.phone}</div>
              )}
              {currentClient.telegram && (
                <div className="text-gray-700 dark:text-gray-300 mb-1">✈️ {currentClient.telegram}</div>
              )}
            </div>

            {currentClient.notes && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">Заметки</h2>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{currentClient.notes}</p>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-semibold text-gray-900 dark:text-white">Статус</h2>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <span className={`px-3 py-1 rounded ${
                  currentClient.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  currentClient.status === 'paused' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                  'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                  {currentClient.status === 'active' ? 'Активен' : currentClient.status === 'paused' ? 'На паузе' : 'Архив'}
                </span>
              </div>
              {currentClient.status === 'paused' && currentClient.pause_from && currentClient.pause_to && (
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Период паузы: {formatDate(currentClient.pause_from)} - {formatDate(currentClient.pause_to)}
                </div>
              )}
              {currentClient.status === 'archived' && currentClient.archive_date && (
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Архивирован с: {formatDate(currentClient.archive_date)}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {currentClient.status === 'active' && (
                  <>
                    <button
                      onClick={() => setShowPauseDialog(true)}
                      className="px-3 py-1.5 text-sm bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-900/60 transition-colors"
                    >
                      Поставить на паузу
                    </button>
                    <button
                      onClick={() => setShowArchiveDialog(true)}
                      className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      В архив
                    </button>
                  </>
                )}
                {currentClient.status === 'paused' && (
                  <>
                    <button
                      onClick={async () => {
                        await clientService.resume(currentClient.id);
                        // Regenerate schedule after resuming from pause
                        const { scheduleService } = await import('../services/ScheduleService');
                        await scheduleService.regenerateSessions(currentClient.id);
                        const updated = await clientService.getById(currentClient.id);
                        if (updated) {
                          setCurrentClient(updated);
                          onStatusChange?.();
                        }
                      }}
                      className="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
                    >
                      Возобновить
                    </button>
                    <button
                      onClick={() => setShowArchiveDialog(true)}
                      className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      В архив
                    </button>
                  </>
                )}
                {currentClient.status === 'archived' && (
                  <button
                    onClick={async () => {
                      await clientService.resume(currentClient.id);
                      // Regenerate schedule after unarchiving
                      const { scheduleService } = await import('../services/ScheduleService');
                      await scheduleService.regenerateSessions(currentClient.id);
                      const updated = await clientService.getById(currentClient.id);
                      if (updated) {
                        setCurrentClient(updated);
                        onStatusChange?.();
                      }
                    }}
                    className="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
                  >
                    Вернуть из архива
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'schedule' && (
          <ClientScheduleForm clientId={currentClient.id} />
        )}

        {activeTab === 'sessions' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Занятия</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideEmptyNotes}
                  onChange={(e) => setHideEmptyNotes(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Скрыть без заметок</span>
              </label>
            </div>
            
            {(() => {
              const filteredSessions = hideEmptyNotes 
                ? sessions.filter(s => s.notes && s.notes.trim() !== '' && s.notes !== '<p></p>')
                : sessions;
              
              return filteredSessions.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  {hideEmptyNotes && sessions.length > 0
                    ? 'Нет занятий с заметками.'
                    : 'Нет занятий. Занятия появятся после настройки расписания.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSessions.map((session) => (
                    <div
                      key={session.id}
                      className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow hover:shadow-md transition-shadow relative w-full"
                    >
                      <div className="flex flex-col gap-2 w-full">
                        <div className="flex items-start justify-between gap-2 w-full">
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="font-medium text-gray-900 dark:text-white">
                                {formatDate(session.date)} в {formatTime(session.start_time)}
                              </div>
                              {expandedSessionId === session.id && expandedSessionStatus && (
                                <span
                                  className={`shrink-0 px-2 py-0.5 rounded text-xs ${
                                    expandedSessionStatus.status === 'paid'
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                      : expandedSessionStatus.status === 'partially_paid'
                                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                  }`}
                                >
                                  {expandedSessionStatus.status === 'paid'
                                    ? 'Оплачено'
                                    : expandedSessionStatus.status === 'partially_paid'
                                    ? 'Частично'
                                    : 'Не оплачено'}
                                </span>
                              )}
                            </div>
                            {expandedSessionId !== session.id && (
                              session.notes &&
                              session.notes.trim() !== '' &&
                              session.notes !== '<p></p>' ? (
                                <div
                                  className="session-notes-selectable tiptap ProseMirror text-sm text-gray-900 dark:text-white max-w-none select-text"
                                  style={{ minHeight: 'auto', padding: 0 }}
                                  dangerouslySetInnerHTML={{ __html: session.notes }}
                                />
                              ) : (
                                <div className="text-sm text-gray-400 dark:text-gray-500 italic">
                                  Нет заметок
                                </div>
                              )
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button
                              onClick={() => {
                                if (expandedSessionId === session.id) {
                                  setExpandedSessionId(null);
                                  setExpandedSessionStatus(null);
                                } else {
                                  setExpandedSessionId(session.id);
                                  setExpandedSessionStatus(null);
                                }
                              }}
                              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200"
                              title={expandedSessionId === session.id ? 'Закрыть' : 'Редактировать'}
                            >
                              {expandedSessionId === session.id ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setDraftInitialNotes(session.notes || '');
                                setShowDraftPanel(true);
                              }}
                              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200"
                              title="Создать черновик из заметок"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        {expandedSessionId === session.id && (
                          <div className="w-full min-w-0">
                            <SessionCardInlineEditor
                              session={session}
                              onNotesSaved={(updated) => {
                                setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                              }}
                              onCollapse={() => {
                                setExpandedSessionId(null);
                                setExpandedSessionStatus(null);
                              }}
                              onCancel={async () => {
                                await calendarSessionService.cancel(session.id);
                                setExpandedSessionId(null);
                                setExpandedSessionStatus(null);
                                loadSessions();
                              }}
                              onStatusLoaded={(data) => {
                                if (data.sessionId === session.id) {
                                  setExpandedSessionStatus(data);
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Add from selection button */}
        {activeTab === 'sessions' && !showDraftPanel && selectionHtml && (
          <button
            onClick={() => {
              setDraftInitialNotes(selectionHtml);
              setShowDraftPanel(true);
              document.getSelection()?.removeAllRanges();
              setSelectionHtml(null);
            }}
            className="fixed bottom-[6.625rem] right-20 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 transition-colors z-30 text-sm font-medium"
            title="Добавить из выделенного"
          >
            Добавить из выделенного
          </button>
        )}

        {/* FAB: add session (sessions tab only) */}
        {activeTab === 'sessions' && !showDraftPanel && (
          <button
            onClick={() => {
              setDraftInitialNotes('');
              setShowDraftPanel(true);
            }}
            className="fixed bottom-24 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors z-30"
            title="Добавить занятие"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}

        {showDraftPanel && (
          <SessionDraftPanel
            clientId={currentClient.id}
            sessions={sessions}
            initialNotes={draftInitialNotes}
            onSave={(session) => {
              setShowDraftPanel(false);
              setDraftInitialNotes('');
              setSessions((prev) => {
                const idx = prev.findIndex((s) => s.id === session.id);
                if (idx >= 0) return prev.map((s) => (s.id === session.id ? session : s));
                return [session, ...prev].sort(
                  (a, b) => b.date.localeCompare(a.date) || b.start_time.localeCompare(a.start_time)
                );
              });
            }}
            onCancel={() => {
              setShowDraftPanel(false);
              setDraftInitialNotes('');
            }}
          />
        )}

        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Платежи</h2>
              <button
                onClick={() => setShowPaymentForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Добавить платёж
              </button>
            </div>

            {payments.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                Нет платежей. Добавьте первый платёж.
              </div>
            ) : (
              <div className="space-y-2">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {formatDate(payment.paid_at)}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {payment.amount.toFixed(2)} BYN
                        </div>
                        {payment.comment && (
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {payment.comment}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showPaymentForm && (
              <PaymentForm
                clients={[currentClient]}
                defaultClientId={currentClient.id}
                onSave={async (data) => {
                  const payment = await paymentService.create(currentClient.id, {
                    paid_at: data.paid_at,
                    amount: data.amount,
                    method: data.method,
                    comment: data.comment,
                  });
                  if (data.autoAllocate) {
                    await paymentService.autoAllocate(payment.id);
                  }
                  setShowPaymentForm(false);
                  await loadPayments();
                  await loadStats();
                }}
                onCancel={() => setShowPaymentForm(false)}
              />
            )}
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
                  <span className="font-semibold text-gray-900 dark:text-white">{stats.total_effective_allocated.toFixed(2)} BYN</span>
                </div>
                {stats.total_effective_allocated !== stats.total_allocated && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-gray-500">(включая баланс: {stats.total_allocated.toFixed(2)} BYN реально распределено)</span>
                  </div>
                )}
                {stats.total_debt > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Долг:</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">{stats.total_debt.toFixed(2)} BYN</span>
                  </div>
                )}
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

            {/* Monthly Statistics */}
            {monthlyStats.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
                <h2 className="font-semibold mb-4 text-gray-900 dark:text-white">Статистика по месяцам</h2>
                <div className="space-y-4">
                  {monthlyStats.map((monthStat) => (
                    <div key={monthStat.month.toISOString()} className="border-b border-gray-200 dark:border-gray-700 pb-3 last:border-b-0 last:pb-0">
                      <div className="font-semibold text-gray-900 dark:text-white mb-2">
                        {format(monthStat.month, 'MMMM yyyy', { locale: ru })}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Занятий: </span>
                          <span className="font-semibold text-gray-900 dark:text-white">{monthStat.total_sessions}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Оплачено: </span>
                          <span className="font-semibold text-green-600 dark:text-green-400">{monthStat.paid_sessions}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Не оплачено: </span>
                          <span className="font-semibold text-red-600 dark:text-red-400">{monthStat.unpaid_sessions}</span>
                        </div>
                        {monthStat.partially_paid_sessions > 0 && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Частично: </span>
                            <span className="font-semibold text-yellow-600 dark:text-yellow-400">{monthStat.partially_paid_sessions}</span>
                          </div>
                        )}
                        {monthStat.total_debt > 0 && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Долг: </span>
                            <span className="font-semibold text-red-600 dark:text-red-400">{monthStat.total_debt.toFixed(2)} BYN</span>
                          </div>
                        )}
                        {monthStat.total_paid > 0 && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">Оплачено: </span>
                            <span className="font-semibold text-green-600 dark:text-green-400">{monthStat.total_paid.toFixed(2)} BYN</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pause Dialog */}
      {showPauseDialog && (
        <PauseDialog
          onSave={async (pauseFrom, pauseTo) => {
            await clientService.pause(currentClient.id, pauseFrom, pauseTo);
            const updated = await clientService.getById(currentClient.id);
            if (updated) {
              setCurrentClient(updated);
              onStatusChange?.();
            }
            setShowPauseDialog(false);
          }}
          onCancel={() => setShowPauseDialog(false)}
          initialPauseFrom={currentClient.pause_from}
          initialPauseTo={currentClient.pause_to}
        />
      )}

      {/* Archive Dialog */}
      {showArchiveDialog && (
        <ArchiveDialog
          onSave={async (archiveDate) => {
            await clientService.archive(currentClient.id, archiveDate);
            await scheduleService.clearScheduleFromDate(currentClient.id, archiveDate);
            const updated = await clientService.getById(currentClient.id);
            if (updated) {
              setCurrentClient(updated);
              onStatusChange?.();
            }
            setShowArchiveDialog(false);
          }}
          onCancel={() => setShowArchiveDialog(false)}
          initialArchiveDate={currentClient.archive_date}
        />
      )}

      {/* Tutorial Guide - hide when panels/dialogs are open so inputs can receive focus */}
      <TutorialGuide
        steps={tutorialSteps}
        isActive={showTutorial && !showPaymentForm && !showPauseDialog && !showArchiveDialog && !showDraftPanel && !expandedSessionId}
        onComplete={() => {
          setShowTutorial(false);
          tutorialService.markCompleted('client-profile' as any);
        }}
        onSkip={() => {
          setShowTutorial(false);
          tutorialService.markCompleted('client-profile' as any);
        }}
      />
    </div>
  );
}
