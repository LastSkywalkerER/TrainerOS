// Notification banner shown when a new app version is available

import { applyUpdate } from '../pwa/register-sw';

interface UpdatePromptProps {
  visible: boolean;
  onDismiss: () => void;
}

export function UpdatePrompt({ visible, onDismiss }: UpdatePromptProps) {
  if (!visible) return null;

  function handleUpdate() {
    applyUpdate();
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[9998] p-3 bg-blue-600 text-white shadow-lg animate-slide-down">
      <div className="flex items-center justify-between max-w-lg mx-auto">
        <p className="text-sm font-medium">
          Доступна новая версия приложения
        </p>
        <div className="flex gap-2 ml-4 shrink-0">
          <button
            onClick={onDismiss}
            className="px-3 py-1 text-xs rounded bg-blue-700 hover:bg-blue-800 transition-colors"
          >
            Позже
          </button>
          <button
            onClick={handleUpdate}
            className="px-3 py-1 text-xs rounded bg-white text-blue-600 font-medium hover:bg-blue-50 transition-colors"
          >
            Обновить
          </button>
        </div>
      </div>
    </div>
  );
}
