import { BadRequestException } from '@nestjs/common';
import { isPrivateIPv4, resolvePrinterTarget } from './network-target';

describe('isPrivateIPv4', () => {
  it.each(['10.0.0.5', '172.16.0.1', '172.31.255.254', '192.168.1.50'])('accepts %s', (ip) => {
    expect(isPrivateIPv4(ip)).toBe(true);
  });

  it.each(['127.0.0.1', '169.254.169.254', '8.8.8.8', '172.32.0.1', '172.15.0.1', '0.0.0.0', '192.169.1.1', '999.1.1.1', 'abc', ''])(
    'rejects %s',
    (ip) => {
      expect(isPrivateIPv4(ip)).toBe(false);
    },
  );
});

describe('resolvePrinterTarget', () => {
  it('defaults to the raw-print port 9100', async () => {
    await expect(resolvePrinterTarget('192.168.1.50')).resolves.toEqual({ host: '192.168.1.50', port: 9100 });
  });

  it('honours an explicit port', async () => {
    await expect(resolvePrinterTarget('10.0.0.8:9101')).resolves.toEqual({ host: '10.0.0.8', port: 9101 });
  });

  it.each(['127.0.0.1:5432', '169.254.169.254:80', '8.8.8.8:9100', 'localhost:9100'])('refuses %s', async (details) => {
    await expect(resolvePrinterTarget(details)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['192.168.1.50:0', '192.168.1.50:70000', '192.168.1.50:abc', ''])('refuses bad address %p', async (details) => {
    await expect(resolvePrinterTarget(details)).rejects.toBeInstanceOf(BadRequestException);
  });
});
