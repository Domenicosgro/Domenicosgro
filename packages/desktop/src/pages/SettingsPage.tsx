import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Folder } from 'lucide-react';

interface Settings {
  supabaseUrl: string;
  supabaseAnonKey: string;
  anthropicApiKey: string;
  watchFolders: string[];
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    supabaseUrl: '',
    supabaseAnonKey: '',
    anthropicApiKey: '',
    watchFolders: [],
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.electron?.getSettings().then((s) => {
      if (s) setSettings(s as Settings);
    });
  }, []);

  const handleSave = async () => {
    await window.electron?.setSettings({
      supabaseUrl: settings.supabaseUrl,
      supabaseAnonKey: settings.supabaseAnonKey,
      anthropicApiKey: settings.anthropicApiKey,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddFolder = async () => {
    const folder = await window.electron?.openFolder();
    if (!folder) return;
    const updated = await window.electron?.addWatchFolder(folder);
    if (updated) setSettings((s) => ({ ...s, watchFolders: updated }));
  };

  const handleRemoveFolder = async (path: string) => {
    const updated = await window.electron?.removeWatchFolder(path);
    if (updated) setSettings((s) => ({ ...s, watchFolders: updated }));
  };

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-xl font-bold text-white">Einstellungen</h1>

      {/* API credentials */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Verbindung
        </h2>

        <label className="block space-y-1">
          <span className="text-sm text-slate-300">Supabase URL</span>
          <input
            type="url"
            value={settings.supabaseUrl}
            onChange={(e) => setSettings((s) => ({ ...s, supabaseUrl: e.target.value }))}
            placeholder="https://xxxx.supabase.co"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-300">Supabase Anon Key</span>
          <input
            type="password"
            value={settings.supabaseAnonKey}
            onChange={(e) => setSettings((s) => ({ ...s, supabaseAnonKey: e.target.value }))}
            placeholder="eyJ…"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-slate-300">Anthropic API Key</span>
          <input
            type="password"
            value={settings.anthropicApiKey}
            onChange={(e) => setSettings((s) => ({ ...s, anthropicApiKey: e.target.value }))}
            placeholder="sk-ant-…"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
        >
          <Save className="w-4 h-4" />
          {saved ? 'Gespeichert ✓' : 'Speichern'}
        </button>
      </section>

      {/* Folder watcher */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          Ordner-Überwachung
        </h2>
        <p className="text-sm text-slate-500">
          Neue PDF- und Bilddateien in diesen Ordnern werden automatisch importiert.
        </p>

        <div className="space-y-2">
          {settings.watchFolders.map((folder) => (
            <div
              key={folder}
              className="flex items-center gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700"
            >
              <Folder className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <span className="flex-1 text-sm text-slate-300 truncate">{folder}</span>
              <button
                onClick={() => handleRemoveFolder(folder)}
                className="p-1 text-slate-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleAddFolder}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-600 hover:border-slate-500 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ordner hinzufügen
        </button>
      </section>
    </div>
  );
}
