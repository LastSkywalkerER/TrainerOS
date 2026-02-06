// Full-screen loader shown during database initialization and migration

interface UpdateLoaderProps {
  message: string;
}

export function UpdateLoader({ message }: UpdateLoaderProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white dark:bg-gray-900">
      {/* Spinner */}
      <div className="mb-6">
        <div className="w-12 h-12 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin" />
      </div>

      {/* App name */}
      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
        Trainer OS
      </h1>

      {/* Status message */}
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center px-8">
        {message}
      </p>
    </div>
  );
}
