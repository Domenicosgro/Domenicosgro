import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Plus, Camera, Upload } from 'lucide-react-native';
import { useEffect } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { useDocumentStore } from '../../src/store/documentStore';
import { DocumentListItem } from '../../src/components/DocumentListItem';

export default function DocumentsTab() {
  const router = useRouter();
  const { documents, isLoading, loadDocuments, importPickedFile } = useDocumentStore();

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handlePickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      await importPickedFile(result.assets[0]);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DocumentListItem
            document={item}
            onPress={() => router.push(`/document/${item.id}`)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={loadDocuments}
            tintColor="#3b82f6"
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Noch keine Dokumente.</Text>
              <Text style={styles.emptySubtext}>
                Scan-Button unten rechts tippen.
              </Text>
            </View>
          ) : (
            <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
          )
        }
        contentContainerStyle={documents.length === 0 ? styles.emptyContainer : styles.list}
      />

      {/* FAB menu */}
      <View style={styles.fab}>
        <TouchableOpacity style={styles.fabSecondary} onPress={handlePickDocument}>
          <Upload size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fabPrimary}
          onPress={() => router.push('/scan')}
        >
          <Camera size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  list: { padding: 16, gap: 10 },
  emptyContainer: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { color: '#94a3b8', fontSize: 16, fontWeight: '500' },
  emptySubtext: { color: '#475569', fontSize: 13, marginTop: 6 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    alignItems: 'center',
    gap: 12,
  },
  fabPrimary: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  fabSecondary: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
