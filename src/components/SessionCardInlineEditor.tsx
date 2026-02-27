import { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { CalendarSession } from '../db/types';
import {
  calculateSessionStatusWithBalance,
  getEffectiveAllocatedAmount,
  calculateSessionPrice,
} from '../utils/calculations';
import { ConfirmDialog } from './ConfirmDialog';
import { Snackbar } from './Snackbar';
import { calendarSessionService } from '../services/CalendarSessionService';

interface SessionCardInlineEditorProps {
  session: CalendarSession;
  onNotesSaved: (updated: CalendarSession) => void;
  onCollapse: () => void;
  onCancel: () => void;
  onStatusLoaded?: (data: { sessionId: string; status: 'paid' | 'partially_paid' | 'unpaid'; allocated: number; price: number }) => void;
}

export function SessionCardInlineEditor({
  session,
  onNotesSaved,
  onCollapse,
  onCancel,
  onStatusLoaded,
}: SessionCardInlineEditorProps) {
  const [status, setStatus] = useState<'paid' | 'partially_paid' | 'unpaid'>('unpaid');
  const [allocated, setAllocated] = useState(0);
  const [price, setPrice] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showPriceEdit, setShowPriceEdit] = useState(false);
  const [priceOverride, setPriceOverride] = useState<number | undefined>(session.price_override);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const priceEditRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const onStatusLoadedRef = useRef(onStatusLoaded);
  onStatusLoadedRef.current = onStatusLoaded;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({
        placeholder: 'Добавьте комментарии, план тренировки или другие пометки...',
      }),
    ],
    content: session.notes || '',
    editorProps: { attributes: { class: 'focus:outline-none session-card-editor' } },
  });

  useEffect(() => {
    setPriceOverride(session.price_override);
  }, [session.price_override]);

  useEffect(() => {
    async function load() {
      const [s, a, p] = await Promise.all([
        calculateSessionStatusWithBalance(session.id, session.client_id),
        getEffectiveAllocatedAmount(session.id, session.client_id),
        calculateSessionPrice(session.client_id, session.id),
      ]);
      setStatus(s);
      setAllocated(a);
      setPrice(p);
      onStatusLoadedRef.current?.({ sessionId: session.id, status: s, allocated: a, price: p });
    }
    load();
  }, [session.id, session.client_id, session.price_override]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
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

  useEffect(() => {
    if (editor && session.notes !== undefined) {
      const current = editor.getHTML().replace(/<p><\/p>/g, '').trim();
      const next = (session.notes || '').replace(/<p><\/p>/g, '').trim();
      if (current !== next) editor.commands.setContent(session.notes || '');
    }
  }, [session.notes, session.id, editor]);

  useEffect(
    () => () => {
      if (editor) editor.destroy();
    },
    [editor]
  );

  async function handleSaveNotes() {
    if (!editor) return;
    setIsSavingNotes(true);
    try {
      const htmlContent = editor.getHTML();
      const updated = await calendarSessionService.update(session.id, {
        notes: htmlContent,
        price_override: priceOverride,
      });
      setSnackbar({ message: 'Пометки сохранены', type: 'success' });
      setTimeout(() => setSnackbar(null), 3000);
      onNotesSaved(updated);
      onCollapse();
    } catch {
      setSnackbar({ message: 'Ошибка при сохранении', type: 'error' });
      setTimeout(() => setSnackbar(null), 4000);
    } finally {
      setIsSavingNotes(false);
    }
  }

  return (
    <>
      <div className="space-y-1.5 w-full min-w-0">
        {/* Editor block - no extra wrappers, ProseMirror fills full width */}
        <div className="session-card-editor-wrapper relative w-full rounded-md bg-gray-50/50 dark:bg-gray-700/20 border border-gray-200/60 dark:border-gray-600/40 overflow-visible min-h-[80px] text-sm text-gray-900 dark:text-white focus-within:ring-1 focus-within:ring-inset focus-within:ring-blue-400 focus-within:rounded [&>div:first-child]:w-full [&>div:first-child]:min-h-[60px] [&_.ProseMirror]:!w-full [&_.ProseMirror]:min-h-[60px]">
          {editor ? (
            <EditorContent editor={editor} />
          ) : (
            <div className="text-gray-400 text-sm">Загрузка...</div>
          )}
          {/* Format button + floating toolbar - top-right of editor */}
          {editor && (
            <div ref={toolbarRef} className="absolute top-1 right-1 z-[1]">
              <button
                type="button"
                onClick={() => setShowToolbar((v) => !v)}
                className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  showToolbar ? 'bg-gray-100 dark:bg-gray-700' : ''
                }`}
                title="Форматирование"
              >
                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              </button>
              {showToolbar && (
            <div className="absolute top-0 right-full mr-1 flex gap-0.5 p-1 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 shadow-lg">
              <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Жирный">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6zM6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" /></svg>
              </button>
              <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Курсив">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
              </button>
              <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Список">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
              </button>
              <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="Нумерованный список">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
              </button>
            </div>
              )}
            </div>
          )}
          {/* Save button - absolute overlay, out of flow, doesn't affect editor height */}
          <button
            type="button"
            onClick={handleSaveNotes}
            disabled={isSavingNotes || !editor}
            className="absolute bottom-3 right-1.5 z-[1] p-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow"
            title="Сохранить"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
        {/* Price row - full width with save button */}
        <div ref={priceEditRef} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 w-full">
          {showPriceEdit ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceOverride ?? ''}
                onChange={(e) => setPriceOverride(e.target.value ? parseFloat(e.target.value) : undefined)}
                onBlur={() => setShowPriceEdit(false)}
                className="w-16 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                autoFocus
              />
              <span>BYN</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPriceEdit(true)}
              className="hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 -mx-1 transition-colors cursor-pointer flex items-center gap-1"
            >
              {price.toFixed(2)} BYN
              <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
          <span> / {allocated.toFixed(2)} BYN</span>
          {session.status === 'planned' && (
            <button
              onClick={() => {
                if (status === 'paid' || status === 'partially_paid') {
                  setShowCancelConfirm(true);
                } else {
                  onCancel();
                }
              }}
              className="ml-2 p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
              title="Отменить занятие"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showCancelConfirm && (
        <ConfirmDialog
          message="Занятие оплачено. Вы уверены, что хотите отменить его?"
          onConfirm={() => {
            setShowCancelConfirm(false);
            onCancel();
          }}
          onCancel={() => setShowCancelConfirm(false)}
          confirmText="Отменить занятие"
          cancelText="Нет"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
        />
      )}

      <Snackbar message={snackbar?.message ?? ''} type={snackbar?.type ?? 'success'} visible={snackbar !== null} onClose={() => setSnackbar(null)} />
    </>
  );
}
