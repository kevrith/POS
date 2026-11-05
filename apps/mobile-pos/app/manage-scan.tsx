import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useActiveStore } from '../lib/useActiveStore';
import { mobileApi } from '../lib/api';
import { Colors } from '../constants/theme';

interface Item { id: string; name: string; barcode?: string }

/**
 * Barcode scanner for the Manage flow: instead of adding to a cart (that's what
 * app/barcode-scan.tsx does for the POS), this looks the item up and opens its
 * stock-management detail screen.
 */
export default function ManageScanScreen() {
  const router = useRouter();
  const { businessId, storeId } = useActiveStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  async function handleBarcode(code: string) {
    if (busy) return;
    setBusy(true);
    try {
      const items = await mobileApi.get<Item[]>(
        `/items?businessId=${businessId}&storeId=${storeId}&barcode=${encodeURIComponent(code)}`
      );
      // Exact-barcode lookup — don't fall back to items[0], or an unknown barcode
      // would open some unrelated item's stock screen.
      const match = Array.isArray(items) && items.length === 1 ? items[0] : null;
      if (!match) {
        Alert.alert('Not found', `No item for barcode ${code}.`, [
          { text: 'Scan again', onPress: () => setBusy(false) },
          { text: 'Add new', onPress: () => router.replace(`/manage-item-form?barcode=${encodeURIComponent(code)}`) },
        ]);
        return;
      }
      router.replace(`/manage-item?id=${match.id}`);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Lookup failed.', [
        { text: 'Retry', onPress: () => setBusy(false) },
        { text: 'Back', onPress: () => router.back() },
      ]);
    }
  }

  if (!permission?.granted) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={64} color={Colors.border} />
          <Text style={styles.permText}>Camera access is needed to scan barcodes.</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Grant Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.scanContainer}>
      {/* Camera feed sits behind the status bar here, not the light background —
          white icons stay readable over it. Reverts on leaving the screen. */}
      <StatusBar style="light" />
      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'itf14'] }}
        onBarcodeScanned={busy ? undefined : (r) => handleBarcode(r.data)}
      />
      <View style={styles.overlay}>
        <SafeAreaView edges={['top']}>
          <View style={styles.scanHeader}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.scanHeaderTitle}>Scan to manage</Text>
            <View style={{ width: 30 }} />
          </View>
        </SafeAreaView>
        <View style={styles.instructions}>
          <Text style={styles.instructionsText}>{busy ? 'Looking up item…' : 'Point at a barcode'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  permText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  permBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  permBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  scanContainer: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanHeaderTitle: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  instructions: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 24, alignItems: 'center' },
  instructionsText: { color: '#FFFFFF', fontSize: 15 },
});
