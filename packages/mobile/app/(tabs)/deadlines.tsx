import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Calendar } from 'lucide-react-native';
import * as CalendarAPI from 'expo-calendar';
import { useDocumentStore } from '../../src/store/documentStore';
import type { DocumentDate } from '@dokuvault/shared';

const priorityColors: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#64748b',
};

function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(isoDate).getTime() - today.getTime()) / 86_400_000);
}

function DeadlineCard({ item }: { item: DocumentDate }) {
  const days = daysUntil(item.date);
  const color = priorityColors[item.priority] ?? '#64748b';

  const handleAddToCalendar = async () => {
    const { status } = await CalendarAPI.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Zugriff verweigert', 'Kalenderzugriff ist erforderlich.');
      return;
    }

    const calendars = await CalendarAPI.getCalendarsAsync(CalendarAPI.EntityTypes.EVENT);
    const defaultCalendar = calendars.find((c) => c.allowsModifications) ?? calendars[0];

    if (!defaultCalendar) {
      Alert.alert('Fehler', 'Kein bearbeitbarer Kalender gefunden.');
      return;
    }

    const eventDate = new Date(item.date);
    eventDate.setHours(9, 0, 0, 0);
    const endDate = new Date(eventDate);
    endDate.setHours(10, 0, 0, 0);

    await CalendarAPI.createEventAsync(defaultCalendar.id, {
      title: item.label,
      startDate: eventDate,
      endDate,
      allDay: true,
      notes: 'Automatisch erkannt von DokuVault',
    });

    Alert.alert('Gespeichert', 'Termin wurde zum Kalender hinzugefügt.');
  };

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.cardBody}>
        <Text style={styles.cardLabel}>{item.label}</Text>
        <Text style={styles.cardDate}>
          {new Date(item.date).toLocaleDateString('de-DE', {
            weekday: 'short',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </Text>
        <Text style={[styles.cardDays, { color }]}>
          {days < 0
            ? `${Math.abs(days)} Tage überfällig`
            : days === 0
            ? 'Heute!'
            : `in ${days} Tagen`}
        </Text>
      </View>
      <TouchableOpacity style={styles.calBtn} onPress={handleAddToCalendar}>
        <Calendar size={18} color="#3b82f6" />
      </TouchableOpacity>
    </View>
  );
}

export default function DeadlinesTab() {
  const { deadlines } = useDocumentStore();

  return (
    <View style={styles.container}>
      <FlatList
        data={deadlines}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <DeadlineCard item={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Keine bevorstehenden Fristen.</Text>
            <Text style={styles.emptySubtext}>
              Dokumente analysieren, um Fristen automatisch zu erkennen.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  list: { padding: 16, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderLeftWidth: 3,
    padding: 14,
  },
  cardBody: { flex: 1 },
  cardLabel: { color: '#f1f5f9', fontWeight: '600', fontSize: 14 },
  cardDate: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  cardDays: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  calBtn: { padding: 8 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#94a3b8', fontSize: 16, fontWeight: '500' },
  emptySubtext: { color: '#475569', fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
});
