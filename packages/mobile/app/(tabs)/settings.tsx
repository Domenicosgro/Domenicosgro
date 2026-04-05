import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  supabaseUrl: 'supabase_url',
  supabaseAnonKey: 'supabase_anon_key',
  anthropicApiKey: 'anthropic_api_key',
};

export default function SettingsTab() {
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');

  useEffect(() => {
    (async () => {
      setSupabaseUrl((await SecureStore.getItemAsync(KEYS.supabaseUrl)) ?? '');
      setSupabaseAnonKey((await SecureStore.getItemAsync(KEYS.supabaseAnonKey)) ?? '');
      setAnthropicApiKey((await SecureStore.getItemAsync(KEYS.anthropicApiKey)) ?? '');
    })();
  }, []);

  const handleSave = async () => {
    await SecureStore.setItemAsync(KEYS.supabaseUrl, supabaseUrl.trim());
    await SecureStore.setItemAsync(KEYS.supabaseAnonKey, supabaseAnonKey.trim());
    await SecureStore.setItemAsync(KEYS.anthropicApiKey, anthropicApiKey.trim());
    Alert.alert('Gespeichert', 'Einstellungen wurden gespeichert.');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Verbindung</Text>

      <Text style={styles.label}>Supabase URL</Text>
      <TextInput
        style={styles.input}
        value={supabaseUrl}
        onChangeText={setSupabaseUrl}
        placeholder="https://xxxx.supabase.co"
        placeholderTextColor="#475569"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Text style={styles.label}>Supabase Anon Key</Text>
      <TextInput
        style={styles.input}
        value={supabaseAnonKey}
        onChangeText={setSupabaseAnonKey}
        placeholder="eyJ…"
        placeholderTextColor="#475569"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <Text style={styles.label}>Anthropic API Key</Text>
      <TextInput
        style={styles.input}
        value={anthropicApiKey}
        onChangeText={setAnthropicApiKey}
        placeholder="sk-ant-…"
        placeholderTextColor="#475569"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Speichern</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20 },
  sectionTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  label: { color: '#94a3b8', fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    color: '#f1f5f9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 16,
  },
  saveBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
