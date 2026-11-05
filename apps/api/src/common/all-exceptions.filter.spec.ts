import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }) };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as any;
  new AllExceptionsFilter().catch(exception, host);
  return { status: res.status.mock.calls[0][0] as number, body: json.mock.calls[0][0] as { statusCode: number; message: string } };
}
const prismaError = (code: string, meta?: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError('boom: select "Item"."taxClass" from "Item"', { code, clientVersion: 'x', meta });

describe('AllExceptionsFilter', () => {
  const env = process.env.NODE_ENV;
  afterEach(() => { process.env.NODE_ENV = env; });

  it('passes an HttpException through unchanged', () => {
    expect(run(new BadRequestException('nope'))).toEqual({ status: 400, body: { statusCode: 400, message: 'nope' } });
  });

  it.each([['P2021'], ['P2022']])('says the database is out of date for %s, instead of a bare "Internal server error"', (code) => {
    process.env.NODE_ENV = 'production';
    const { status, body } = run(prismaError(code, { column: 'Item.taxClass' }));
    expect(status).toBe(500);
    expect(body.message).toContain('database is out of date');
    expect(body.message).toContain('pending database migrations');
  });

  it('names the missing column outside production, to help the developer', () => {
    process.env.NODE_ENV = 'development';
    expect(run(prismaError('P2022', { column: 'Item.taxClass' })).body.message).toContain('(missing: Item.taxClass)');
  });

  it('never names the column, nor leaks the query, in production', () => {
    process.env.NODE_ENV = 'production';
    const { body } = run(prismaError('P2022', { column: 'Item.taxClass' }));
    expect(body.message).not.toContain('taxClass');
    expect(body.message).not.toContain('select');
  });

  it('keeps the existing mappings for record-not-found and duplicates', () => {
    expect(run(prismaError('P2025')).status).toBe(404);
    expect(run(prismaError('P2002')).status).toBe(409);
  });

  it('hides an unknown error in production and shows it in development', () => {
    process.env.NODE_ENV = 'production';
    expect(run(new Error('secret detail')).body.message).toBe('Internal server error');
    process.env.NODE_ENV = 'development';
    expect(run(new Error('secret detail')).body.message).toBe('secret detail');
  });
});
