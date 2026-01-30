import { useState, useEffect } from 'react';
import { Client } from '../db/types';
import { clientService } from '../services/ClientService';
import { ClientCard } from '../components/ClientCard';
import { ClientForm } from '../components/ClientForm';
import { ClientProfile } from '../components/ClientProfile';

export function ClientsScreen() {
  const [clients, setClients] = useState<Client[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  useEffect(() => {
    loadClients();
  }, [filter]);

  async function loadClients() {
    const allClients = await clientService.getAll(
      filter === 'all' ? undefined : { status: filter }
    );
    setClients(allClients);
  }

  const filteredClients = clients
    .filter((client) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        client.full_name.toLowerCase().includes(query) ||
        client.phone?.toLowerCase().includes(query) ||
        client.telegram?.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      // Sort by start_date: oldest first (ascending)
      const dateA = a.start_date instanceof Date ? a.start_date.getTime() : new Date(a.start_date || 0).getTime();
      const dateB = b.start_date instanceof Date ? b.start_date.getTime() : new Date(b.start_date || 0).getTime();
      return dateA - dateB;
    });

  async function handleCreate(clientData: any) {
    await clientService.create(clientData);
    setShowForm(false);
    await loadClients();
  }

  async function handleUpdate(id: string, updates: Partial<Client>) {
    await clientService.update(id, updates);
    const wasEditingFromProfile = selectedClient?.id === id;
    setEditingClient(null);
    if (wasEditingFromProfile) {
      const updated = await clientService.getById(id);
      setSelectedClient(updated);
    }
    await loadClients();
  }

  // Check editingClient first, so edit form shows even when selectedClient is set
  if (editingClient) {
    return (
      <ClientForm
        client={editingClient}
        onSave={(data) => handleUpdate(editingClient.id, data)}
        onCancel={() => {
          setEditingClient(null);
          // If we were editing from profile, go back to profile
          if (selectedClient?.id === editingClient.id) {
            // Keep selectedClient, just clear editingClient
          } else {
            setSelectedClient(null);
          }
        }}
      />
    );
  }

  if (selectedClient) {
    return (
      <ClientProfile
        client={selectedClient}
        onBack={() => setSelectedClient(null)}
        onEdit={() => setEditingClient(selectedClient)}
        onStatusChange={async () => {
          // Reload client data after status change
          const updated = await clientService.getById(selectedClient.id);
          if (updated) {
            setSelectedClient(updated);
          }
          await loadClients();
        }}
      />
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Клиенты</h1>

      {/* Search */}
      <input
        type="text"
        placeholder="Поиск по имени, телефону..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full mb-4 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      />

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {(['all', 'active', 'paused', 'archived'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {f === 'all' ? 'Все' : f === 'active' ? 'Активные' : f === 'paused' ? 'На паузе' : 'Архив'}
          </button>
        ))}
      </div>

      {/* Client List */}
      <div className="space-y-3">
        {filteredClients.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            onClick={() => setSelectedClient(client)}
            onEdit={() => setEditingClient(client)}
          />
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

      {/* Create Form */}
      {showForm && (
        <ClientForm
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
