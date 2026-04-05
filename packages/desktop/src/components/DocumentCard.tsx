import { FileText, AlertCircle, Clock, CheckCircle, Tag } from 'lucide-react';
import type { Document } from '@dokuvault/shared';
import { DOCUMENT_CATEGORIES } from '@dokuvault/shared';

interface Props {
  document: Document;
}

const statusConfig = {
  pending: { icon: Clock, color: 'text-slate-400', label: 'Ausstehend' },
  processing: { icon: Clock, color: 'text-yellow-400 animate-spin', label: 'Analysiere…' },
  done: { icon: CheckCircle, color: 'text-green-400', label: 'Fertig' },
  error: { icon: AlertCircle, color: 'text-red-400', label: 'Fehler' },
} as const;

const categoryColors: Record<string, string> = {
  rechnung: 'bg-orange-500/20 text-orange-300',
  vertrag: 'bg-purple-500/20 text-purple-300',
  bescheid: 'bg-red-500/20 text-red-300',
  versicherung: 'bg-blue-500/20 text-blue-300',
  steuer: 'bg-yellow-500/20 text-yellow-300',
  bank: 'bg-green-500/20 text-green-300',
  gesundheit: 'bg-pink-500/20 text-pink-300',
  behoerde: 'bg-red-600/20 text-red-400',
  schule: 'bg-indigo-500/20 text-indigo-300',
  wohnen: 'bg-teal-500/20 text-teal-300',
  arbeit: 'bg-cyan-500/20 text-cyan-300',
  sonstiges: 'bg-slate-500/20 text-slate-300',
};

export function DocumentCard({ document: doc }: Props) {
  const status = statusConfig[doc.analysis_status];
  const StatusIcon = status.icon;
  const categoryLabel = doc.category ? DOCUMENT_CATEGORIES[doc.category] : null;
  const categoryColor = doc.category ? categoryColors[doc.category] : '';

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 hover:border-slate-600 transition-colors">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-slate-700 rounded-lg flex-shrink-0">
          <FileText className="w-5 h-5 text-slate-300" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-white text-sm truncate">
              {doc.title ?? doc.file_name}
            </h3>
            {categoryLabel && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColor}`}>
                {categoryLabel}
              </span>
            )}
          </div>

          {doc.summary && (
            <p className="text-slate-400 text-xs mt-1 line-clamp-2">{doc.summary}</p>
          )}

          {doc.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {doc.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 text-xs text-slate-500">
                  <Tag className="w-2.5 h-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0" title={status.label}>
          <StatusIcon className={`w-4 h-4 ${status.color}`} />
        </div>
      </div>
    </div>
  );
}
