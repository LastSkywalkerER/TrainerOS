import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ClientsScreen } from './screens/ClientsScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { PaymentsScreen } from './screens/PaymentsScreen';
import { SummaryScreen } from './screens/SummaryScreen';
import { runMigrations } from './db/migrations';
import { TutorialProvider, useTutorial } from './contexts/TutorialContext';
import { ClientProfile } from './components/ClientProfile';
import { ClientForm } from './components/ClientForm';
import { clientService } from './services/ClientService';
import { Client } from './db/types';
import { tutorialService } from './services/TutorialService';

function NavigationBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = location.pathname.split('/')[1] || 'clients';

  return (
    <nav id="tutorial-nav" data-tutorial-id="tutorial-nav" className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <div className="grid grid-cols-4 h-16">
        <button
          onClick={() => navigate('/clients')}
          className={`flex flex-col items-center justify-center ${
            activeTab === 'clients'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-xs">Клиенты</span>
        </button>
        <button
          onClick={() => navigate('/calendar')}
          className={`flex flex-col items-center justify-center ${
            activeTab === 'calendar'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs">Календарь</span>
        </button>
        <button
          onClick={() => navigate('/payments')}
          className={`flex flex-col items-center justify-center ${
            activeTab === 'payments'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-xs">Платежи</span>
        </button>
        <button
          onClick={() => navigate('/summary')}
          className={`flex flex-col items-center justify-center ${
            activeTab === 'summary'
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-xs">Итоги</span>
        </button>
      </div>
    </nav>
  );
}

function ClientProfileRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  // Get initialTab from URL params
  const searchParams = new URLSearchParams(location.search);
  const initialTab = (searchParams.get('tab') as 'info' | 'schedule' | 'payments' | 'stats' | null) || undefined;

  useEffect(() => {
    if (id) {
      clientService.getById(id).then((clientData) => {
        setClient(clientData);
        setLoading(false);
      });
    }
  }, [id]);

  if (loading) {
    return <div className="p-4">Загрузка...</div>;
  }

  if (!client) {
    return <Navigate to="/clients" replace />;
  }

  return (
    <ClientProfile
      client={client}
      onBack={() => navigate('/clients')}
      onEdit={() => navigate(`/clients/${id}/edit`)}
      onStatusChange={async () => {
        const updated = await clientService.getById(id!);
        if (updated) {
          setClient(updated);
        }
      }}
      initialTab={initialTab}
      showTutorialOnMount={!tutorialService.isCompleted('client-profile' as any)}
    />
  );
}

function ClientEditRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      clientService.getById(id).then((clientData) => {
        setClient(clientData);
        setLoading(false);
      });
    }
  }, [id]);

  if (loading) {
    return <div className="p-4">Загрузка...</div>;
  }

  if (!client) {
    return <Navigate to="/clients" replace />;
  }

  return (
    <ClientForm
      client={client}
      onSave={async (data) => {
        await clientService.update(client.id, data);
        navigate(`/clients/${client.id}`);
      }}
      onCancel={() => navigate(`/clients/${client.id}`)}
    />
  );
}

function HelpButton() {
  const location = useLocation();
  const { triggerTutorial } = useTutorial();

  const handleClick = () => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    let page = pathParts[0] || 'clients';
    
    // If we're on /clients/:id, treat it as client-profile
    if (pathParts[0] === 'clients' && pathParts[1] && pathParts[1] !== 'edit') {
      page = 'client-profile';
    }
    
    triggerTutorial(page);
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-24 left-4 w-10 h-10 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors z-40"
      title="Показать подсказки"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </button>
  );
}

function AppContent() {
  useEffect(() => {
    runMigrations();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Main Content */}
      <main className="pb-20">
        <Routes>
          <Route path="/" element={<Navigate to="/clients" replace />} />
          <Route path="/clients" element={<ClientsScreen />} />
          <Route path="/clients/:id" element={<ClientProfileRoute />} />
          <Route path="/clients/:id/edit" element={<ClientEditRoute />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/payments" element={<PaymentsScreen />} />
          <Route path="/summary" element={<SummaryScreen />} />
        </Routes>
      </main>

      <NavigationBar />
      <HelpButton />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <TutorialProvider>
        <AppContent />
      </TutorialProvider>
    </BrowserRouter>
  );
}

export default App;
