import { useState, useEffect, useRef, useCallback } from 'react';
import {
  aiImportService,
  ParsedImportData,
  ImportResult,
} from '../services/AIImportService';

interface AIImportDialogProps {
  onClose: () => void;
  onSuccess: (result: ImportResult) => void;
  onOpenSettings: () => void;
}

type Step = 'upload' | 'parsing' | 'preview' | 'importing' | 'done';

export function AIImportDialog({ onClose, onSuccess, onOpenSettings }: AIImportDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>('');
  const [parsed, setParsed] = useState<ParsedImportData | null>(null);
  const [parseError, setParseError] = useState<string>('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Selection sets (indices into parsed arrays)
  const [selectedClients, setSelectedClients] = useState<Set<number>>(new Set());
  const [selectedSessions, setSelectedSessions] = useState<Set<number>>(new Set());
  const [selectedPayments, setSelectedPayments] = useState<Set<number>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check API key on mount
  useEffect(() => {
    aiImportService.hasApiKey().then(setHasApiKey);
  }, []);

  const handleFileSelect = useCallback(async (selected: File) => {
    setFile(selected);
    const text = await aiImportService.readFile(selected);
    setFilePreview(text.slice(0, 500));
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) await handleFileSelect(dropped);
    },
    [handleFileSelect]
  );

  const handleInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) await handleFileSelect(selected);
    },
    [handleFileSelect]
  );

  async function handleParse() {
    if (!file) return;
    setStep('parsing');
    setParseError('');
    try {
      const text = await aiImportService.readFile(file);
      const data = await aiImportService.parseText(text);
      setParsed(data);
      // Выбираем всё по умолчанию
      setSelectedClients(new Set(data.clients.map((_, i) => i)));
      setSelectedSessions(new Set(data.sessions.map((_, i) => i)));
      setSelectedPayments(new Set(data.payments.map((_, i) => i)));
      setStep('preview');
    } catch (e: any) {
      setParseError(e?.message ?? 'Неизвестная ошибка');
      setStep('upload');
    }
  }

  async function handleImport() {
    if (!parsed) return;
    setStep('importing');
    try {
      const importResult = await aiImportService.applyImport(
        parsed,
        selectedClients,
        selectedSessions,
        selectedPayments
      );
      setResult(importResult);
      setStep('done');
      onSuccess(importResult);
    } catch (e: any) {
      setParseError(e?.message ?? 'Ошибка импорта');
      setStep('preview');
    }
  }

  function toggleItem(set: Set<number>, setFn: (s: Set<number>) => void, idx: number) {
    const next = new Set(set);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setFn(next);
  }

  function toggleAll(
    items: any[],
    set: Set<number>,
    setFn: (s: Set<number>) => void
  ) {
    if (set.size === items.length) {
      setFn(new Set());
    } else {
      setFn(new Set(items.map((_, i) => i)));
    }
  }

  const totalSelected = selectedClients.size + selectedSessions.size + selectedPayments.size;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              AI-импорт из файла
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Excel, CSV или текстовый файл — AI распознает данные автоматически
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-4 shrink-0"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {/* No API key warning */}
          {hasApiKey === false && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-800 dark:text-yellow-200 flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>
                API-ключ OpenRouter не задан.{' '}
                <button
                  onClick={onOpenSettings}
                  className="underline font-medium"
                >
                  Открыть настройки
                </button>
              </span>
            </div>
          )}

          {/* Step: Upload */}
          {(step === 'upload' || step === 'parsing') && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <svg className="w-10 h-10 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {file ? (
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{file.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {(file.size / 1024).toFixed(1)} KB — нажмите для смены файла
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-gray-700 dark:text-gray-300">
                      Перетащите файл или нажмите для выбора
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      .xlsx, .xls, .csv, .txt
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  onChange={handleInputChange}
                  className="hidden"
                />
              </div>

              {filePreview && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Предпросмотр файла:</p>
                  <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all line-clamp-4 overflow-hidden">
                    {filePreview}
                  </pre>
                </div>
              )}

              {parseError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200">
                  {parseError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Отмена
                </button>
                <button
                  onClick={handleParse}
                  disabled={!file || step === 'parsing' || hasApiKey === false}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {step === 'parsing' ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Анализирую...
                    </span>
                  ) : 'Анализировать'}
                </button>
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && parsed && (
            <div className="space-y-5">
              {/* Clients */}
              {parsed.clients.length > 0 && (
                <PreviewSection
                  title="Клиенты"
                  count={parsed.clients.length}
                  selected={selectedClients.size}
                  onToggleAll={() => toggleAll(parsed.clients, selectedClients, setSelectedClients)}
                >
                  {parsed.clients.map((c, i) => (
                    <PreviewRow
                      key={i}
                      checked={selectedClients.has(i)}
                      onToggle={() => toggleItem(selectedClients, setSelectedClients, i)}
                    >
                      <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                      {c.phone && <span className="text-gray-500 dark:text-gray-400 text-sm">{c.phone}</span>}
                      {c.telegram && <span className="text-gray-500 dark:text-gray-400 text-sm">{c.telegram}</span>}
                    </PreviewRow>
                  ))}
                </PreviewSection>
              )}

              {/* Sessions */}
              {parsed.sessions.length > 0 && (
                <PreviewSection
                  title="Занятия"
                  count={parsed.sessions.length}
                  selected={selectedSessions.size}
                  onToggleAll={() => toggleAll(parsed.sessions, selectedSessions, setSelectedSessions)}
                >
                  {parsed.sessions.map((s, i) => (
                    <PreviewRow
                      key={i}
                      checked={selectedSessions.has(i)}
                      onToggle={() => toggleItem(selectedSessions, setSelectedSessions, i)}
                    >
                      <span className="font-medium text-gray-900 dark:text-white">{s.client_name}</span>
                      <span className="text-gray-600 dark:text-gray-300 text-sm">
                        {s.date}{s.time ? ` в ${s.time}` : ''}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {s.status === 'completed' ? 'Проведено' : s.status === 'canceled' ? 'Отменено' : 'Запланировано'}
                        {s.price != null ? ` · ${s.price}` : ''}
                      </span>
                    </PreviewRow>
                  ))}
                </PreviewSection>
              )}

              {/* Payments */}
              {parsed.payments.length > 0 && (
                <PreviewSection
                  title="Платежи"
                  count={parsed.payments.length}
                  selected={selectedPayments.size}
                  onToggleAll={() => toggleAll(parsed.payments, selectedPayments, setSelectedPayments)}
                >
                  {parsed.payments.map((p, i) => (
                    <PreviewRow
                      key={i}
                      checked={selectedPayments.has(i)}
                      onToggle={() => toggleItem(selectedPayments, setSelectedPayments, i)}
                    >
                      <span className="font-medium text-gray-900 dark:text-white">{p.client_name}</span>
                      <span className="text-green-600 dark:text-green-400 font-medium text-sm">{p.amount}</span>
                      {p.date && <span className="text-gray-500 dark:text-gray-400 text-sm">{p.date}</span>}
                    </PreviewRow>
                  ))}
                </PreviewSection>
              )}

              {parsed.clients.length === 0 && parsed.sessions.length === 0 && parsed.payments.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Данные не распознаны. Попробуйте другой файл.
                </div>
              )}

              {parseError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-200">
                  {parseError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setStep('upload'); setParseError(''); }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Назад
                </button>
                <button
                  onClick={handleImport}
                  disabled={totalSelected === 0}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  Импортировать ({totalSelected})
                </button>
              </div>
            </div>
          )}

          {/* Step: Importing */}
          {step === 'importing' && (
            <div className="text-center py-12">
              <svg className="w-10 h-10 animate-spin mx-auto mb-4 text-indigo-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-gray-600 dark:text-gray-300">Импортирую данные...</p>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Импорт завершён</h3>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  {result.clientsCreated > 0 && <p>Клиентов создано: {result.clientsCreated}</p>}
                  {result.sessionsCreated > 0 && <p>Занятий добавлено: {result.sessionsCreated}</p>}
                  {result.paymentsCreated > 0 && <p>Платежей добавлено: {result.paymentsCreated}</p>}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                    Некоторые записи не импортированы:
                  </p>
                  <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-0.5">
                    {result.errors.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Закрыть
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Sub-components

interface PreviewSectionProps {
  title: string;
  count: number;
  selected: number;
  onToggleAll: () => void;
  children: React.ReactNode;
}

function PreviewSection({ title, count, selected, onToggleAll, children }: PreviewSectionProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          {title} <span className="text-gray-500 dark:text-gray-400 font-normal text-sm">({selected}/{count})</span>
        </h3>
        <button
          onClick={onToggleAll}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {selected === count ? 'Снять все' : 'Выбрать все'}
        </button>
      </div>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 max-h-48 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

interface PreviewRowProps {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function PreviewRow({ checked, onToggle, children }: PreviewRowProps) {
  return (
    <label className="flex items-start gap-3 p-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 w-4 h-4 text-indigo-600 shrink-0"
      />
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 min-w-0">
        {children}
      </div>
    </label>
  );
}
