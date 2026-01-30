import { Payment, Client } from '../db/types';
import { formatDateTime } from '../utils/dateUtils';

interface PaymentDetailsProps {
  payment: Payment;
  client: Client | undefined;
  onClose: () => void;
}

export function PaymentDetails({ payment, client, onClose }: PaymentDetailsProps) {
  const methodLabels = {
    cash: 'Наличные',
    card: 'Карта',
    transfer: 'Перевод',
    other: 'Другое',
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Платёж</h2>
          <button onClick={onClose} className="text-gray-500 dark:text-gray-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Клиент</div>
            <div className="font-semibold text-gray-900 dark:text-white">{client?.full_name || 'Неизвестно'}</div>
          </div>

          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Дата и время</div>
            <div className="font-semibold text-gray-900 dark:text-white">{formatDateTime(payment.paid_at)}</div>
          </div>

          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Сумма</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {payment.amount.toFixed(2)} BYN
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Метод оплаты</div>
            <div className="font-semibold text-gray-900 dark:text-white">
              {methodLabels[payment.method]}
            </div>
          </div>

          {payment.comment && (
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Комментарий</div>
              <div className="text-gray-900 dark:text-white whitespace-pre-wrap">{payment.comment}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
