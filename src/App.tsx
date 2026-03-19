import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { TutorialProvider } from './contexts/TutorialContext';

// Lazy-load screens for code splitting
const ClientsScreen = lazy(() => import('./screens/ClientsScreen').then((m) => ({ default: m.ClientsScreen })));
const CalendarScreen = lazy(() => import('./screens/CalendarScreen').then((m) => ({ default: m.CalendarScreen })));
const PaymentsScreen = lazy(() => import('./screens/PaymentsScreen').then((m) => ({ default: m.PaymentsScreen })));
const SummaryScreen = lazy(() => import('./screens/SummaryScreen').then((m) => ({ default: m.SummaryScreen })));
const ShareViewScreen = lazy(() => import('./screens/ShareViewScreen').then((m) => ({ default: m.ShareViewScreen })));
const ClientProfile = lazy(() => import('./components/ClientProfile').then((m) => ({ default: m.ClientProfile })));
const ClientForm = lazy(() => import('./components/ClientForm').then((m) => ({ default: m.ClientForm })));
import { UpdateLoader } from './components/UpdateLoader';
import { UpdatePrompt } from './components/UpdatePrompt';
import { TutorialHelpButton } from './components/TutorialHelpButton';
import { clientService } from './services/ClientService';
import { Client, PERSONAL_NOTES_CLIENT_ID } from './db/types';
import { tutorialService } from './services/TutorialService';
import { getDb, resetDatabase } from './db/rxdb';
import { migrateDexieToRxDB } from './db/dexie-migration';
import { saveAutoBackup, listBackups } from './db/auto-backup';
import { backupService } from './services/BackupService';
import { secureKeyStore } from './services/SecureKeyStore';
import {
  saveCurrentVersions,
  isAppDowngraded,
  isDbMigrationNeeded,
} from './db/version';
import { onUpdateAvailable } from './pwa/register-sw';

function NavigationBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = location.pathname.split('/')[1] || 'clients';

  return (
    <nav id="tutorial-nav" data-tutorial-id="tutorial-nav" className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <div className="grid grid-cols-4 h-16">
        <button
          onClick={() => navigate('/clients')}
          className={`flex flex-col items-center justify-center ${
            activeTab === 'clients'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-xs">Клиенты</span>
        </button>
        <button
          onClick={() => navigate('/calendar')}
          className={`flex flex-col items-center justify-center ${
            activeTab === 'calendar'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs">Календарь</span>
        </button>
        <button
          onClick={() => navigate('/payments')}
          className={`flex flex-col items-center justify-center ${
            activeTab === 'payments'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-xs">Платежи</span>
        </button>
        <button
          onClick={() => navigate('/summary')}
          className={`flex flex-col items-center justify-center ${
            activeTab === 'summary'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-xs">Итоги</span>
        </button>
      </div>
    </nav>
  );
}

function ClientProfileRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'info' | 'schedule' | 'sessions' | 'payments' | 'stats' | null) || undefined;

  useEffect(() => {
    if (id) {
      clientService.getById(id).then((clientData) => {
        setClient(clientData);
        setLoading(false);
      });
    }
  }, [id]);

  if (loading) {
    return <div className="p-4">Загрузка...</div>;
  }

  if (!client) {
    return <Navigate to="/clients" replace />;
  }

  return (
    <ClientProfile
      client={client}
      onBack={() => navigate('/clients')}
      onEdit={() => navigate(`/clients/${id}/edit`)}
      onStatusChange={async () => {
        const updated = await clientService.getById(id!);
        if (updated) {
          setClient(updated);
        }
      }}
      initialTab={initialTab}
      showTutorialOnMount={!tutorialService.isCompleted('client-profile' as any)}
    />
  );
}

function ClientEditRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      clientService.getById(id).then((clientData) => {
        setClient(clientData);
        setLoading(false);
      });
    }
  }, [id]);

  if (loading) {
    return <div className="p-4">Загрузка...</div>;
  }

  if (!client) {
    return <Navigate to="/clients" replace />;
  }

  return (
    <ClientForm
      client={client}
      onSave={async (data) => {
        await clientService.update(client.id, data);
        navigate(`/clients/${client.id}`);
      }}
      onCancel={() => navigate(`/clients/${client.id}`)}
    />
  );
}

