import { useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Calendar, Tag } from 'lucide-react-native';
import * as CalendarAPI from 'expo-calendar';
import { useDocumentStore } from '../../src/store/documentStore';
import { DOCUMENT_CATEGORIES } from '@dokuvault/shared';
import type { DocumentCategory } from '@dokuvault/shared';

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { documents, deadlines } = useDocumentStore();

  const doc = documents.find((d) => d.id === id);
  const docDeadlines = deadlines.filter((d) => d.document_id === id);

  if (!doc) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Dokument nicht gefunden.</Text>
      </View>
    );
  }

  const addToCalendar = async (deadlineId: string) => {
    const deadline = docDeadlines.find((d) => d.id === deadlineId);
    if (!deadline) return;

    const { status } = await CalendarAPI.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Zugriff verweigert', 'Kalenderzugriff ist erforderlich.');
      return;
    }

    const calendars = await CalendarAPI.getCalendarsAsync(CalendarAPI.EntityTypes.EVENT);
    const cal = calendars.find((c) => c.allowsModifications) ?? calendars[0];
    if (!cal) return;

    const eventDate = new Date(deadline.date);
    eventDate.setHours(9, 0, 0, 0);
    const endDate = new Date(eventDate);
    endDate.setHours(10);

    await CalendarAPI.createEventAsync(cal.id, {
      title: `${deadline.label} – ${doc.title ?? doc.file_name}`,
      startDate: eventDate,
      endDate,
      allDay: true,
    });

    Alert.alert('Gespeichert', 'Termin wurde zum Kalender hinzugefügt.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Category badge */}
      {doc.category && (
        <Text style={styles.category}>
          {DOCUMENT_CATEGORIES[doc.category as DocumentCategory]}
        </Text>
      )}

      {/* Title */}
      <Text style={styles.title}>{doc.title ?? doc.file_name}</Text>

      {/* Summary */}
      {doc.summary && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Zusammenfassung</Text>
          <Text style={styles.summary}>{doc.summary}</Text>
        </View>
      )}

      {/* Tags */}
      {doc.tags.length > 0 && (
        <View style={styles.tags}>
          {doc.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Tag size={10} color="#64748b" />
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Deadlines */}
      {docDeadlines.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Erkannte Fristen</Text>
          {docDeadlines.map((d) => (
            <View key={d.id} style={styles.deadlineRow}>
              <View style={styles.deadlineInfo}>
                <Text style={styles.deadlineLabel}>{d.label}</Text>
                <Text style={styles.deadlineDate}>
                  {new Date(d.date).toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
              </View>
              <TouchableOpacity onPress={() => addToCalendar(d.id)} style={styles.calBtn}>
                <Calendar size={18} color="#3b82f6" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Meta */}
      <View style={styles.meta}>
        <Text style={styles.metaText}>
          Hinzugefügt: {new Date(doc.created_at).toLocaleDateString('de-DE')}
        </Text>
        <Text style={styles.metaText}>
          Datei: {doc.file_name} ({(doc.file_size / 1024).toFixed(0)} KB)
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
  notFound: { color: '#94a3b8' },
  category: {
    color: '#3b82f6',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: { color: '#f1f5f9', fontSize: 22, fontWeight: '700', lineHeight: 28 },
  section: { marginTop: 24 },
  sectionTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  summary: { color: '#cbd5e1', fontSize: 14, lineHeight: 22 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: { color: '#64748b', fontSize: 12 },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  deadlineInfo: { flex: 1 },
  deadlineLabel: { color: '#f1f5f9', fontSize: 14, fontWeight: '500' },
  deadlineDate: { color: '#64748b', fontSize: 12, marginTop: 2 },
  calBtn: { padding: 6 },
  meta: { marginTop: 32, gap: 4 },
  metaText: { color: '#334155', fontSize: 12 },
});
