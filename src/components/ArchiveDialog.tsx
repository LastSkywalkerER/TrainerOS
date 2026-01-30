import { useState } from 'react';
import { toISODate } from '../utils/dateUtils';

interface ArchiveDialogProps {
  onSave: (archiveDate: Date) => void;
  onCancel: () => void;
  initialArchiveDate?: Date;
}

export function ArchiveDialog({ onSave, onCancel, initialArchiveDate }: ArchiveDialogProps) {
  const today = new Date();
  const [archiveDate, setArchiveDate] = useState(
    initialArchiveDate ? toISODate(initialArchiveDate) : toISODate(today)
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const date = new Date(archiveDate);
    onSave(date);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
          Переместить в архив
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Дата архивирования *
            </label>
            <input
              type="date"
              required
              value={archiveDate}
              onChange={(e) => setArchiveDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              С этой даты расписание клиента будет очищено
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Архивировать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
