import { useState, useEffect } from 'react';
import { Payment, Client, CreatePaymentDto } from '../db/types';
import { paymentService } from '../services/PaymentService';
import { clientService } from '../services/ClientService';
import { formatDate } from '../utils/dateUtils';
import { PaymentForm } from '../components/PaymentForm';
import { PaymentDetails } from '../components/PaymentDetails';

export function PaymentsScreen() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [filterClientId, setFilterClientId] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [allPayments, allClients] = await Promise.all([
      paymentService.getAll(),
      clientService.getAll(),
    ]);
    setPayments(allPayments);
    setClients(allClients);
  }

  const filteredPayments = payments.filter((p) => {
    if (filterClientId && p.client_id !== filterClientId) return false;
    return true;
  });

  // Group by date
  const groupedPayments = filteredPayments.reduce((acc, payment) => {
    const dateKey = formatDate(payment.paid_at);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(payment);
    return acc;
  }, {} as Record<string, Payment[]>);

  async function handleCreate(
    paymentData: CreatePaymentDto & { client_id: string; autoAllocate: boolean }
  ) {
    const payment = await paymentService.create(paymentData.client_id, paymentData);
    if (paymentData.autoAllocate) {
      await paymentService.autoAllocate(payment.id);
    }
    setShowForm(false);
    await loadData();
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Платежи</h1>

      {/* Filter */}
      <select
        value={filterClientId}
        onChange={(e) => setFilterClientId(e.target.value)}
        className="w-full mb-4 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      >
        <option value="">Все клиенты</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.full_name}
          </option>
        ))}
      </select>

      {/* Payments List */}
      <div className="space-y-4">
        {Object.entries(groupedPayments).map(([date, datePayments]) => (
          <div key={date}>
            <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">{date}</h2>
            <div className="space-y-2">
              {datePayments.map((payment) => {
                const client = clients.find((c) => c.id === payment.client_id);
                return (
                  <div
                    key={payment.id}
                    onClick={() => setSelectedPayment(payment)}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">
                          {client?.full_name || 'Неизвестно'}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {payment.paid_at.toTimeString().slice(0, 5)} • {payment.method === 'cash' ? 'Наличные' : payment.method === 'card' ? 'Карта' : payment.method === 'transfer' ? 'Перевод' : 'Другое'}
                        </div>
                      </div>
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        {payment.amount.toFixed(2)} BYN
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* FAB */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed bottom-24 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      {/* Payment Form */}
      {showForm && (
        <PaymentForm
          clients={clients}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Payment Details */}
      {selectedPayment && (
        <PaymentDetails
          payment={selectedPayment}
          client={clients.find((c) => c.id === selectedPayment.client_id)}
          onClose={() => setSelectedPayment(null)}
        />
      )}
    </div>
  );
}
