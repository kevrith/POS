import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

export default function OrderConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderNumber?: string; orderType?: string }>();
  const orderNumber = params.orderNumber ?? 'N/A';
  const isDelivery = params.orderType === 'DELIVERY';

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.container}>
        {/* Success Icon */}
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark" size={56} color="#FFFFFF" />
        </View>

        <Text style={styles.title}>Order Placed!</Text>
        <Text style={styles.subtitle}>
          Your order has been received and is being processed.
        </Text>

        {/* Order Number */}
        <View style={styles.orderNumberCard}>
          <Text style={styles.orderNumberLabel}>Order Number</Text>
          <Text style={styles.orderNumberValue}>#{orderNumber}</Text>
        </View>

        {/* Estimated Time */}
        <View style={styles.infoCard}>
          <Ionicons
            name={isDelivery ? 'bicycle' : 'bag-check'}
            size={24}
            color={Colors.primary}
          />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>
              {isDelivery ? 'Delivery Order' : 'Pickup Order'}
            </Text>
            <Text style={styles.infoDesc}>
              {isDelivery
                ? 'Estimated time: 30-45 minutes'
                : 'Your order will be ready shortly'}
            </Text>
          </View>
        </View>

        {/* Steps */}
        <View style={styles.stepsCard}>
          <Text style={styles.stepsTitle}>What happens next?</Text>
          {[
            { icon: 'receipt', text: 'Order confirmed & being prepared' },
            ...(isDelivery
              ? [{ icon: 'bicycle', text: 'Driver assigned and on the way' }]
              : []),
            { icon: 'checkmark-circle', text: isDelivery ? 'Delivered to your address' : 'Ready for pickup' },
          ].map((step, index) => (
            <View key={index} style={styles.stepRow}>
              <View style={styles.stepIcon}>
                <Ionicons name={step.icon as any} size={18} color={Colors.primary} />
              </View>
              <Text style={styles.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>

        {/* Back to Menu */}
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => router.replace('/(tabs)/menu' as any)}
          activeOpacity={0.85}
        >
          <Ionicons name="restaurant" size={18} color="#FFFFFF" />
          <Text style={styles.menuBtnText}>Back to Menu</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.ordersBtn}
          onPress={() => router.replace('/(tabs)/orders' as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.ordersBtnText}>Track My Orders</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 24,
    paddingTop: 48,
    gap: 20,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  orderNumberCard: {
    backgroundColor: Colors.primary + '10',
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  orderNumberLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  orderNumberValue: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 1,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  infoText: { flex: 1 },
  infoTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  infoDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  stepsCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    width: '100%',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  stepsTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepText: { fontSize: 13, color: Colors.text, flex: 1 },
  menuBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  menuBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  ordersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ordersBtnText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
});
