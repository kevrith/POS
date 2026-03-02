import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { driverApi, formatKES } from '../../lib/api';
import { Colors, STATUS_COLORS } from '../../constants/theme';

interface DeliveryDetail {
  id: string;
  orderNumber: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  notes?: string;
  deliveryFeeCents?: number;
  totalCents?: number;
  createdAt: string;
  items?: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
  }>;
}

export default function DeliveryDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<DeliveryDetail>({
    queryKey: ['delivery', id],
    queryFn: () => driverApi.get<DeliveryDetail>(`/delivery/${id}`),
  });

  const updateMutation = useMutation({
    mutationFn: (status: string) =>
      driverApi.patch(`/delivery/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery', id] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => driverApi.delete(`/delivery/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      router.back();
    },
  });

  function confirmAction(title: string, message: string, onConfirm: () => void) {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', style: 'default', onPress: onConfirm },
    ]);
  }

  function handlePickUp() {
    confirmAction(
      'Pick Up Order',
      'Confirm you have picked up this order and are heading to the customer?',
      () => updateMutation.mutate('IN_TRANSIT')
    );
  }

  function handleDeliver() {
    confirmAction(
      'Mark as Delivered',
      'Confirm this order has been successfully delivered?',
      () => updateMutation.mutate('DELIVERED')
    );
  }

  function handleCancel() {
    Alert.alert(
      'Cancel Delivery',
      'Are you sure you want to cancel this delivery?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: () => cancelMutation.mutate() },
      ]
    );
  }

  function handleReportIssue() {
    // Alert.prompt is iOS-only; use Alert.alert on Android
    const promptFn = (Alert as any).prompt as typeof Alert.prompt | undefined;
    if (typeof promptFn === 'function') {
      promptFn(
        'Report Issue',
        'Describe the issue with this delivery:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Report',
            style: 'destructive',
            onPress: (_notes?: string) => updateMutation.mutate('CANCELLED' as any),
          },
        ],
        'plain-text',
        '',
        'default'
      );
    } else {
      Alert.alert(
        'Report Issue',
        'Mark this delivery as failed due to an issue (customer not found, wrong address, etc.)?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Report Issue',
            style: 'destructive',
            onPress: () => updateMutation.mutate('CANCELLED' as any),
          },
        ]
      );
    }
  }

  function openMaps(address: string) {
    const url = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    Linking.openURL(url).catch(() =>
      Alert.alert('Error', 'Could not open maps application.')
    );
  }

  function callCustomer(phone: string) {
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert('Error', 'Could not open phone app.')
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Delivery</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
          <Text style={styles.errorText}>Could not load delivery details</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = STATUS_COLORS[data.status] ?? Colors.textSecondary;
  const isBusy = updateMutation.isPending || cancelMutation.isPending;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order #{data.orderNumber}</Text>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: statusColor + '20', borderColor: statusColor },
          ]}
        >
          <Text style={[styles.statusPillText, { color: statusColor }]}>
            {data.status.replace('_', ' ')}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Customer Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          {data.customerName ? (
            <View style={styles.infoRow}>
              <Ionicons name="person-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.infoValue}>{data.customerName}</Text>
            </View>
          ) : null}

          {data.customerPhone ? (
            <TouchableOpacity
              style={[styles.infoRow, styles.callRow]}
              onPress={() => callCustomer(data.customerPhone!)}
            >
              <Ionicons name="call-outline" size={18} color={Colors.primary} />
              <Text style={[styles.infoValue, { color: Colors.primary }]}>
                {data.customerPhone}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
            </TouchableOpacity>
          ) : null}

          {data.deliveryAddress && data.deliveryAddress !== 'PICKUP' ? (
            <TouchableOpacity
              style={[styles.infoRow, styles.callRow]}
              onPress={() => openMaps(data.deliveryAddress!)}
            >
              <Ionicons name="location-outline" size={18} color={Colors.primary} />
              <Text
                style={[styles.infoValue, { color: Colors.primary, flex: 1 }]}
              >
                {data.deliveryAddress}
              </Text>
              <Ionicons name="map-outline" size={16} color={Colors.primary} />
            </TouchableOpacity>
          ) : null}

          {data.notes ? (
            <View style={styles.notesBox}>
              <Ionicons name="chatbox-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.notesText}>{data.notes}</Text>
            </View>
          ) : null}
        </View>

        {/* Order Items */}
        {data.items && data.items.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Items</Text>
            {data.items.map((item, idx) => (
              <View key={idx} style={styles.itemRow}>
                <Text style={styles.itemQty}>{item.quantity}x</Text>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemPrice}>
                  {formatKES(item.unitPriceCents * item.quantity)}
                </Text>
              </View>
            ))}
            {data.totalCents ? (
              <>
                <View style={styles.divider} />
                <View style={styles.itemRow}>
                  <Text style={[styles.itemName, { fontWeight: '700' }]}>Total</Text>
                  <Text style={[styles.itemPrice, { fontWeight: '700', color: Colors.text }]}>
                    {formatKES(data.totalCents)}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        )}

        {/* Delivery Fee */}
        {data.deliveryFeeCents ? (
          <View style={styles.feeCard}>
            <Ionicons name="cash" size={22} color={Colors.primary} />
            <View>
              <Text style={styles.feeLabel}>Your Delivery Fee</Text>
              <Text style={styles.feeValue}>{formatKES(data.deliveryFeeCents)}</Text>
            </View>
          </View>
        ) : null}

        {/* Action Buttons */}
        {data.status === 'ASSIGNED' && (
          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={handlePickUp}
              disabled={isBusy}
              activeOpacity={0.85}
            >
              {isBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="bicycle" size={20} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Start Delivery</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={styles.secondaryBtns}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnWarning, { flex: 1 }]}
                onPress={handleReportIssue}
                disabled={isBusy}
              >
                <Ionicons name="warning-outline" size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Report Issue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDanger, { flex: 1 }]}
                onPress={handleCancel}
                disabled={isBusy}
              >
                <Ionicons name="close-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {data.status === 'IN_TRANSIT' && (
          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSuccess]}
              onPress={handleDeliver}
              disabled={isBusy}
              activeOpacity={0.85}
            >
              {isBusy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Mark as Delivered</Text>
                </>
              )}
            </TouchableOpacity>
            <View style={styles.secondaryBtns}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnWarning, { flex: 1 }]}
                onPress={handleReportIssue}
                disabled={isBusy}
              >
                <Ionicons name="warning-outline" size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Report Issue</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDanger, { flex: 1 }]}
                onPress={handleCancel}
                disabled={isBusy}
              >
                <Ionicons name="close-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {data.status === 'DELIVERED' && (
          <View style={styles.completedBanner}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
            <Text style={styles.completedText}>Delivery Completed</Text>
          </View>
        )}

        {(data.status === 'CANCELLED' || data.status === 'FAILED') && (
          <View style={[styles.completedBanner, styles.cancelledBanner]}>
            <Ionicons name="close-circle" size={24} color={Colors.error} />
            <Text style={[styles.completedText, { color: Colors.error }]}>
              Delivery {data.status === 'CANCELLED' ? 'Cancelled' : 'Failed'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  headerBar: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 2 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.text },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  callRow: {
    backgroundColor: Colors.primary + '08',
    borderRadius: 10,
    padding: 10,
    marginHorizontal: -6,
  },
  infoValue: { fontSize: 14, color: Colors.text, flex: 1 },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10,
    marginTop: 2,
  },
  notesText: { fontSize: 13, color: Colors.textSecondary, flex: 1, lineHeight: 20 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemQty: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: 24,
  },
  itemName: { flex: 1, fontSize: 14, color: Colors.text },
  itemPrice: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  feeCard: {
    backgroundColor: Colors.primary + '10',
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  feeLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: 2 },
  feeValue: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  actionsSection: { gap: 10 },
  actionBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  secondaryBtns: { flexDirection: 'row', gap: 10 },
  actionBtnPrimary: { backgroundColor: Colors.primary },
  actionBtnSuccess: { backgroundColor: Colors.success },
  actionBtnDanger: { backgroundColor: Colors.error },
  actionBtnWarning: { backgroundColor: Colors.warning },
  actionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success + '15',
    borderWidth: 1.5,
    borderColor: Colors.success + '40',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  completedText: { fontSize: 16, fontWeight: '700', color: Colors.success },
  cancelledBanner: {
    borderColor: Colors.error + '40',
    backgroundColor: Colors.error + '15',
  },
  errorText: { fontSize: 15, color: Colors.textSecondary },
  backLink: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
});
