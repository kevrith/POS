import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Fuel, Clock, Droplets, Scale, Tag, Building2, List, BarChart3, Settings,
} from 'lucide-react';
import { Card, EmptyState, PageHeader, Tabs, type TabItem } from '../components/ui';
import ForecourtTab, { type Prefill } from './fuel/ForecourtTab';
import ShiftTab from './fuel/ShiftTab';
import TanksTab from './fuel/TanksTab';
import WetStockTab from './fuel/WetStockTab';
import PricesTab from './fuel/PricesTab';
import FleetTab from './fuel/FleetTab';
import SalesTab from './fuel/SalesTab';
import ReportsTab from './fuel/ReportsTab';
import SetupTab from './fuel/SetupTab';
import { useControllerLink } from './fuel/ControllerPanel';
import { useFuelScope, usePumps } from './fuel/useFuelData';

type Tab = 'forecourt' | 'shift' | 'tanks' | 'wetstock' | 'prices' | 'fleet' | 'sales' | 'reports' | 'setup';

/**
 * The fuel station: the forecourt where fuel is sold, the shift that makes each attendant answer for it, the tanks
 * and the checks that show where fuel or cash went missing. Attendants see what they work with; the rest is for managers.
 */
export default function FuelPumpPage() {
  const { businessId, storeId, isManager } = useFuelScope();
  const { data: pumps = [] } = usePumps();
  const [tab, setTab] = useState<Tab>('forecourt');
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  // The station id arrives a moment after sign-in; only say the account has none once it clearly will not.
  const [waitedForStore, setWaitedForStore] = useState(false);
  useEffect(() => {
    if (storeId) return;
    const timer = setTimeout(() => setWaitedForStore(true), 4000);
    return () => clearTimeout(timer);
  }, [storeId]);

  const link = useControllerLink({ businessId, storeId, pumps, onReading: (pumpNumber, litres) => { setPrefill({ pumpNumber, litres }); setTab('forecourt'); } });
  const clearPrefill = useCallback(() => setPrefill(null), []);

  const tabs = useMemo<Array<TabItem<Tab>>>(() => {
    const all: Array<TabItem<Tab> & { manager?: boolean }> = [
      { id: 'forecourt', label: 'Forecourt', icon: <Fuel className="w-4 h-4" aria-hidden /> },
      { id: 'shift', label: 'Shift', icon: <Clock className="w-4 h-4" aria-hidden /> },
      { id: 'tanks', label: 'Tanks', icon: <Droplets className="w-4 h-4" aria-hidden /> },
      { id: 'wetstock', label: 'Wet stock', icon: <Scale className="w-4 h-4" aria-hidden />, manager: true },
      { id: 'prices', label: 'Prices', icon: <Tag className="w-4 h-4" aria-hidden /> },
      { id: 'fleet', label: 'Fleet accounts', icon: <Building2 className="w-4 h-4" aria-hidden />, manager: true },
      { id: 'sales', label: 'Sales', icon: <List className="w-4 h-4" aria-hidden /> },
      { id: 'reports', label: 'Reports', icon: <BarChart3 className="w-4 h-4" aria-hidden />, manager: true },
      { id: 'setup', label: 'Setup', icon: <Settings className="w-4 h-4" aria-hidden />, manager: true },
    ];
    return all.filter((t) => isManager || !t.manager).map(({ manager: _m, ...t }) => t);
  }, [isManager]);

  const current: Tab = tabs.some((t) => t.id === tab) ? tab : 'forecourt';

  // Everything on this page belongs to one station; an account that is not linked to one has nothing to show.
  if (!storeId && !waitedForStore) return <div className="p-6 text-sm text-gray-500">Loading your station...</div>;
  if (!storeId) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        <PageHeader title="Fuel station" icon={<Fuel className="w-5 h-5" aria-hidden />} />
        <Card><EmptyState icon={<Fuel className="w-6 h-6" aria-hidden />} title="This account is not linked to a station" description="Ask the owner to sign in with an account that belongs to a station, or to link yours under Settings, then Users." /></Card>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <PageHeader title="Fuel station" subtitle="Pumps, shifts, tanks and the checks that keep them honest" icon={<Fuel className="w-5 h-5" aria-hidden />} />
      <Tabs tabs={tabs} value={current} onChange={setTab} />

      {current === 'forecourt' && (
        <ForecourtTab
          onGoShift={() => setTab('shift')}
          controllerActive={link.active}
          onControllerAction={(action, pump) => void link.dispatch(action, pump)}
          prefill={prefill}
          clearPrefill={clearPrefill}
        />
      )}
      {current === 'shift' && <ShiftTab />}
      {current === 'tanks' && <TanksTab />}
      {current === 'wetstock' && <WetStockTab />}
      {current === 'prices' && <PricesTab />}
      {current === 'fleet' && <FleetTab />}
      {current === 'sales' && <SalesTab />}
      {current === 'reports' && <ReportsTab />}
      {current === 'setup' && <SetupTab link={link} />}
    </div>
  );
}
