import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Client } from '../db/types';
import { clientService } from '../services/ClientService';
import { ClientCard } from '../components/ClientCard';
import { ClientForm } from '../components/ClientForm';
import { TutorialGuide, TutorialStep } from '../components/TutorialGuide';
import { tutorialService } from '../services/TutorialService';
import { useTutorial } from '../contexts/TutorialContext';

export function ClientsScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const { getTriggeredPage, clearTrigger } = useTutorial();
  const [clients, setClients] = useState<Client[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const tutorialSteps: TutorialStep[] = [
    {
      target: '#tutorial-search',
      title: 'Поиск клиентов',
      description: 'Используйте поиск для быстрого нахождения клиентов по имени, телефону или Telegram.',
      position: 'bottom',
    },
    {
      target: '#tutorial-filters',
      title: 'Фильтры',
      description: 'Фильтруйте клиентов по статусу: все, активные, на паузе или архив.',
      position: 'bottom',
    },
    {
      target: '#tutorial-fab',
      title: 'Добавление клиента',
      description: 'Нажмите эту кнопку для добавления нового клиента.',
      position: 'top',
    },
    {
      target: '#tutorial-nav',
      title: 'Навигация',
      description: 'Переключайтесь между разделами приложения: Клиенты, Календарь, Платежи и Итоги.',
      position: 'top',
    },
  ];

  useEffect(() => {
    loadClients();
  }, [filter]);

  // Check if tutorial should be shown
  useEffect(() => {
    if (editingClient || showForm) {
      return;
    }

    const triggeredPage = getTriggeredPage();
    if (triggeredPage === 'clients') {
      setShowTutorial(true);
      clearTrigger();
      return;
    }

    // Check if tutorial was completed
    if (!tutorialService.isCompleted('clients')) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        setShowTutorial(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [editingClient, showForm, getTriggeredPage, clearTrigger]);

  // Handle navigation from other screens (e.g., SummaryScreen)
  useEffect(() => {
    const state = location.state as { clientId?: string; openTab?: 'info' | 'schedule' | 'payments' | 'stats' } | null;
    if (state?.clientId) {
      const tabParam = state.openTab ? `?tab=${state.openTab}` : '';
      navigate(`/clients/${state.clientId}${tabParam}`, { replace: true });
    }
  }, [location.state, navigate]);

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

  // Check editingClient first (for editing from list)
  if (editingClient) {
    return (
      <ClientForm
        client={editingClient}
        onSave={async (data) => {
          await clientService.update(editingClient.id, data);
          setEditingClient(null);
          await loadClients();
        }}
        onCancel={() => {
          setEditingClient(null);
        }}
      />
    );
  }

  const handleTutorialComplete = () => {
    setShowTutorial(false);
    tutorialService.markCompleted('clients');
  };

  const handleTutorialSkip = () => {
    setShowTutorial(false);
    tutorialService.markCompleted('clients');
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Клиенты</h1>

      {/* Search */}
      <input
        id="tutorial-search"
        data-tutorial-id="tutorial-search"
        type="text"
        placeholder="Поиск по имени, телефону..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full mb-4 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      />

      {/* Filters */}
      <div id="tutorial-filters" data-tutorial-id="tutorial-filters" className="flex gap-2 mb-4 overflow-x-auto">
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
            onClick={() => navigate(`/clients/${client.id}`)}
            onEdit={() => navigate(`/clients/${client.id}/edit`)}
          />
        ))}
      </div>

      {/* FAB */}
      {!showForm && (
        <button
          id="tutorial-fab"
          data-tutorial-id="tutorial-fab"
          onClick={() => setShowForm(true)}
          className="fixed bottom-24 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}

      {/* Tutorial Guide */}
      <TutorialGuide
        steps={tutorialSteps}
        isActive={showTutorial && !editingClient && !showForm}
        onComplete={handleTutorialComplete}
        onSkip={handleTutorialSkip}
      />

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
