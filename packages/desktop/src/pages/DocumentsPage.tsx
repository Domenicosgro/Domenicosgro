import { useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { DropZone } from '../components/DropZone';
import { DocumentCard } from '../components/DocumentCard';
import { useDocumentStore } from '../store/documentStore';
import { getSupabaseClient } from '@dokuvault/shared';
import type { Document } from '@dokuvault/shared';

export function DocumentsPage() {
  const { documents, isLoading, loadDocuments } = useDocumentStore();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Document[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      const settings = await window.electron?.getSettings();
      if (!settings?.supabaseUrl) return;

      const client = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey);
      const { data: profile } = await client
        .from('profiles')
        .select('family_id')
        .eq('id', (await client.auth.getUser()).data.user?.id ?? '')
        .single();

      if (!profile) return;

      const { data } = await client.rpc('search_documents', {
        query_text: query,
        p_family_id: profile.family_id,
      });

      setSearchResults((data ?? []) as unknown as Document[]);
    } finally {
      setIsSearching(false);
    }
  };

  const displayed = searchResults ?? documents;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Dokumente</h1>
        <button
          onClick={loadDocuments}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          title="Neu laden"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) setSearchResults(null);
            }}
            placeholder="Volltextsuche in Dokumenten…"
            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {isSearching && (
            <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
          )}
        </div>
      </form>

      {/* Drop zone */}
      <DropZone />

      {/* Document list */}
      <div className="space-y-2">
        {displayed.length === 0 && !isLoading ? (
          <p className="text-center text-slate-500 py-8">
            {searchResults !== null ? 'Keine Suchergebnisse.' : 'Noch keine Dokumente. Dateien oben ablegen.'}
          </p>
        ) : (
          displayed.map((doc) => <DocumentCard key={doc.id} document={doc} />)
        )}
      </div>
    </div>
  );
}
