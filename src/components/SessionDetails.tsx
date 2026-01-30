import { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { CalendarSession, Client } from '../db/types';
import { formatDate, formatTime } from '../utils/dateUtils';
import { calculateSessionStatusWithBalance, getEffectiveAllocatedAmount, calculateSessionPrice } from '../utils/calculations';
import { ConfirmDialog } from './ConfirmDialog';
import { Snackbar } from './Snackbar';
import { calendarSessionService } from '../services/CalendarSessionService';

interface SessionDetailsProps {
  session: CalendarSession;
  client: Client | undefined;
  onClose: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onNotesSaved?: (updatedSession: CalendarSession) => void;
}

type Tab = 'notes' | 'details';

export function SessionDetails({
  session,
  client,
  onClose,
  onEdit,
  onCancel,
  onNotesSaved,
}: SessionDetailsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('notes');
  const [status, setStatus] = useState<'paid' | 'partially_paid' | 'unpaid'>('unpaid');
  const [allocated, setAllocated] = useState(0);
  const [price, setPrice] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: 'Добавьте комментарии, план тренировки или другие пометки...',
      }),
    ],
    content: session.notes || '',
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
      },
    },
    onUpdate: () => {
      // Content is updated automatically via editor.getHTML() when saving
    },
  });

  useEffect(() => {
    loadStatus();
  }, [session.id]);

  useEffect(() => {
    if (editor) {
      const currentContent = editor.getHTML();
      const newContent = session.notes || '';
      // Only update if content actually changed to avoid unnecessary updates
      // Check if content is different (excluding empty paragraph tags)
      const normalizedCurrent = currentContent.replace(/<p><\/p>/g, '').trim();
      const normalizedNew = newContent.replace(/<p><\/p>/g, '').trim();
      if (normalizedCurrent !== normalizedNew) {
        editor.commands.setContent(newContent);
      }
    }
  }, [session.notes, session.id, editor]);

  // Cleanup editor on unmount
  useEffect(() => {
    return () => {
      if (editor) {
        editor.destroy();
      }
    };
  }, [editor]);

  async function loadStatus() {
    const [sessionStatus, effectiveAllocated, sessionPrice] = await Promise.all([
      calculateSessionStatusWithBalance(session.id, session.client_id),
      getEffectiveAllocatedAmount(session.id, session.client_id),
      calculateSessionPrice(session.client_id, session.id),
    ]);
    setStatus(sessionStatus);
    setAllocated(effectiveAllocated);
    setPrice(sessionPrice);
  }

  async function handleSaveNotes() {
    if (!editor) {
      console.error('Editor is not initialized');
      return;
    }
    
    setIsSavingNotes(true);
    try {
      const htmlContent = editor.getHTML();
      const updatedSession = await calendarSessionService.update(session.id, { notes: htmlContent });
      
      // Show success snackbar
      setSnackbar({ message: 'Пометки успешно сохранены', type: 'success' });
      setTimeout(() => {
        setSnackbar(null);
      }, 3000);
      
      // Notify parent component to update session data
      if (onNotesSaved) {
        onNotesSaved(updatedSession);
      }
    } catch (error) {
      console.error('Failed to save notes:', error);
      setSnackbar({ message: 'Ошибка при сохранении пометок. Попробуйте еще раз.', type: 'error' });
      setTimeout(() => {
        setSnackbar(null);
      }, 4000);
    } finally {
      setIsSavingNotes(false);
    }
  }

  const statusColors = {
    paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    partially_paid: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    unpaid: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  const statusLabels = {
    paid: 'Оплачено',
    partially_paid: 'Частично оплачено',
    unpaid: 'Не оплачено',
  };


  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Занятие</h2>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'notes'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Пометки
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 font-medium text-sm ${
              activeTab === 'details'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Детали
          </button>
        </div>

        {/* Notes Tab */}
        {activeTab === 'notes' && (
          <div className="space-y-4">
            <div>
              {/* Toolbar */}
              {editor && (
                <div className="flex flex-wrap gap-1 p-2 bg-gray-100 dark:bg-gray-700 rounded-t-lg border border-gray-200 dark:border-gray-600 border-b-0">
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    disabled={!editor.can().chain().focus().toggleBold().run()}
                    className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                      editor.isActive('bold') ? 'bg-gray-300 dark:bg-gray-500' : ''
                    }`}
                    title="Жирный"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    disabled={!editor.can().chain().focus().toggleItalic().run()}
                    className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                      editor.isActive('italic') ? 'bg-gray-300 dark:bg-gray-500' : ''
                    }`}
                    title="Курсив"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    disabled={!editor.can().chain().focus().toggleStrike().run()}
                    className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                      editor.isActive('strike') ? 'bg-gray-300 dark:bg-gray-500' : ''
                    }`}
                    title="Зачеркнутый"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
                    </svg>
                  </button>
                  <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                      editor.isActive('heading', { level: 1 }) ? 'bg-gray-300 dark:bg-gray-500' : ''
                    }`}
                    title="Заголовок 1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                      editor.isActive('heading', { level: 2 }) ? 'bg-gray-300 dark:bg-gray-500' : ''
                    }`}
                    title="Заголовок 2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                  </button>
                  <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                      editor.isActive('bulletList') ? 'bg-gray-300 dark:bg-gray-500' : ''
                    }`}
                    title="Маркированный список"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={`p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${
                      editor.isActive('orderedList') ? 'bg-gray-300 dark:bg-gray-500' : ''
                    }`}
                    title="Нумерованный список"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    </svg>
                  </button>
                  <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().chain().focus().undo().run()}
                    className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="Отменить"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={!editor.can().chain().focus().redo().run()}
                    className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="Повторить"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Editor */}
              <div className="border border-gray-200 dark:border-gray-600 rounded-b-lg bg-white dark:bg-gray-800 min-h-[200px]">
                {editor ? (
                  <EditorContent editor={editor} />
                ) : (
                  <div className="p-4 text-gray-400">Загрузка редактора...</div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSaveNotes();
              }}
              disabled={isSavingNotes || !editor}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSavingNotes ? 'Сохранение...' : 'Сохранить пометки'}
            </button>
          </div>
        )}

        {/* Details Tab */}
        {activeTab === 'details' && (
        <div className="space-y-4">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Клиент</div>
            <div className="font-semibold text-gray-900 dark:text-white">{client?.full_name || 'Неизвестно'}</div>
          </div>

          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Дата и время</div>
            <div className="font-semibold text-gray-900 dark:text-white">
              {formatDate(session.date)} в {formatTime(session.start_time)}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Статус оплаты</div>
            <span className={`px-3 py-1 rounded text-sm ${statusColors[status]}`}>
              {statusLabels[status]}
            </span>
          </div>

          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Цена / Оплачено</div>
            <div className="font-semibold text-gray-900 dark:text-white">
              {price.toFixed(2)} BYN / {allocated.toFixed(2)} BYN
            </div>
            {allocated < price && (
              <div className="text-sm text-red-600 dark:text-red-400">
                Остаток: {(price - allocated).toFixed(2)} BYN
              </div>
            )}
          </div>

          {/* Warning for paid sessions */}
          {(status === 'paid' || status === 'partially_paid') && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                ⚠️ Это занятие уже оплачено. При изменении оплата останется привязанной к занятию. При отмене оплата будет освобождена и сможет быть перераспределена на другие занятия.
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            {session.status === 'planned' && (
              <>
                <button
                  onClick={onEdit}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Редактировать
                </button>
                <button
                  onClick={() => {
                    if (status === 'paid' || status === 'partially_paid') {
                      setShowCancelConfirm(true);
                    } else {
                      onCancel();
                    }
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Отменить
                </button>
              </>
            )}
          </div>
        </div>
        )}
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
