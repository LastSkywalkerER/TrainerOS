import { useState } from 'react';
import { Client, CreatePaymentDto, Payment, PaymentMethod } from '../db/types';
import { toISODate } from '../utils/dateUtils';

interface PaymentFormProps {
  clients: Client[];
  payment?: Payment;
  onSave: (data: CreatePaymentDto & { client_id: string; autoAllocate: boolean }) => void;
  onCancel: () => void;
}

export function PaymentForm({ clients, payment, onSave, onCancel }: PaymentFormProps) {
  const now = new Date();
  const [formData, setFormData] = useState({
    client_id: payment?.client_id || '',
    paid_at: payment ? toISODate(payment.paid_at) : toISODate(now),
    paid_time: payment ? payment.paid_at.toTimeString().slice(0, 5) : now.toTimeString().slice(0, 5),
    amount: payment?.amount || 0,
    method: (payment?.method || 'cash') as PaymentMethod,
    comment: payment?.comment || '',
    autoAllocate: true,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.client_id) {
      alert('Выберите клиента');
      return;
    }
    if (formData.amount <= 0) {
      alert('Сумма должна быть больше нуля');
      return;
    }

    const [hours, minutes] = formData.paid_time.split(':').map(Number);
    const paidAt = new Date(formData.paid_at);
    paidAt.setHours(hours, minutes, 0, 0);

    onSave({
      client_id: formData.client_id,
      paid_at: paidAt,
      amount: formData.amount,
      method: formData.method,
      comment: formData.comment,
      autoAllocate: formData.autoAllocate,
    });
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
          {payment ? 'Редактировать платёж' : 'Новый платёж'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Клиент *
            </label>
            <select
              required
              value={formData.client_id}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Выберите клиента</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Дата *
            </label>
            <input
              type="date"
              required
              value={formData.paid_at}
              onChange={(e) => setFormData({ ...formData, paid_at: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Время *
            </label>
            <input
              type="time"
              required
              value={formData.paid_time}
              onChange={(e) => setFormData({ ...formData, paid_time: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Сумма (BYN) *
            </label>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Метод оплаты *
            </label>
            <select
              required
              value={formData.method}
              onChange={(e) => setFormData({ ...formData, method: e.target.value as PaymentMethod })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="cash">Наличные</option>
              <option value="card">Карта</option>
              <option value="transfer">Перевод</option>
              <option value="other">Другое</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Комментарий
            </label>
            <textarea
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="autoAllocate"
              checked={formData.autoAllocate}
              onChange={(e) => setFormData({ ...formData, autoAllocate: e.target.checked })}
              className="mr-2"
            />
            <label htmlFor="autoAllocate" className="text-sm text-gray-700 dark:text-gray-300">
              Автоматически распределить на неоплаченные занятия
            </label>
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
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
