import { serverOptions } from '../src/postgres';

describe('how PostgreSQL is started', () => {
  it('on Windows leaves the Unix-socket setting out (passing two quote characters made PostgreSQL look for a folder named \'\')', () => {
    const o = serverOptions(54330, 'win32');
    expect(o).not.toContain('unix_socket_directories');
    expect(o).not.toContain("''");
  });

  it('on Linux and macOS switches the socket off with an empty value', () => {
    expect(serverOptions(54330, 'linux')).toContain("-c unix_socket_directories=''");
    expect(serverOptions(54330, 'darwin')).toContain("-c unix_socket_directories=''");
  });

  it('everywhere: this computer only, full durability, the port asked for', () => {
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      const o = serverOptions(54777, platform);
      expect(o).toContain('-p 54777');
      expect(o).toContain('listen_addresses=127.0.0.1');
      expect(o).toContain('fsync=on');
      expect(o).toContain('synchronous_commit=on');
    }
  });
});
