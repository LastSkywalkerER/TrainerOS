import { useState } from 'react';
import { toISODate } from '../utils/dateUtils';

interface PauseDialogProps {
  onSave: (pauseFrom: Date, pauseTo: Date) => void;
  onCancel: () => void;
  initialPauseFrom?: Date;
  initialPauseTo?: Date;
}

export function PauseDialog({ onSave, onCancel, initialPauseFrom, initialPauseTo }: PauseDialogProps) {
  const today = new Date();
  const [formData, setFormData] = useState({
    pause_from: initialPauseFrom ? toISODate(initialPauseFrom) : toISODate(today),
    pause_to: initialPauseTo ? toISODate(initialPauseTo) : toISODate(today),
  });
  const [error, setError] = useState<string>('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const pauseFrom = new Date(formData.pause_from);
    const pauseTo = new Date(formData.pause_to);

    if (pauseTo < pauseFrom) {
      setError('Дата окончания должна быть не раньше даты начала');
      return;
    }

    onSave(pauseFrom, pauseTo);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
          Поставить на паузу
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Дата начала паузы *
            </label>
            <input
              type="date"
              required
              value={formData.pause_from}
              onChange={(e) => setFormData({ ...formData, pause_from: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Дата окончания паузы *
            </label>
            <input
              type="date"
              required
              value={formData.pause_to}
              onChange={(e) => setFormData({ ...formData, pause_to: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {error && (
            <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
          )}

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
              className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
