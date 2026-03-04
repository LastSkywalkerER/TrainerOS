import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client } from '../db/types';
import { clientService } from '../services/ClientService';
import { analyticsService } from '../services/AnalyticsService';
import { MonthlyStats } from '../db/types';
import { TutorialGuide, TutorialStep } from '../components/TutorialGuide';
import { tutorialService } from '../services/TutorialService';
import { useTutorial } from '../contexts/TutorialContext';
import { Snackbar } from '../components/Snackbar';
import { SettingsDialog } from '../components/SettingsDialog';
import { APP_VERSION, DB_SCHEMA_VERSION } from '../db/version';

export function SummaryScreen() {
  const navigate = useNavigate();
  const { getTriggeredPage, clearTrigger } = useTutorial();
  const [monthStats, setMonthStats] = useState<MonthlyStats | null>(null);
  const [clientsWithDebt, setClientsWithDebt] = useState<Array<{ client: Client; debt: number }>>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const tutorialSteps: TutorialStep[] = [
    {
      target: '#tutorial-stats',
      title: 'Статистика за месяц',
      description: 'Здесь отображается общая статистика за текущий месяц: количество активных клиентов, занятий, платежей и общий долг.',
      position: 'bottom',
    },
    {
      target: '#tutorial-debts',
      title: 'Клиенты с долгами',
      description: 'Кликайте на клиента для просмотра детальной информации о его долгах и расчётах.',
      position: 'top',
    },
    {
      target: '#tutorial-nav',
      title: 'Навигация',
      description: 'Переключайтесь между разделами приложения: Клиенты, Календарь, Платежи и Итоги.',
      position: 'top',
    },
  ];

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    const triggeredPage = getTriggeredPage();
    if (triggeredPage === 'summary') {
      setShowTutorial(true);
      clearTrigger();
      return;
    }

    if (!tutorialService.isCompleted('summary')) {
      const timer = setTimeout(() => {
        setShowTutorial(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [getTriggeredPage, clearTrigger]);

  async function loadStats() {
    const now = new Date();
    const stats = await analyticsService.getMonthlyStats(now);
    setMonthStats(stats);

    const allClients = await clientService.getAll({ status: 'active' });
    const debtClients = await Promise.all(
      allClients.map(async (client) => {
        const debt = await analyticsService.getClientDebt(client.id);
        return { client, debt };
      })
    );
    setClientsWithDebt(debtClients.filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt));
  }

  function showSnackbar(message: string, type: 'success' | 'error') {
    setSnackbar({ message, type });
    setTimeout(() => setSnackbar(null), 5000);
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Итоги</h1>
        <button
          onClick={() => {
            setShowSettings(true);
            setShowTutorial(false);
            // Mark ALL tutorials completed — user found Settings, they know the app
            tutorialService.markCompleted('summary');
            tutorialService.markCompleted('clients');
            tutorialService.markCompleted('calendar');
            tutorialService.markCompleted('payments');
          }}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          aria-label="Настройки"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Monthly Stats */}
      {monthStats && (
        <div id="tutorial-stats" data-tutorial-id="tutorial-stats" className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <div className="text-sm text-gray-600 dark:text-gray-400">Активных клиентов</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{monthStats.total_clients}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <div className="text-sm text-gray-600 dark:text-gray-400">Занятий в месяце</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{monthStats.total_sessions}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <div className="text-sm text-gray-600 dark:text-gray-400">Платежей в месяце</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{monthStats.total_payments.toFixed(2)} BYN</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <div className="text-sm text-gray-600 dark:text-gray-400">Общий долг</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{monthStats.total_debt.toFixed(2)} BYN</div>
          </div>
        </div>
      )}

      {/* Clients with Debt */}
      <div id="tutorial-debts" data-tutorial-id="tutorial-debts" className="mb-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">Клиенты с долгами</h2>
        {clientsWithDebt.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow text-center text-gray-500 dark:text-gray-400">
            Нет клиентов с долгами
          </div>
        ) : (
          <div className="space-y-2">
            {clientsWithDebt.map(({ client, debt }) => (
              <div
                key={client.id}
                onClick={() => navigate(`/clients/${client.id}?tab=stats`)}
                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">{client.full_name}</div>
                    {client.phone && (
                      <div className="text-sm text-gray-600 dark:text-gray-400">{client.phone}</div>
                    )}
                  </div>
                  <div className="text-lg font-bold text-red-600 dark:text-red-400">
                    {debt.toFixed(2)} BYN
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tutorial Guide - hide when Settings is open so input can receive focus */}
      <TutorialGuide
        steps={tutorialSteps}
        isActive={showTutorial && !showSettings}
        onComplete={() => {
          setShowTutorial(false);
          tutorialService.markCompleted('summary');
        }}
        onSkip={() => {
          setShowTutorial(false);
          tutorialService.markCompleted('summary');
        }}
      />

      {/* App Version */}
      <div className="text-center text-xs text-gray-400 dark:text-gray-600 mt-8 mb-4">
        Trainer OS v{APP_VERSION} (DB v{DB_SCHEMA_VERSION})
      </div>

      {showSettings && (
        <SettingsDialog
          onClose={() => setShowSettings(false)}
          onSnackbar={showSnackbar}
          onImportSuccess={loadStats}
        />
      )}

      <Snackbar
        message={snackbar?.message || ''}
        type={snackbar?.type || 'success'}
        visible={snackbar !== null}
        onClose={() => setSnackbar(null)}
      />
    </div>
  );
}
