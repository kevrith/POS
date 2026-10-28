import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Switch, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import {
  DEFAULT_NETWORK_PORT, DEFAULT_PRINTER_SETTINGS, isValidHost, isValidPort,
  type PrinterSettings, type PrintMethod,
} from '../lib/printerConfig';
import type { PaperWidth } from '../lib/receiptModel';
import { listBondedPrinters, loadPrinterSettings, printTestReceipt, savePrinterSettings } from '../lib/receiptPrint';

const METHODS: Array<{ value: PrintMethod; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'system', label: 'Print dialog', icon: 'document-text-outline' },
  { value: 'bluetooth', label: 'Bluetooth', icon: 'bluetooth-outline' },
  { value: 'network', label: 'Wi-Fi / LAN', icon: 'wifi-outline' },
];

const PAPER: Array<{ value: PaperWidth; title: string; sub: string }> = [
  { value: 58, title: '58 mm', sub: 'Small Bluetooth printer' },
  { value: 80, title: '80 mm', sub: 'Standard thermal printer' },
];

type Status = { ok: boolean; text: string } | null;

export default function PrinterSettingsCard({ businessName }: { businessName?: string }) {
  const [s, setS] = useState<PrinterSettings>(DEFAULT_PRINTER_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [hostInput, setHostInput] = useState('');
  const [portInput, setPortInput] = useState(String(DEFAULT_NETWORK_PORT));
  const [devices, setDevices] = useState<Array<{ name: string; address: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    void loadPrinterSettings().then((loadedSettings) => {
      setS(loadedSettings);
      setHostInput(loadedSettings.network?.host ?? '');
      setPortInput(String(loadedSettings.network?.port ?? DEFAULT_NETWORK_PORT));
      setLoaded(true);
    });
  }, []);

  function update(patch: Partial<PrinterSettings>) {
    setS((prev) => {
      const next = { ...prev, ...patch };
      void savePrinterSettings(next);
      return next;
    });
    setStatus(null);
  }

  function chooseMethod(method: PrintMethod) {
    // Bluetooth and LAN print without a dialog, so printing straight after the sale becomes possible.
    update({ method, autoPrint: method === 'system' ? false : s.autoPrint });
  }

  function onHostChange(text: string) {
    setHostInput(text);
    const port = Number(portInput);
    if (isValidHost(text)) update({ network: { host: text.trim(), port: isValidPort(port) ? port : DEFAULT_NETWORK_PORT } });
    else if (!text.trim()) update({ network: undefined });
  }

  function onPortChange(text: string) {
    const digits = text.replace(/\D/g, '');
    setPortInput(digits);
    if (s.network && isValidPort(Number(digits))) update({ network: { host: s.network.host, port: Number(digits) } });
  }

  async function findPrinters() {
    setBusy(true);
    setStatus(null);
    try {
      setDevices(await listBondedPrinters());
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : 'Could not read Bluetooth printers.' });
    } finally {
      setBusy(false);
    }
  }

  async function testPrint() {
    setBusy(true);
    setStatus(null);
    try {
      await printTestReceipt(s, businessName);
      setStatus({ ok: true, text: s.method === 'system' ? 'Print dialog opened.' : 'Test receipt sent to the printer.' });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : 'The printer did not respond.' });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <ActivityIndicator color={Colors.primary} style={{ marginVertical: 16 }} />;

  const hostInvalid = hostInput.trim().length > 0 && !isValidHost(hostInput);

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.title}>Print receipts</Text>
          <Text style={styles.desc}>
            {s.enabled
              ? 'A Print Receipt button shows after each sale.'
              : 'Off. Receipts are digital only (sent by SMS or WhatsApp when the sale has a customer).'}
          </Text>
        </View>
        <Switch
          value={s.enabled}
          onValueChange={(enabled) => update({ enabled })}
          trackColor={{ true: Colors.primary }}
          thumbColor={s.enabled ? Colors.primary : '#f4f3f4'}
        />
      </View>

      {s.enabled && (
        <>
          <Text style={styles.label}>How to print</Text>
          <View style={styles.chips}>
            {METHODS.map((m) => {
              const on = s.method === m.value;
              return (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => chooseMethod(m.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Ionicons name={m.icon} size={18} color={on ? '#fff' : Colors.text} />
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Paper size</Text>
          <View style={styles.chips}>
            {PAPER.map((p) => {
              const on = s.paperWidth === p.value;
              return (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.paper, on && styles.chipOn]}
                  onPress={() => update({ paperWidth: p.value })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.paperTitle, on && styles.chipTextOn]}>{p.title}</Text>
                  <Text style={[styles.paperSub, on && styles.chipTextOn]}>{p.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.hint}>
            Pick the width of the paper roll in the printer. Receipts are laid out to fit it, so a 58 mm roll is not cut off
            and an 80 mm roll is not left half empty.
          </Text>

          {s.method === 'bluetooth' && (
            <View style={styles.block}>
              <Text style={styles.label}>Bluetooth printer</Text>
              <Text style={styles.value}>{s.bluetooth ? `${s.bluetooth.name}` : 'No printer chosen'}</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={findPrinters} disabled={busy}>
                <Ionicons name="search-outline" size={18} color={Colors.primary} />
                <Text style={styles.secondaryText}>{s.bluetooth ? 'Change printer' : 'Choose printer'}</Text>
              </TouchableOpacity>
              {devices && devices.length === 0 && (
                <Text style={styles.hint}>
                  No paired printers found. Switch the printer on, pair it in the phone&apos;s Bluetooth settings, then try again.
                </Text>
              )}
              {devices?.map((d) => (
                <TouchableOpacity
                  key={d.address}
                  style={styles.device}
                  onPress={() => { update({ bluetooth: { address: d.address, name: d.name } }); setDevices(null); }}
                >
                  <Ionicons name="print-outline" size={18} color={Colors.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deviceName}>{d.name}</Text>
                    <Text style={styles.deviceAddr}>{d.address}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <Text style={styles.hint}>Bluetooth printers work on Android. On iPhone use Wi-Fi / LAN or the print dialog.</Text>
            </View>
          )}

          {s.method === 'network' && (
            <View style={styles.block}>
              <Text style={styles.label}>Printer address</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }, hostInvalid && styles.inputBad]}
                  value={hostInput}
                  onChangeText={onHostChange}
                  placeholder="192.168.1.50"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel="Printer IP address"
                />
                <TextInput
                  style={[styles.input, { width: 90 }]}
                  value={portInput}
                  onChangeText={onPortChange}
                  placeholder="9100"
                  keyboardType="number-pad"
                  accessibilityLabel="Printer port"
                />
              </View>
              {hostInvalid && <Text style={styles.bad}>Enter an IP address such as 192.168.1.50.</Text>}
              <Text style={styles.hint}>
                The phone and the printer must be on the same Wi-Fi network. Most thermal printers listen on port 9100.
              </Text>
            </View>
          )}

          <View style={[styles.row, { marginTop: 14 }]}>
            <View style={styles.rowText}>
              <Text style={styles.title}>Print automatically</Text>
              <Text style={styles.desc}>
                {s.method === 'system'
                  ? 'Not available with the print dialog, which needs a tap each time.'
                  : 'Print as soon as a sale completes. If the printer cannot be reached you are told, and can print again.'}
              </Text>
            </View>
            <Switch
              value={s.autoPrint && s.method !== 'system'}
              disabled={s.method === 'system'}
              onValueChange={(autoPrint) => update({ autoPrint })}
              trackColor={{ true: Colors.primary }}
              thumbColor={s.autoPrint && s.method !== 'system' ? Colors.primary : '#f4f3f4'}
            />
          </View>

          <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 14 }]} onPress={testPrint} disabled={busy}>
            {busy ? <ActivityIndicator color={Colors.primary} /> : <Ionicons name="print-outline" size={18} color={Colors.primary} />}
            <Text style={styles.secondaryText}>Print test receipt</Text>
          </TouchableOpacity>
          {status && (
            <Text style={[styles.status, { color: status.ok ? Colors.success : Colors.error }]} accessibilityRole="alert">
              {status.text}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowText: { flex: 1, paddingRight: 12 },
  title: { fontSize: 15, fontWeight: '600', color: Colors.text },
  desc: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.card,
  },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  chipTextOn: { color: '#fff' },
  paper: {
    flexGrow: 1, flexBasis: '45%', minHeight: 56, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.card,
  },
  paperTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  paperSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  hint: { fontSize: 12, color: Colors.textSecondary, marginTop: 8, lineHeight: 17 },
  block: { marginTop: 4 },
  value: { fontSize: 15, color: Colors.text, marginBottom: 8 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44,
    borderRadius: 10, borderWidth: 1.5, borderColor: Colors.primary,
  },
  secondaryText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  device: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 10, marginTop: 8,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
  },
  deviceName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  deviceAddr: { fontSize: 11, color: Colors.textSecondary },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    minHeight: 44, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12,
    fontSize: 15, color: Colors.text, backgroundColor: Colors.card,
  },
  inputBad: { borderColor: Colors.error },
  bad: { fontSize: 12, color: Colors.error, marginTop: 6 },
  status: { fontSize: 13, fontWeight: '600', marginTop: 10, lineHeight: 18 },
});
