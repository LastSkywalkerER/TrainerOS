import { useState, useEffect, useRef } from 'react';
import { aiImportService, ImportResult } from '../services/AIImportService';
import { backupService } from '../services/BackupService';
import { checkForUpdate, forceRefresh, isSwSupported } from '../pwa/register-sw';
import { AIImportDialog } from './AIImportDialog';

interface SettingsDialogProps {
  onClose: () => void;
  onSnackbar: (message: string, type: 'success' | 'error') => void;
  onImportSuccess?: () => void;
}

export function SettingsDialog({ onClose, onSnackbar, onImportSuccess }: SettingsDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [showAIImport, setShowAIImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    aiImportService.getApiKey().then((key) => {
      if (key) setApiKey(key);
    });
  }, []);

  async function handleSaveKey() {
    setSaving(true);
    try {
      if (apiKey.trim()) {
        await aiImportService.setApiKey(apiKey.trim());
        onSnackbar('API-ключ сохранён', 'success');
      } else {
        await aiImportService.clearApiKey();
        onSnackbar('API-ключ удалён', 'success');
      }
    } catch {
      onSnackbar('Ошибка сохранения ключа', 'error');
    } finally {
      setSaving(false);
    }
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
    } catch {
      onSnackbar('Ошибка при экспорте данных', 'error');
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      await backupService.importData(text);
      onSnackbar('Данные успешно импортированы', 'success');
      onImportSuccess?.();
      onClose();
    } catch (error) {
      console.error('Import failed:', error);
      onSnackbar('Ошибка при импорте данных', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleCheckUpdate() {
    setCheckingUpdate(true);
    try {
      if (isSwSupported()) {
        const found = await checkForUpdate();
        if (found) {
          onSnackbar('Найдено обновление! Нажмите "Обновить" в появившемся баннере.', 'success');
        } else {
          onSnackbar('Очистка кэша и перезагрузка...', 'success');
          setTimeout(() => forceRefresh(), 500);
          return;
        }
      } else {
        await forceRefresh();
        return;
      }
    } catch {
      onSnackbar('Ошибка проверки обновлений', 'error');
    } finally {
      setCheckingUpdate(false);
    }
  }

  function handleAIImportSuccess(result: ImportResult) {
    const parts: string[] = [];
    if (result.clientsCreated > 0) parts.push(`клиентов: ${result.clientsCreated}`);
    if (result.sessionsCreated > 0) parts.push(`занятий: ${result.sessionsCreated}`);
    if (result.paymentsCreated > 0) parts.push(`платежей: ${result.paymentsCreated}`);
    const msg = parts.length > 0 ? `Импортировано — ${parts.join(', ')}` : 'Импорт завершён';
    onSnackbar(msg, 'success');
    onImportSuccess?.();
  }

  if (showAIImport) {
    return (
      <AIImportDialog
        onClose={() => setShowAIImport(false)}
        onSuccess={handleAIImportSuccess}
        onOpenSettings={() => setShowAIImport(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
      {/* Backdrop — separate element so clicks on it don't propagate to content */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div
        className="relative z-10 bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Настройки</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* API Key Section — shown only when VITE_SHOW_API_KEY_SETTINGS=true */}
        {import.meta.env.VITE_SHOW_API_KEY_SETTINGS === 'true' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              OpenRouter API-ключ
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showKey ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {/* Save button — icon only */}
              <button
                type="button"
                onClick={handleSaveKey}
                disabled={saving}
                title="Сохранить ключ"
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
              >
                {saving ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
                openrouter.ai/keys
              </a>
              {' '}— ключ хранится зашифрованным в браузере
            </p>
          </div>
        )}

        {/* AI Import — full width */}
        <div className="mb-6">
          <button
            onClick={() => setShowAIImport(true)}
            className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            AI Импорт из файла
          </button>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 mb-6" />

        {/* Data Section */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Данные
          </h3>
          <div className="space-y-2">
            <button
              onClick={handleExport}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm text-left flex items-center gap-2"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Экспорт резервной копии
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm text-left flex items-center gap-2"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
              </svg>
              Импорт резервной копии (JSON)
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={handleCheckUpdate}
              disabled={checkingUpdate}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm text-left flex items-center gap-2 disabled:opacity-50"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {checkingUpdate ? 'Проверка...' : 'Обновить приложение'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
