import { Navigate } from 'react-router-dom';
import { HardDrive } from 'lucide-react';
import { EmptyState, PageHeader } from '../components/ui';
import ServerPanel from '../components/ServerPanel';
import { keepsOwnData } from '../lib/desktopSetup';
import { useDesktopMode, useLocalServer } from '../lib/useLocalServer';

/**
 * Server and backups, for a computer that keeps its own data and is also a till (a small shop's one PC): is the server
 * healthy, may other computers connect, back up now, restore. A server-only computer shows the same panel as its whole
 * screen (ServerConsolePage).
 */
export default function ServerSettingsPage() {
  const mode = useDesktopMode();
  const { status } = useLocalServer();
  if (mode === undefined) return null;
  if (!keepsOwnData(mode)) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<HardDrive className="w-6 h-6" />}
          title="This computer does not keep its own data"
          description="Server and backup settings are only here on a computer set up to keep its own database. Your data is kept on the server or in the cloud."
        />
      </div>
    );
  }
  if (mode === 'SERVER') return <Navigate to="/" replace />;
  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
      <PageHeader
        title="Server and backups"
        subtitle="Your data lives on this computer. It is backed up every day and when you close the app."
        icon={<HardDrive className="w-5 h-5" />}
      />
      <ServerPanel status={status} />
    </div>
  );
}
