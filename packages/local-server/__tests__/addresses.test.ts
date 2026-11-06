import * as os from 'os';
import { addressRank, lanAddresses } from '../src/supervisor';

const nic = (address: string, internal = false) => ({ address, family: 'IPv4' as const, internal, netmask: '', mac: '', cidr: null });

describe('which address the tills should type', () => {
  it('puts the shop network first and the virtual adapters (Docker, WSL, VPN) last', () => {
    const list = lanAddresses(3010, {
      docker0: [nic('172.17.0.1')],
      wsl: [nic('172.22.0.1')],
      wifi: [nic('192.168.100.6')],
      lo: [nic('127.0.0.1', true)],
    } as unknown as ReturnType<typeof os.networkInterfaces>);
    expect(list).toEqual(['http://192.168.100.6:3010', 'http://172.17.0.1:3010', 'http://172.22.0.1:3010']);
  });
  it('ranks 10.x after 192.168.x, and a self-assigned address (no network) last', () => {
    expect(addressRank('192.168.1.5')).toBeLessThan(addressRank('10.0.0.5'));
    expect(addressRank('10.0.0.5')).toBeLessThan(addressRank('172.20.1.1'));
    expect(addressRank('169.254.3.4')).toBeGreaterThan(addressRank('172.20.1.1'));
  });
  it('ignores IPv6 and loopback', () => {
    const list = lanAddresses(3010, { a: [{ ...nic('fe80::1'), family: 'IPv6' }, nic('127.0.0.1', true)] } as unknown as ReturnType<typeof os.networkInterfaces>);
    expect(list).toEqual([]);
  });
});
