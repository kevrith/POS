import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { useCartStore } from '../stores/cart';
import { mobileApi } from '../lib/api';
import { Colors } from '../constants/theme';

interface Item {
  id: string;
  name: string;
  barcode?: string;
  retailPriceCents: number;
  wholesalePriceCents?: number;
  vipPriceCents?: number;
  stock?: number;
}

function getItemPrice(item: Item, level: 'RETAIL' | 'WHOLESALE' | 'VIP'): number {
  if (level === 'WHOLESALE' && item.wholesalePriceCents) return item.wholesalePriceCents;
  if (level === 'VIP' && item.vipPriceCents) return item.vipPriceCents;
  return item.retailPriceCents;
}

export default function BarcodeScanScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { addItem, priceLevel } = useCartStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);

  const { businessId, storeId } = useActiveStore();

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission]);

  async function handleBarcode(code: string) {
    if (scanning || code === lastCode) return;
    setScanned(true);
    setScanning(true);
    setLastCode(code);

    try {
      const items = await mobileApi.get<Item[]>(
        `/items?businessId=${businessId}&storeId=${storeId}&barcode=${encodeURIComponent(code)}`
      );
      const item = Array.isArray(items) ? items[0] : null;

      if (!item) {
        Alert.alert(
          'Not Found',
          `No item found for barcode: ${code}`,
          [
            { text: 'Try Again', onPress: () => { setScanned(false); setScanning(false); setLastCode(null); } },
            { text: 'Back to POS', onPress: () => router.back() },
          ]
        );
        return;
      }

      if ((item.stock ?? 1) <= 0) {
        Alert.alert(
          'Out of Stock',
          `${item.name} is out of stock.`,
          [
            { text: 'Scan Another', onPress: () => { setScanned(false); setScanning(false); setLastCode(null); } },
            { text: 'Back to POS', onPress: () => router.back() },
          ]
        );
        return;
      }

      const price = getItemPrice(item, priceLevel);
      addItem({ id: item.id, name: item.name, unitPriceCents: price });

      Alert.alert(
        'Added to Cart',
        `${item.name} added!`,
        [
          { text: 'Scan More', onPress: () => { setScanned(false); setScanning(false); setLastCode(null); } },
          { text: 'View Cart', onPress: () => router.back() },
        ]
      );
    } catch (err: any) {
      Alert.alert(
        'Error',
        err.message ?? 'Failed to look up item.',
        [
          { text: 'Try Again', onPress: () => { setScanned(false); setScanning(false); setLastCode(null); } },
          { text: 'Cancel', onPress: () => router.back() },
        ]
      );
    } finally {
      setScanning(false);
    }
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.permText}>Checking camera permissions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Barcode Scanner</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="camera-outline" size={64} color={Colors.border} />
          <Text style={styles.permTitle}>Camera Permission Needed</Text>
          <Text style={styles.permText}>
            Camera access is required to scan barcodes. Please grant permission to continue.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Ionicons name="camera" size={18} color="#FFFFFF" />
            <Text style={styles.permBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.scanContainer}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'itf14'] }}
        onBarcodeScanned={scanned ? undefined : (result) => handleBarcode(result.data)}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Header */}
        <SafeAreaView>
          <View style={styles.scanHeader}>
            <TouchableOpacity onPress={() => router.back()} style={styles.scanBackBtn}>
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.scanHeaderTitle}>Scan Barcode</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>

        {/* Viewfinder */}
        <View style={styles.viewfinderWrap}>
          <View style={styles.viewfinder}>
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.scanInstructions}>
          {scanning ? (
            <View style={styles.scanningRow}>
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
              <Text style={styles.scanInstructionText}>Looking up item...</Text>
            </View>
          ) : scanned ? (
            <Text style={styles.scanInstructionText}>Processing...</Text>
          ) : (
            <Text style={styles.scanInstructionText}>
              Point camera at a barcode or QR code
            </Text>
          )}

          {lastCode && !scanning && !scanned && (
            <Text style={styles.lastCodeText}>Last: {lastCode}</Text>
          )}

          <TouchableOpacity
            style={styles.rescanBtn}
            onPress={() => { setScanned(false); setScanning(false); setLastCode(null); }}
          >
            <Ionicons name="scan-outline" size={16} color={Colors.primary} />
            <Text style={styles.rescanBtnText}>Reset Scanner</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_THICKNESS = 3;

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
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24 },
  permTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  permText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  permBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 24,
  },
  permBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  backLink: { paddingVertical: 8 },
  backLinkText: { fontSize: 14, color: Colors.primary },

  // Scanner
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
  scanBackBtn: { padding: 4 },
  scanHeaderTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  viewfinderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  viewfinder: { width: 240, height: 180 },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: '#FFFFFF',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  scanInstructions: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  scanningRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanInstructionText: { color: '#FFFFFF', fontSize: 15, textAlign: 'center' },
  lastCodeText: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  rescanBtnText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
});
