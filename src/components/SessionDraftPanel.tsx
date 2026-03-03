import { useState, useEffect, useRef } from 'react';
import { useEditor, useEditorState, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Underline } from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { CalendarSession } from '../db/types';
import { toISODate } from '../utils/dateUtils';
import { formatDate, formatTime } from '../utils/dateUtils';
import { calendarSessionService } from '../services/CalendarSessionService';
import { Snackbar } from './Snackbar';

export function getNearestPastSession(sessions: CalendarSession[]): CalendarSession | null {
  const today = toISODate(new Date());
  const past = sessions
    .filter((s) => s.status !== 'canceled' && s.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || b.start_time.localeCompare(a.start_time));
  return past[0] ?? null;
}

export function findSessionByDateTime(
  sessions: CalendarSession[],
  clientId: string,
  date: string,
  startTime: string
): CalendarSession | undefined {
  return sessions.find(
    (s) =>
      s.client_id === clientId &&
      s.date === date &&
      s.start_time === startTime &&
      s.status !== 'canceled'
  );
}

interface SessionDraftPanelProps {
  clientId: string;
  sessions: CalendarSession[];
  initialNotes?: string;
  onSave: (session: CalendarSession) => void;
  onCancel: () => void;
}

export function SessionDraftPanel({
  clientId,
  sessions,
  initialNotes = '',
  onSave,
  onCancel,
}: SessionDraftPanelProps) {
  const nearest = getNearestPastSession(sessions);
  const [date, setDate] = useState(nearest?.date ?? toISODate(new Date()));
  const [startTime, setStartTime] = useState(nearest?.start_time ?? '10:00');
  const [priceOverride, setPriceOverride] = useState<number | undefined>(nearest?.price_override);
  const [showDateEdit, setShowDateEdit] = useState(false);
  const [showPriceEdit, setShowPriceEdit] = useState(false);
  const [conflicts, setConflicts] = useState<CalendarSession[]>([]);
  const [showConflictToast, setShowConflictToast] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [showTableToolbar, setShowTableToolbar] = useState(false);
  const dateEditRef = useRef<HTMLDivElement>(null);
  const priceEditRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: 'Напишите заметку...',
      }),
      Underline,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialNotes || '',
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-full p-2 block',
      },
    },
  });

  const editorState = useEditorState({
    editor,
    selector: (ctx) => ({
      isInTable: ctx.editor ? (ctx.editor.isActive('tableCell') || ctx.editor.isActive('tableHeader')) : false,
    }),
  });

  useEffect(() => {
    if (nearest) {
      setDate(nearest.date);
      setStartTime(nearest.start_time);
      setPriceOverride(nearest.price_override);
    }
  }, [nearest?.id]);

  useEffect(() => {
    async function check() {
      const list = await calendarSessionService.checkConflicts(date, startTime);
      setConflicts(list);
    }
    if (date && startTime) check();
  }, [date, startTime]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (dateEditRef.current && !dateEditRef.current.contains(target)) {
        setShowDateEdit(false);
      }
      if (priceEditRef.current && !priceEditRef.current.contains(target)) {
        setShowPriceEdit(false);
      }
      if (toolbarRef.current && !toolbarRef.current.contains(target)) {
        setShowToolbar(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(
    () => () => {
      if (editor) editor.destroy();
    },
    [editor]
  );

  const existing = findSessionByDateTime(sessions, clientId, date, startTime);
  const otherClientConflicts = conflicts.filter((c) => c.client_id !== clientId);
  const hasConflictWithOther = otherClientConflicts.length > 0;

  async function doCreate() {
    if (!editor) return;
    const notes = editor.getHTML();
    setIsSaving(true);
    try {
      const session = await calendarSessionService.createCustom(clientId, {
        date,
        start_time: startTime,
        price_override: priceOverride,
        notes: notes.trim() ? notes : undefined,
      });
      setSnackbar({ message: 'Занятие создано', type: 'success' });
      setTimeout(() => onSave(session), 500);
    } catch (e) {
      setSnackbar({ message: 'Ошибка при создании', type: 'error' });
      setTimeout(() => setSnackbar(null), 4000);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave() {
    if (!editor) return;
    const notes = editor.getHTML();

    if (existing) {
      setIsSaving(true);
      try {
        const updated = await calendarSessionService.update(existing.id, { notes, price_override: priceOverride });
        setSnackbar({ message: 'Пометки сохранены', type: 'success' });
        setTimeout(() => onSave(updated), 500);
      } catch (e) {
        setSnackbar({ message: 'Ошибка при сохранении', type: 'error' });
        setTimeout(() => setSnackbar(null), 4000);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (hasConflictWithOther) {
      setShowConflictToast(true);
      return;
    }

    await doCreate();
  }

  function handleConflictConfirm() {
    setShowConflictToast(false);
    doCreate();
  }

  return (
    <>
      <div className="fixed z-50 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md
        bottom-0 left-0 right-0 h-[40vh] min-h-[220px] rounded-t-xl overflow-hidden
        md:bottom-16 md:left-auto md:right-0 md:top-[115px] md:h-auto md:w-full md:max-w-[400px] md:rounded-none md:min-h-0 md:shadow-xl
      ">
        <div className="absolute inset-0 flex flex-col overflow-hidden p-3 gap-2">
          {/* Price (left) and Date (right): floating labels above input */}
          <div className="flex justify-between items-center shrink-0 gap-2">
            <div ref={priceEditRef}>
              {showPriceEdit ? (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceOverride ?? ''}
                  onChange={(e) => setPriceOverride(e.target.value ? parseFloat(e.target.value) : undefined)}
                  onBlur={() => setShowPriceEdit(false)}
                  placeholder="Цена BYN"
                  className="w-20 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white/90 dark:bg-gray-700/90 backdrop-blur text-gray-900 dark:text-white"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => setShowPriceEdit(true)}
                  className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {priceOverride != null ? `${priceOverride.toFixed(2)} BYN` : 'Цена'}
                  <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
            <div ref={dateEditRef}>
            {showDateEdit ? (
              <div className="flex items-center gap-2 flex-wrap rounded-lg px-2 py-1.5">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            ) : (
              <button
                onClick={() => setShowDateEdit(true)}
                className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-1 transition-colors cursor-pointer"
              >
                {formatDate(date)} в {formatTime(startTime)}
                <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            </div>
          </div>

          {/* Editor area: scrollable, styled as text field */}
          <div className="flex-1 min-h-0 relative border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 overflow-hidden ring-1 ring-inset ring-gray-200/50 dark:ring-gray-600/50">
            <div className="absolute inset-0 overflow-y-auto p-3 pr-12 pb-12">
              {editor ? (
                <EditorContent editor={editor} />
              ) : (
                <div className="p-4 text-gray-400 text-sm">Загрузка...</div>
              )}
            </div>

            {/* Format button + toolbar - top-right, left of close button */}
            {editor && (
              <div ref={toolbarRef} className="absolute top-1.5 right-10 z-10 flex gap-0.5">
                {/* Table controls button — visible only when cursor is inside a table */}
                {editorState?.isInTable && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setShowTableToolbar((v) => !v); setShowToolbar(false); }}
                      className={`p-1.5 rounded hover:bg-gray-200/60 dark:hover:bg-gray-600/60 ${showTableToolbar ? 'bg-gray-200/60 dark:bg-gray-600/60' : ''}`}
                      title="Таблица"
                    >
                      <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" /></svg>
                    </button>
                    {showTableToolbar && (
                      <div className="absolute top-0 right-full mr-1 flex gap-0.5 p-1 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 shadow-lg">
                        <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Добавить строку ниже">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m-4-4l4 4 4-4M4 12h16" /></svg>
                        </button>
                        <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-red-500" title="Удалить строку">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16M9 4v4m6-4v4M9 16v4m6-4v4" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 11l4 4m0-4l-4 4" /></svg>
                        </button>
                        <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Добавить столбец справа">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16m-4-4l4 4-4 4M12 4v16" /></svg>
                        </button>
                        <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-red-500" title="Удалить столбец">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4v16M16 4v16M4 9h4m-4 6h4m12-6h-4m4 6h-4" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 11l4 4m0-4l-4 4" /></svg>
                        </button>
                        <button type="button" onClick={() => { editor.chain().focus().deleteTable().run(); setShowTableToolbar(false); }} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-red-500" title="Удалить таблицу">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {/* Format button */}
                <button
                  type="button"
                  onClick={() => { setShowToolbar((v) => !v); setShowTableToolbar(false); }}
                  className={`p-1.5 rounded hover:bg-gray-200/60 dark:hover:bg-gray-600/60 ${
                    showToolbar ? 'bg-gray-200/60 dark:bg-gray-600/60' : ''
                  }`}
                  title="Форматирование"
                >
                  <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                </button>
                {showToolbar && (
                  <div className="absolute top-0 right-full mr-1 flex flex-wrap gap-0.5 p-1 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 shadow-lg" style={{ width: 'max-content', maxWidth: '220px' }}>
                    <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${editor.isActive('bold') ? 'bg-gray-300 dark:bg-gray-500' : ''}`} title="Жирный">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" /></svg>
                    </button>
                    <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${editor.isActive('italic') ? 'bg-gray-300 dark:bg-gray-500' : ''}`} title="Курсив">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5h6M7 19h6M8 19l8-14" /></svg>
                    </button>
                    <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${editor.isActive('underline') ? 'bg-gray-300 dark:bg-gray-500' : ''}`} title="Подчёркнутый">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4v6a4 4 0 008 0V4M4 20h16" /></svg>
                    </button>
                    <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${editor.isActive('strike') ? 'bg-gray-300 dark:bg-gray-500' : ''}`} title="Зачеркнутый">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.3 8.3C16.8 6.4 15 5 12.7 5c-2.8 0-4.7 1.8-4.7 4 0 1 .4 1.9 1.1 2.5M5 12h14M6.7 15.7C7.2 17.6 9 19 11.3 19c2.8 0 4.7-1.8 4.7-4 0-1-.4-1.9-1.1-2.5" /></svg>
                    </button>
                    <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`px-1.5 py-1 rounded text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-600 ${editor.isActive('heading', { level: 1 }) ? 'bg-gray-300 dark:bg-gray-500' : ''}`} title="Заголовок 1">H1</button>
                    <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`px-1.5 py-1 rounded text-xs font-bold hover:bg-gray-200 dark:hover:bg-gray-600 ${editor.isActive('heading', { level: 2 }) ? 'bg-gray-300 dark:bg-gray-500' : ''}`} title="Заголовок 2">H2</button>
                    <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${editor.isActive('bulletList') ? 'bg-gray-300 dark:bg-gray-500' : ''}`} title="Список">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
                    </button>
                    <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${editor.isActive('orderedList') ? 'bg-gray-300 dark:bg-gray-500' : ''}`} title="Нумерованный список">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
                    </button>
                    <button type="button" onClick={() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run()} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Вставить таблицу">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" /></svg>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Close: floating top-right over editor */}
            <button
              onClick={onCancel}
              className="absolute top-1.5 right-1.5 z-10 p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-gray-600/60 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Send: floating bottom-right over editor */}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !editor}
              className="absolute bottom-1.5 right-1.5 z-10 p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow"
              title={existing ? 'Обновить заметки' : 'Добавить'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {showConflictToast && (
        <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-24 md:bottom-4 md:max-w-sm z-50 animate-[slideUp_0.3s_ease-out]">
          <div className="bg-yellow-50 dark:bg-yellow-900/90 border border-yellow-200 dark:border-yellow-800 rounded-lg px-4 py-3 shadow-lg flex items-start justify-between gap-3">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              В это время занятие у другого клиента. Создать?
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setShowConflictToast(false)}
                className="text-sm text-yellow-700 dark:text-yellow-300 hover:underline"
              >
                Нет
              </button>
              <button
                onClick={handleConflictConfirm}
                className="text-sm font-medium text-yellow-800 dark:text-yellow-200 hover:underline"
              >
                Да
              </button>
            </div>
          </div>
        </div>
      )}

      <Snackbar
        message={snackbar?.message ?? ''}
        type={snackbar?.type ?? 'success'}
        visible={snackbar !== null}
        onClose={() => setSnackbar(null)}
      />
    </>
  );
}
