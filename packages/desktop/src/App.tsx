import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { DocumentsPage } from './pages/DocumentsPage';
import { DeadlinesPage } from './pages/DeadlinesPage';
import { SettingsPage } from './pages/SettingsPage';
import { useDocumentStore } from './store/documentStore';

export default function App() {
  const { loadDocuments } = useDocumentStore();

  useEffect(() => {
    loadDocuments();

    // Listen for folder-watcher file additions
    const cleanup = window.electron?.onFileAdded((filePath) => {
      useDocumentStore.getState().importFile(filePath);
    });

    return () => cleanup?.();
  }, [loadDocuments]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/documents" replace />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/deadlines" element={<DeadlinesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
