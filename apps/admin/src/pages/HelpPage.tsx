import { useEffect, useRef } from 'react';
import { SUPER_ADMIN_GUIDE_HTML } from '../generated/superAdminGuide';
import { C } from '../generated/tokens';

/**
 * The super-admin guide, rendered inside the console.
 *
 * The HTML is generated at build time from docs/super-admin-guide.md by
 * scripts/build-docs.sh, so there is no markdown renderer at runtime and the page
 * works with no network. The content is ours, not user input — it never travels
 * through the API — so dangerouslySetInnerHTML is safe here in a way it would not
 * be for tenant data.
 *
 * Deliberately NOT published to the landing site: this documents impersonation,
 * tenant deletion and comping, which customers have no business reading.
 */

export default function HelpPage() {
  const ref = useRef<HTMLDivElement>(null);

  // Pandoc emits a <nav id="TOC"> we want as a sidebar rather than inline, plus
  // tables that need to scroll on their own instead of stretching the layout.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    root.querySelectorAll('table').forEach((t) => {
      const parent = t.parentElement;
      if (parent?.classList.contains('sa-table-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'sa-table-wrap';
      parent?.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  }, []);

  return (
    <div>
      <style>{`
        .sa-doc { color: ${C.textSecondary}; line-height: 1.7; font-size: 0.9375rem; max-width: 860px; }
        .sa-doc h1 { font-size: 1.5rem; font-weight: 800; color: ${C.text}; margin: 0 0 1rem; }
        .sa-doc h2 { font-size: 1.125rem; font-weight: 700; color: ${C.text};
                     margin: 2.5rem 0 0.75rem; padding-top: 1.5rem;
                     border-top: 1px solid ${C.border}; }
        .sa-doc h2:first-of-type { border-top: none; padding-top: 0; }
        .sa-doc h3 { font-size: 1rem; font-weight: 600; color: ${C.text}; margin: 1.5rem 0 0.5rem; }
        .sa-doc p { margin: 0 0 0.875rem; }
        .sa-doc ul, .sa-doc ol { margin: 0 0 0.875rem; padding-left: 1.25rem; }
        .sa-doc li { margin-bottom: 0.375rem; }
        .sa-doc strong { color: ${C.text}; font-weight: 600; }
        .sa-doc a { color: ${C.accentText}; text-decoration: none; }
        .sa-doc a:hover { text-decoration: underline; }
        .sa-doc code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                       font-size: 0.8125rem; background: ${C.cardBorder}; border: 1px solid ${C.border};
                       padding: 1px 6px; border-radius: 4px; color: ${C.accentText}; }
        .sa-doc blockquote { border-left: 3px solid ${C.accent}; background: ${C.blue}14;
                             margin: 1rem 0; padding: 0.75rem 1rem;
                             border-radius: 0 8px 8px 0; color: ${C.textSecondary}; }
        .sa-doc blockquote p:last-child { margin-bottom: 0; }
        .sa-table-wrap { overflow-x: auto; margin: 1rem 0; }
        .sa-doc table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
        .sa-doc th { background: ${C.cardBorder}; color: ${C.text}; font-weight: 600;
                     padding: 0.5rem 0.75rem; text-align: left; border: 1px solid ${C.border};
                     font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .sa-doc td { padding: 0.5rem 0.75rem; border: 1px solid ${C.border};
                     color: ${C.textSecondary}; vertical-align: top; }
        .sa-doc hr { border: none; border-top: 1px solid ${C.border}; margin: 2rem 0; }
        .sa-doc #TOC { background: ${C.card}; border: 1px solid ${C.border};
                       border-radius: 12px; padding: 1rem 1.25rem; margin: 0 0 2rem; }
        .sa-doc #TOC > ul { margin: 0; padding-left: 1.1rem; }
        .sa-doc #TOC ul ul { display: none; }
        .sa-doc #TOC li { margin-bottom: 0.25rem; font-size: 0.8125rem; }
      `}</style>

      <div style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: '14px',
        padding: '1.75rem 2rem',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          marginBottom: '1.5rem', paddingBottom: '1rem',
          borderBottom: `1px solid ${C.border}`,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent}
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <span style={{ fontSize: '0.75rem', color: C.textMuted }}>
            Generated from <code style={{ color: C.textSecondary }}>docs/super-admin-guide.md</code>
            {' · '}rebuild with <code style={{ color: C.textSecondary }}>scripts/build-docs.sh</code>
          </span>
        </div>

        <div
          ref={ref}
          className="sa-doc"
          dangerouslySetInnerHTML={{ __html: SUPER_ADMIN_GUIDE_HTML }}
        />
      </div>
    </div>
  );
}
