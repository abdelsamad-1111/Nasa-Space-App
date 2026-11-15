import { AppProvider, useApp } from './state/AppState';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { SettingsScreen } from './components/SettingsScreen';
import { TwinScreen } from './components/twin/TwinScreen';
import { CheckIn } from './components/CheckIn';
import { ExerciseLog } from './components/ExerciseLog';
import { AlertsScreen } from './components/AlertsScreen';
import { SourcesScreen } from './components/SourcesScreen';
import { AssistantPanel } from './components/assistant/AssistantPanel';
import { ReportView } from './components/report/ReportView';

function Screens() {
  const { screen } = useApp();
  switch (screen) {
    case 'settings':
      return <SettingsScreen />;
    case 'alerts':
      return <AlertsScreen />;
    case 'sources':
      return <SourcesScreen />;
    default:
      return <TwinScreen />;
  }
}

function Shell() {
  const { screen } = useApp();
  if (screen === 'checkin' || screen === 'exercise') {
    return (
      <div className="app">
        {screen === 'checkin' ? <CheckIn /> : <ExerciseLog />}
      </div>
    );
  }
  return (
    <div className="app">
      <Header />
      <Screens />
      <Footer />
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
      {/* Mounted once so the comms log survives screen changes. */}
      <AssistantPanel />
      <ReportView />
    </AppProvider>
  );
}
