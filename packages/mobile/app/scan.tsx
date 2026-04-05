import { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Camera, Check, X, RotateCcw } from 'lucide-react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image } from 'react-native';
import { useDocumentStore } from '../src/store/documentStore';

type ScannedPage = { uri: string; base64: string };

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const { importScannedPages } = useDocumentStore();

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.permContainer}>
        <Camera size={48} color="#64748b" />
        <Text style={styles.permText}>Kamerazugriff erforderlich</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Zugriff erlauben</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.85 });
    if (!photo) return;

    // Slight crop/compress for document scanning
    const processed = await ImageManipulator.manipulateAsync(
      photo.uri,
      [{ resize: { width: 1800 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );

    setPages((prev) => [
      ...prev,
      { uri: processed.uri, base64: processed.base64 ?? '' },
    ]);
  };

  const handleRemovePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDone = async () => {
    if (pages.length === 0) {
      Alert.alert('Keine Seiten', 'Mindestens eine Seite scannen.');
      return;
    }

    setIsProcessing(true);
    try {
      await importScannedPages(pages.map((p) => p.base64));
      router.back();
    } catch (err) {
      Alert.alert('Fehler', String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Camera preview */}
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        {/* Viewfinder overlay */}
        <View style={styles.overlay}>
          <View style={styles.viewfinder} />
        </View>
      </CameraView>

      {/* Page thumbnails */}
      {pages.length > 0 && (
        <ScrollView
          horizontal
          style={styles.pages}
          contentContainerStyle={styles.pagesContent}
        >
          {pages.map((page, i) => (
            <View key={i} style={styles.thumb}>
              <Image source={{ uri: page.uri }} style={styles.thumbImg} />
              <TouchableOpacity
                style={styles.thumbRemove}
                onPress={() => handleRemovePage(i)}
              >
                <X size={12} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.thumbNum}>{i + 1}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.ctrlBtn} onPress={() => setPages([])}>
          <RotateCcw size={22} color="#94a3b8" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.captureBtn} onPress={handleCapture}>
          <View style={styles.captureBtnInner} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctrlBtn, pages.length === 0 && styles.ctrlBtnDisabled]}
          onPress={handleDone}
          disabled={pages.length === 0 || isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#3b82f6" />
          ) : (
            <Check size={22} color={pages.length > 0 ? '#3b82f6' : '#334155'} />
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        {pages.length === 0
          ? 'Dokument fotografieren'
          : `${pages.length} Seite${pages.length > 1 ? 'n' : ''} — weitere Seiten oder fertig`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  permContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', gap: 16 },
  permText: { color: '#94a3b8', fontSize: 16 },
  permBtn: { backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  permBtnText: { color: '#fff', fontWeight: '600' },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  viewfinder: {
    width: '85%',
    aspectRatio: 0.707, // A4 ratio
    borderWidth: 2,
    borderColor: 'rgba(59,130,246,0.7)',
    borderRadius: 4,
  },
  pages: { maxHeight: 90, backgroundColor: '#0f172a' },
  pagesContent: { padding: 10, gap: 8 },
  thumb: { width: 60, height: 80, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  thumbImg: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 2,
  },
  thumbNum: {
    position: 'absolute',
    bottom: 2,
    left: 4,
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 20,
    backgroundColor: '#0f172a',
  },
  ctrlBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  ctrlBtnDisabled: { opacity: 0.4 },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  hint: { color: '#64748b', textAlign: 'center', fontSize: 12, paddingBottom: 8, backgroundColor: '#0f172a' },
});
