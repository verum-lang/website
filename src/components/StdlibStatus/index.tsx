import React from 'react';
import styles from './styles.module.css';

/**
 * Status keyword for a stdlib module.
 *
 * - `complete` — All public APIs covered by unit tests; algebraic laws
 *   pinned by property tests; cross-stdlib integration verified;
 *   audit findings landed or routed.
 * - `partial` — Subset of the API surface covered. Reasons for partial
 *   coverage cited in the module's `audit.md`.
 * - `regression-only` — Module is gated by upstream defects and few/no
 *   public-API tests pass yet — only `@ignore`d regressions exist to
 *   lock the bug shapes (plus a small set of PASS-GUARDs).
 * - `unaudited` — No `core-tests/<module>/` folder exists yet. The
 *   module surface is undocumented in conformance terms.
 */
export type StdlibStatusKeyword =
  | 'complete'
  | 'partial'
  | 'regression-only'
  | 'unaudited';

interface DefectSummary {
  /** Sub-area name within the module (e.g. 'text', 'char', 'builder'). */
  area: string;
  /** One-line summary of the defect class. */
  summary: string;
}

interface StdlibStatusProps {
  /** The status keyword. */
  status: StdlibStatusKeyword;
  /** Detailed status note (typically passed from frontmatter `status_detail`). */
  detail?: string;
  /** Per-defect-area summaries to render in a table. */
  defects?: DefectSummary[];
  /** Optional sweep date in YYYY-MM-DD form. */
  sweepDate?: string;
}

const STATUS_META: Record<StdlibStatusKeyword, { label: string; color: string; emoji: string; description: string }> = {
  complete: {
    label: 'complete',
    color: 'var(--ifm-color-success)',
    emoji: '✅',
    description:
      'All public APIs covered by unit tests; algebraic laws pinned by property tests; cross-stdlib integration verified; audit findings landed or routed.',
  },
  partial: {
    label: 'partial',
    color: 'var(--ifm-color-warning)',
    emoji: '⚠️',
    description:
      'Subset of the API surface covered. Reasons for partial coverage cited in the module’s audit.md.',
  },
  'regression-only': {
    label: 'regression-only',
    color: 'var(--ifm-color-danger)',
    emoji: '⛔',
    description:
      'Module is gated by upstream defects — only @ignore’d regressions exist (plus a small PASS-GUARD set).',
  },
  unaudited: {
    label: 'unaudited',
    color: 'var(--ifm-color-secondary-darker)',
    emoji: '❔',
    description:
      'No core-tests/<module>/ folder exists yet. The module surface is undocumented in conformance terms.',
  },
};

export default function StdlibStatus({
  status,
  detail,
  defects,
  sweepDate,
}: StdlibStatusProps): React.ReactElement {
  const meta = STATUS_META[status];
  return (
    <aside className={styles.container} aria-label={`Conformance status: ${meta.label}`}>
      <header className={styles.header} style={{ borderColor: meta.color }}>
        <span className={styles.badge} style={{ backgroundColor: meta.color }}>
          {meta.emoji} <strong>{meta.label}</strong>
        </span>
        <span className={styles.tagline}>{meta.description}</span>
      </header>

      {(detail || sweepDate) && (
        <div className={styles.detail}>
          {detail && <p className={styles.detailText}>{detail}</p>}
          {sweepDate && (
            <p className={styles.sweepDate}>
              Last conformance sweep: <code>{sweepDate}</code>
            </p>
          )}
        </div>
      )}

      {defects && defects.length > 0 && (
        <details className={styles.defects}>
          <summary className={styles.defectsSummary}>
            {defects.length} active defect{defects.length === 1 ? '' : ' classes'} pinned
          </summary>
          <table className={styles.defectsTable}>
            <thead>
              <tr>
                <th>Area</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {defects.map((d) => (
                <tr key={d.area}>
                  <td>
                    <code>{d.area}</code>
                  </td>
                  <td>{d.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </aside>
  );
}
