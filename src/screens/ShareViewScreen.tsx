import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { decodeShareData } from '../utils/shareSession';
import { formatDate, formatTime } from '../utils/dateUtils';
import { calendarSessionService } from '../services/CalendarSessionService';
import { PERSONAL_NOTES_CLIENT_ID } from '../db/types';
import { Snackbar } from '../components/Snackbar';

export function ShareViewScreen() {
  const [searchParams] = useSearchParams();
  const encoded = searchParams.get('d');
  const [snackbar, setSnackbar] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [added, setAdded] = useState(false);

  const data = encoded ? decodeShareData(encoded) : null;

  async function handleAddToNotes() {
    if (!data) return;
    try {
      await calendarSessionService.createCustom(PERSONAL_NOTES_CLIENT_ID, {
        date: data.date,
        start_time: data.start_time,
        notes: data.notes || undefined,
      });
      setAdded(true);
      setSnackbar({ message: 'Добавлено', type: 'success' });
    } catch (e) {
      console.error('Failed to add to notes:', e);
      setSnackbar({ message: 'Ошибка', type: 'error' });
    }
  }

  if (!encoded) {
    return (
      <div className="p-4 min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center text-gray-500 dark:text-gray-400 py-12">
          Недействительная ссылка
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center text-gray-500 dark:text-gray-400 py-12">
          Недействительная ссылка
        </div>
      </div>
    );
  }

  const hasNotes = data.notes && data.notes.trim() !== '' && data.notes !== '<p></p>';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
          {data.client_name && (
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {data.client_name}
            </div>
          )}
          <div className="font-medium text-gray-900 dark:text-white mb-3">
            {formatDate(data.date)} в {formatTime(data.start_time)}
          </div>
          {hasNotes ? (
            <div
              className="tiptap ProseMirror text-sm text-gray-900 dark:text-white max-w-none select-text"
              style={{ minHeight: 'auto', padding: 0 }}
              dangerouslySetInnerHTML={{ __html: data.notes! }}
            />
          ) : (
            <div className="text-sm text-gray-400 dark:text-gray-500 italic">
              Нет заметок
            </div>
          )}
          <div className="mt-4">
            <button
              onClick={handleAddToNotes}
              disabled={added}
              className={`px-4 py-2 rounded-lg font-medium ${
                added
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {added ? 'Добавлено' : 'Добавить в заметки'}
            </button>
          </div>
        </div>
      </div>

      <Snackbar
        message={snackbar?.message ?? ''}
        type={snackbar?.type ?? 'success'}
        visible={snackbar !== null}
        onClose={() => setSnackbar(null)}
        autoHideDuration={2000}
      />
    </div>
  );
}
