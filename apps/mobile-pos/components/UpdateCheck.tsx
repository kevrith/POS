import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Colors } from '../constants/theme';
import { checkForAppUpdate, updateErrorMessage } from '../lib/appUpdates';

type State =
  | { kind: 'idle' }
  | { kind: 'busy'; step: 'checking' | 'downloading' }
  | { kind: 'message'; text: string; tone: 'ok' | 'error' }
  | { kind: 'ready' };

/** A "Check for updates" row for the About / Profile screen. Downloads quietly, then asks to restart. */
export default function UpdateCheck() {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function run() {
    setState({ kind: 'busy', step: 'checking' });
    try {
      // checkForAppUpdate checks first and downloads only when there is something new.
      const outcome = await checkForAppUpdate({
        isEnabled: Updates.isEnabled,
        checkForUpdateAsync: () => Updates.checkForUpdateAsync(),
        fetchUpdateAsync: async () => {
          setState({ kind: 'busy', step: 'downloading' });
          return Updates.fetchUpdateAsync();
        },
      });
      if (outcome.kind === 'downloaded') setState({ kind: 'ready' });
      else if (outcome.kind === 'up-to-date') setState({ kind: 'message', text: 'You have the latest version.', tone: 'ok' });
      else setState({ kind: 'message', text: 'Updates are not available in a development build.', tone: 'error' });
    } catch (e) {
      setState({ kind: 'message', text: updateErrorMessage(e), tone: 'error' });
    }
  }

  const busy = state.kind === 'busy';
  return (
    <View style={s.wrap}>
      {state.kind === 'ready' ? (
        <TouchableOpacity
          style={s.btn}
          onPress={() => void Updates.reloadAsync()}
          accessibilityRole="button"
          accessibilityLabel="Restart to apply the update"
        >
          <Ionicons name="refresh-circle" size={20} color="#FFF" />
          <Text style={s.btnText}>Update ready — restart now</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[s.btn, s.btnOutline, busy && { opacity: 0.7 }]}
          onPress={() => void run()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Check for updates"
        >
          {busy ? <ActivityIndicator color={Colors.primary} /> : <Ionicons name="cloud-download-outline" size={20} color={Colors.primary} />}
          <Text style={[s.btnText, { color: Colors.primary }]}>
            {state.kind === 'busy' ? (state.step === 'downloading' ? 'Downloading update…' : 'Checking…') : 'Check for updates'}
          </Text>
        </TouchableOpacity>
      )}
      {state.kind === 'message' && (
        <Text style={[s.msg, { color: state.tone === 'error' ? Colors.error : Colors.success }]}>{state.text}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 12 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, backgroundColor: Colors.primary, minHeight: 44,
  },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.primary },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  msg: { marginTop: 8, fontSize: 13, textAlign: 'center' },
});
