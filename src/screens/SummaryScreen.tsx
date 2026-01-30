import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Client } from '../db/types';
import { clientService } from '../services/ClientService';
import { analyticsService } from '../services/AnalyticsService';
import { MonthlyStats } from '../db/types';
import { TutorialGuide, TutorialStep } from '../components/TutorialGuide';
import { tutorialService } from '../services/TutorialService';
import { useTutorial } from '../contexts/TutorialContext';
import { backupService } from '../services/BackupService';
import { Snackbar } from '../components/Snackbar';

export function SummaryScreen() {
  const navigate = useNavigate();
  const { getTriggeredPage, clearTrigger } = useTutorial();
  const [monthStats, setMonthStats] = useState<MonthlyStats | null>(null);
  const [clientsWithDebt, setClientsWithDebt] = useState<Array<{ client: Client; debt: number }>>([]);
  const [showTutorial, setShowTutorial] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Check if tutorial should be shown
  useEffect(() => {
    const triggeredPage = getTriggeredPage();
    if (triggeredPage === 'summary') {
      setShowTutorial(true);
      clearTrigger();
      return;
    }

    // Check if tutorial was completed
    if (!tutorialService.isCompleted('summary')) {
      // Small delay to ensure DOM is ready
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

    // Get clients with debt
    const allClients = await clientService.getAll({ status: 'active' });
    const debtClients = await Promise.all(
      allClients.map(async (client) => {
        const debt = await analyticsService.getClientDebt(client.id);
        return { client, debt };
      })
    );
    setClientsWithDebt(debtClients.filter((c) => c.debt > 0).sort((a, b) => b.debt - a.debt));
  }

  async function handleExport() {
    try {
      const jsonData = await backupService.exportAllData();
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `trainer-os-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      setSnackbar({ message: 'Ошибка при экспорте данных', type: 'error' });
      setTimeout(() => setSnackbar(null), 5000);
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      await backupService.importData(text);
      setSnackbar({ message: 'Данные успешно импортированы', type: 'success' });
      setTimeout(() => setSnackbar(null), 5000);
      // Reload stats after import
      await loadStats();
    } catch (error) {
      console.error('Import failed:', error);
      setSnackbar({ message: 'Ошибка при импорте данных', type: 'error' });
      setTimeout(() => setSnackbar(null), 5000);
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Итоги</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
          >
            Экспорт данных
          </button>
          <button
            onClick={handleImportClick}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm"
          >
            Импорт данных
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
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

      {/* Tutorial Guide */}
      <TutorialGuide
        steps={tutorialSteps}
        isActive={showTutorial}
        onComplete={() => {
          setShowTutorial(false);
          tutorialService.markCompleted('summary');
        }}
        onSkip={() => {
          setShowTutorial(false);
          tutorialService.markCompleted('summary');
        }}
      />

      {/* Snackbar Notification */}
      <Snackbar
        message={snackbar?.message || ''}
        type={snackbar?.type || 'success'}
        visible={snackbar !== null}
        onClose={() => setSnackbar(null)}
      />
    </div>
  );
}
