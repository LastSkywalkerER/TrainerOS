interface SnackbarProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
  visible: boolean;
}

export function Snackbar({ message, type, onClose, visible }: SnackbarProps) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-[slideUp_0.3s_ease-out]">
      <div
        className={`shadow-xl rounded-lg px-4 py-3 min-w-[280px] max-w-md flex items-center gap-3 backdrop-blur-sm ${
          type === 'success'
            ? 'bg-green-50/95 dark:bg-green-900/80 border border-green-200/50 dark:border-green-800/50'
            : 'bg-red-50/95 dark:bg-red-900/80 border border-red-200/50 dark:border-red-800/50'
        }`}
      >
        {type === 'success' ? (
          <>
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 dark:bg-green-400/20 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="flex-1 text-sm font-medium text-green-700 dark:text-green-300">
              {message}
            </div>
          </>
        ) : (
          <>
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500/20 dark:bg-red-400/20 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="flex-1 text-sm font-medium text-red-700 dark:text-red-300">
              {message}
            </div>
          </>
        )}
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
