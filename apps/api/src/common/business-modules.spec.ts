import { enableBusinessModule } from './business-modules';

function db(row: { posMode: string; enabledModules: string } | null) {
  const state = { row: row ? { ...row } : null };
  return {
    state,
    business: {
      findUnique: jest.fn(async () => (state.row ? { ...state.row } : null)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!state.row || state.row.enabledModules !== where.enabledModules) return { count: 0 };
        state.row.enabledModules = data.enabledModules;
        return { count: 1 };
      }),
    },
  };
}

describe('enableBusinessModule', () => {
  it('switches the module on for a business whose main till does not include it', async () => {
    const d = db({ posMode: 'HOSPITALITY', enabledModules: '[]' });
    expect(await enableBusinessModule(d as any, 'b1', 'DELIVERY')).toBe(true);
    expect(JSON.parse(d.state.row!.enabledModules)).toEqual(['DELIVERY']);
  });

  it('keeps what was already on', async () => {
    const d = db({ posMode: 'SALON', enabledModules: '["RESTAURANT"]' });
    await enableBusinessModule(d as any, 'b1', 'QUOTES');
    expect(JSON.parse(d.state.row!.enabledModules)).toEqual(['RESTAURANT', 'QUOTES']);
  });

  it('does nothing when the main till already includes it, or it is already on', async () => {
    const shop = db({ posMode: 'RETAIL', enabledModules: '[]' });
    expect(await enableBusinessModule(shop as any, 'b1', 'DELIVERY')).toBe(false);
    expect(shop.business.updateMany).not.toHaveBeenCalled();
    const on = db({ posMode: 'SALON', enabledModules: '["FIELD_SALES"]' });
    expect(await enableBusinessModule(on as any, 'b1', 'FIELD_SALES')).toBe(false);
    expect(on.business.updateMany).not.toHaveBeenCalled();
  });

  it('is not fooled by damaged stored text, and ignores modules it does not know', async () => {
    const d = db({ posMode: 'SALON', enabledModules: 'not json' });
    expect(await enableBusinessModule(d as any, 'b1', 'DELIVERY')).toBe(true);
    expect(JSON.parse(d.state.row!.enabledModules)).toEqual(['DELIVERY']);
    expect(await enableBusinessModule(d as any, 'b1', 'BOGUS' as any)).toBe(false);
  });

  it('does not overwrite a change made at the same moment: it re-reads and adds to the new list', async () => {
    const d = db({ posMode: 'SALON', enabledModules: '[]' });
    let first = true;
    d.business.findUnique.mockImplementation(async () => {
      const snapshot = { ...d.state.row! };
      if (first) { first = false; d.state.row!.enabledModules = '["HOTEL"]'; } // the owner saves Settings between our read and write
      return snapshot;
    });
    expect(await enableBusinessModule(d as any, 'b1', 'DELIVERY')).toBe(true);
    expect(JSON.parse(d.state.row!.enabledModules).sort()).toEqual(['DELIVERY', 'HOTEL']);
  });

  it('never throws: a missing business or a database error just means nothing happened', async () => {
    expect(await enableBusinessModule(db(null) as any, 'b1', 'DELIVERY')).toBe(false);
    const broken: any = { business: { findUnique: jest.fn().mockRejectedValue(new Error('down')), updateMany: jest.fn() } };
    await expect(enableBusinessModule(broken, 'b1', 'DELIVERY')).resolves.toBe(false);
    expect(await enableBusinessModule(db({ posMode: 'SALON', enabledModules: '[]' }) as any, '', 'DELIVERY')).toBe(false);
  });
});
