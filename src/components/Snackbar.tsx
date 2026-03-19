import { useEffect } from 'react';

export type SnackbarType = 'success' | 'error' | 'info';

interface SnackbarProps {
  message: string;
  type?: SnackbarType;
  visible: boolean;
  onClose: () => void;
  /** Auto-close after ms. If 0 or undefined, no auto-close. */
  autoHideDuration?: number;
}

const typeStyles: Record<SnackbarType, { container: string; icon: string; text: string; IconSvg: React.ReactNode }> = {
  success: {
    container: 'bg-green-50/95 dark:bg-green-900/80 border border-green-200/50 dark:border-green-800/50',
    icon: 'bg-green-500/20 dark:bg-green-400/20',
    text: 'text-green-700 dark:text-green-300',
    IconSvg: (
      <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  error: {
    container: 'bg-red-50/95 dark:bg-red-900/80 border border-red-200/50 dark:border-red-800/50',
    icon: 'bg-red-500/20 dark:bg-red-400/20',
    text: 'text-red-700 dark:text-red-300',
    IconSvg: (
      <svg className="w-3.5 h-3.5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
  info: {
    container: 'bg-gray-800 dark:bg-gray-700 border border-gray-700 dark:border-gray-600',
    icon: 'bg-gray-600/30 dark:bg-gray-500/30',
    text: 'text-white',
    IconSvg: (
      <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

export function Snackbar({ message, type = 'info', visible, onClose, autoHideDuration }: SnackbarProps) {
  useEffect(() => {
    if (!visible || !autoHideDuration) return;
    const timer = setTimeout(onClose, autoHideDuration);
    return () => clearTimeout(timer);
  }, [visible, autoHideDuration, onClose]);

  if (!visible) return null;

  const styles = typeStyles[type];

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 animate-[slideUp_0.3s_ease-out]">
      <div
        className={`shadow-xl rounded-lg px-4 py-3 min-w-[200px] flex items-center gap-3 backdrop-blur-sm ${styles.container}`}
      >
        <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${styles.icon}`}>
          {styles.IconSvg}
        </div>
        <div className={`flex-1 text-sm font-medium ${styles.text}`}>{message}</div>
        <button
          onClick={onClose}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 -mr-1"
          aria-label="Закрыть"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
