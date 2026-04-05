import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react-native';
import type { Document } from '@dokuvault/shared';
import { DOCUMENT_CATEGORIES } from '@dokuvault/shared';
import type { DocumentCategory } from '@dokuvault/shared';

interface Props {
  document: Document;
  onPress?: () => void;
}

const statusIcons = {
  pending: { Icon: Clock, color: '#64748b' },
  processing: { Icon: Clock, color: '#eab308' },
  done: { Icon: CheckCircle, color: '#22c55e' },
  error: { Icon: AlertCircle, color: '#ef4444' },
} as const;

export function DocumentListItem({ document: doc, onPress }: Props) {
  const s = statusIcons[doc.analysis_status] ?? statusIcons.pending;
  const StatusIcon = s.Icon;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconWrap}>
        <FileText size={20} color="#94a3b8" />
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {doc.title ?? doc.file_name}
        </Text>
        {doc.category && (
          <Text style={styles.category}>
            {DOCUMENT_CATEGORIES[doc.category as DocumentCategory]}
          </Text>
        )}
        {doc.summary && (
          <Text style={styles.summary} numberOfLines={2}>
            {doc.summary}
          </Text>
        )}
      </View>

      <StatusIcon size={16} color={s.color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
  },
  iconWrap: {
    padding: 8,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  body: { flex: 1 },
  title: { color: '#f1f5f9', fontWeight: '600', fontSize: 14 },
  category: { color: '#3b82f6', fontSize: 11, marginTop: 2, fontWeight: '600' },
  summary: { color: '#64748b', fontSize: 12, marginTop: 4, lineHeight: 17 },
});
