import { Link } from 'react-router-dom';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { licenseNotice, useLicense } from '../lib/license';

const TONE = {
  info: 'bg-brand-600 text-white',
  warning: 'bg-amber-600 text-white',
  danger: 'bg-red-700 text-white',
} as const;

/**
 * One line across the top of the app when the licence needs attention (offline edition only). Everyone sees the words;
 * the link to the licence page is there for the owner, whose screen it opens (others are sent back by the page).
 */
export default function LicenseBanner() {
  const { data } = useLicense();
  const notice = licenseNotice(data);
  if (!notice) return null;
  return (
    <div role="status" className={`${TONE[notice.tone]} text-sm font-semibold px-4 py-2 flex items-center justify-center gap-3 text-center`}>
      {notice.tone === 'warning' ? <KeyRound className="w-4 h-4 flex-shrink-0" aria-hidden /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden />}
      <span>{notice.message}</span>
      <Link to="/license" className="underline underline-offset-2 whitespace-nowrap">Licence</Link>
    </div>
  );
}
