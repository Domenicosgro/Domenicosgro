import { Calendar, Download, AlertTriangle } from 'lucide-react';
import { useDocumentStore } from '../store/documentStore';
import type { DocumentDate, CalendarEventInput } from '@dokuvault/shared';

const priorityConfig = {
  urgent: { label: 'Dringend', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  high: { label: 'Hoch', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  medium: { label: 'Mittel', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  low: { label: 'Niedrig', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
};

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function daysUntil(isoDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function DeadlineRow({ deadline }: { deadline: DocumentDate }) {
  const days = daysUntil(deadline.date);
  const p = priorityConfig[deadline.priority] ?? priorityConfig.medium;

  return (
    <div className={`flex items-start gap-4 p-4 rounded-xl border bg-slate-800/50 ${p.color}`}>
      <div className="flex-shrink-0 pt-0.5">
        {days <= 0 ? (
          <AlertTriangle className="w-5 h-5 text-red-400" />
        ) : (
          <Calendar className="w-5 h-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-white text-sm">{deadline.label}</p>
        <p className="text-sm mt-0.5 opacity-75">{formatDate(deadline.date)}</p>
      </div>

      <div className="text-right flex-shrink-0">
        <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${p.color}`}>
          {p.label}
        </span>
        <p className="text-xs mt-1 opacity-60">
          {days < 0
            ? `${Math.abs(days)} Tage überfällig`
            : days === 0
            ? 'Heute!'
            : `in ${days} Tagen`}
        </p>
      </div>
    </div>
  );
}

export function DeadlinesPage() {
  const { deadlines } = useDocumentStore();

  const handleExportICS = async () => {
    const events: CalendarEventInput[] = deadlines.map((d) => ({
      title: d.label,
      date: d.date,
      priority: d.priority,
    }));
    await window.electron?.exportICS(events);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Fristen & Termine</h1>
        {deadlines.length > 0 && (
          <button
            onClick={handleExportICS}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            Als ICS exportieren
          </button>
        )}
      </div>

      {deadlines.length === 0 ? (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500">Keine bevorstehenden Fristen.</p>
          <p className="text-slate-600 text-sm mt-1">
            Dokumente analysieren, um Fristen automatisch zu erkennen.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {deadlines.map((d) => (
            <DeadlineRow key={d.id} deadline={d} />
          ))}
        </div>
      )}
    </div>
  );
}