function InitErrorScreen({
  onRetry,
  onResetAndReload,
}: {
  onRetry: () => void;
  onResetAndReload: () => Promise<void>;
}) {
  const [backups, setBackups] = useState<Array<{ key: string; timestamp: string; dbVersion: number; data: string }>>([]);
  const [restoring, setRestoring] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    listBackups()
      .then((b) =>
        setBackups(b.map((x) => ({ key: x.key, timestamp: x.timestamp, dbVersion: x.dbVersion, data: x.data })))
      )
      .catch(() => setBackups([]));
  }, []);

  async function handleRestore(backupData: string) {
    setRestoring(true);
    try {
      await backupService.restoreFromStoredBackup(backupData);
      window.location.reload();
    } catch (e) {
      console.error('Restore failed:', e);
      setRestoring(false);
    }
  }

  function handleDownloadBackup(data: string) {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trainer-os-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleReset() {
    setResetting(true);
    try {
      await onResetAndReload();
      window.location.reload();
    } catch (e) {
      console.error('Reset failed:', e);
      setResetting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white dark:bg-gray-900 p-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Trainer OS</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6 max-w-sm">
        Не удалось загрузить приложение. Выберите действие:
      </p>
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={onRetry}
          className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          Перезагрузить страницу
        </button>
        {backups.length > 0 && (
          <>
            <button
              onClick={() => handleDownloadBackup(backups[0].data)}
              className="w-full px-4 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
            >
              Скачать резервную копию
            </button>
            <div className="space-y-2">
              <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Восстановить из резервной копии
              </div>
              {backups.slice(0, 3).map((b) => (
                <button
                  key={b.key}
                  onClick={() => handleRestore(b.data)}
                  disabled={restoring}
                  className="w-full px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm disabled:opacity-50"
                >
                  {new Date(b.timestamp).toLocaleString('ru')} (v{b.dbVersion})
                </button>
              ))}
            </div>
          </>
        )}
        <button
          onClick={handleReset}
          disabled={resetting}
          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-sm disabled:opacity-50"
        >
          {resetting ? 'Сброс...' : 'Сбросить базу и начать заново'}
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const [appReady, setAppReady] = useState(false);
  const [initError, setInitError] = useState(false);
  const [loaderMessage, setLoaderMessage] = useState('Загрузка...');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const initApp = useCallback(async () => {
    try {
      // Read API key from URL param ?key=
      const urlParams = new URLSearchParams(window.location.search);
      const urlKey = urlParams.get('key');
      if (urlKey) {
        await secureKeyStore.saveKey(urlKey);
        window.history.replaceState({}, '', window.location.pathname);
      }

      // Debug: simulate init error for testing
      // ?debug=init-error or ?debug=init-error-screen - simulate init failure, show recovery screen
      const debugInit = urlParams.get('debug');
      if (debugInit === 'init-error' || debugInit === 'init-error-screen') {
        window.history.replaceState({}, '', window.location.pathname);
        throw new Error('Simulated init error for testing');
      }

      // Seed legacy Dexie for migration test (dev only): ?seed=legacy-migration
      if (import.meta.env.DEV && urlParams.get('seed') === 'legacy-migration') {
        setLoaderMessage('Подготовка теста миграции...');
        const { seedLegacyForMigrationTest } = await import('./db/seed-legacy-dexie');
        await seedLegacyForMigrationTest();
        return; // seedLegacyForMigrationTest reloads the page
      }

      // Step 1: Initialize RxDB
      setLoaderMessage('Инициализация базы данных...');
      const db = await getDb();

      // Step 2: Check if this is an upgrade from Dexie
      setLoaderMessage('Проверка обновлений базы данных...');
      await migrateDexieToRxDB(db);

      // Step 3: Check if the app was downgraded
      if (isAppDowngraded()) {
        console.warn('[App] App version downgrade detected. Data may need restoration from backup.');
        // The user can manually restore from backup via the Summary screen.
        // We don't auto-restore because the current data might be valid.
      }

      // Step 4: If DB schema upgrade (e.g. 0→1), create backup for rollback via Settings
      // Note: RxDB schema migration runs when opening DB (Step 1), so backup is post-migration.
      // Dexie migration creates its own pre-migration backup before copying data.
      if (isDbMigrationNeeded()) {
        setLoaderMessage('Создание резервной копии...');
        try {
          const backupData = await backupService.exportAllData();
          await saveAutoBackup(backupData);
          console.log('[App] Pre-upgrade backup saved (available in Settings for restore/download)');
        } catch (e) {
          console.error('[App] Failed to save pre-upgrade backup:', e);
        }

        setLoaderMessage('Обновление базы данных...');
      }

      // Step 5: Save current versions
      saveCurrentVersions();

      // Step 5b: Ensure personal notes system client exists (singleton, from app start)
      const existingPersonalNotes = await db.clients.findOne(PERSONAL_NOTES_CLIENT_ID).exec();
      if (!existingPersonalNotes) {
        const now = new Date();
        await db.clients.insert({
          id: PERSONAL_NOTES_CLIENT_ID,
          full_name: 'Мои заметки',
          is_system: true,
          status: 'active',
          start_date: now.toISOString(),
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        });
      }

      // Step 6: Refresh schedule generation for all active clients (auto-renewal)
      try {
        const { scheduleService } = await import('./services/ScheduleService');
        const activeClients = await clientService.getAll({ status: 'active' });
        for (const client of activeClients) {
          const template = await scheduleService.getTemplateByClient(client.id);
          if (template) {
            await scheduleService.generateSessions(template.id);
          }
        }
      } catch (e) {
        console.error('[App] Failed to refresh schedules on startup:', e);
      }

      // App is ready - clear retry flag so future errors get one auto-retry
      sessionStorage.removeItem('trainer-os-init-retried');
      setAppReady(true);
    } catch (error) {
      console.error('[App] Initialization failed:', error);
      // Try auto-reload once - often fixes transient issues (IndexedDB lock, etc.)
      const retryKey = 'trainer-os-init-retried';
      if (!sessionStorage.getItem(retryKey)) {
        sessionStorage.setItem(retryKey, '1');
        window.location.reload();
        return;
      }
      setInitError(true);
    }
  }, []);

  useEffect(() => {
    initApp();
  }, [initApp]);

  // Listen for SW updates
  useEffect(() => {
    const unsubscribe = onUpdateAvailable((available) => {
      setUpdateAvailable(available);
    });
    return unsubscribe;
  }, []);

  if (initError) {
    return (
      <InitErrorScreen
        onRetry={() => window.location.reload()}
        onResetAndReload={async () => {
          await resetDatabase();
        }}
      />
    );
  }

  if (!appReady) {
    return <UpdateLoader message={loaderMessage} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Update notification */}
      <UpdatePrompt
        visible={updateAvailable}
        onDismiss={() => setUpdateAvailable(false)}
      />

      {/* Subtle help button on every page */}
      <TutorialHelpButton />

      {/* Main Content */}
      <main className="pb-20">
        <Suspense fallback={<div className="p-4 flex justify-center items-center min-h-[200px] text-gray-500 dark:text-gray-400">Загрузка...</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/clients" replace />} />
            <Route path="/share" element={<ShareViewScreen />} />
            <Route path="/clients" element={<ClientsScreen />} />
            <Route path="/clients/:id" element={<ClientProfileRoute />} />
            <Route path="/clients/:id/edit" element={<ClientEditRoute />} />
            <Route path="/calendar" element={<CalendarScreen />} />
            <Route path="/payments" element={<PaymentsScreen />} />
            <Route path="/summary" element={<SummaryScreen />} />
          </Routes>
        </Suspense>
      </main>

      <NavigationBar />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <TutorialProvider>
        <AppContent />
      </TutorialProvider>
    </BrowserRouter>
  );
}

export default App;
