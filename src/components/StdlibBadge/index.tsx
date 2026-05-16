import React from 'react';
import styles from './styles.module.css';

/**
 * Lifecycle keyword for a single stdlib module — mirrors the
 * `@arch_module(lifecycle: Lifecycle.X("vN.M"))` directive at the top
 * of every `core/<x>.vr` source file.
 *
 * - `theorem` — Implementation complete, mechanised proof attached,
 *   tier-aligned test suite green on both `--interp` and `--aot`.
 *   API stable: additions only, no breaking changes inside the major.
 * - `conjecture` — Implementation complete; proof in progress; tests
 *   passing in at least one tier.  May receive bug-fix breakage if a
 *   defect surface forces a rename.
 * - `draft` — Implementation incomplete or partially gated behind
 *   feature flags; API may still shift.  Pin a specific Verum version.
 * - `deprecated` — Superseded by another module; kept for source-level
 *   compatibility until the next major.  Migrate per the deprecation note.
 */
export type LifecycleKeyword =
  | 'theorem'
  | 'conjecture'
  | 'draft'
  | 'deprecated';

/**
 * Tier-coverage keyword for a single module.
 *
 * - `both` — Tests pass under both `verum test --interp` (Tier 0 VBC
 *   interpreter) and `verum test --aot` (Tier 2 LLVM AOT).
 * - `interp` — `--interp` ✓ only; `--aot` not yet verified.
 * - `partial` — Some tests pass on at least one tier; not all green.
 * - `none` — No test coverage yet.
 */
export type TierKeyword = 'both' | 'interp' | 'partial' | 'none';

/**
 * Test-coverage badge — the same shape as the per-module rows in
 * `core-tests/INVENTORY.md`.
 */
export type TestCovKeyword = 'full' | 'partial' | 'none';

interface BadgeMeta {
  emoji: string;
  label: string;
  color: string;
  description: string;
}

const LIFECYCLE_META: Record<LifecycleKeyword, BadgeMeta> = {
  theorem: {
    emoji: '🟢',
    label: 'Theorem',
    color: 'var(--ifm-color-success)',
    description:
      'Implementation complete, mechanised proof attached, tier-aligned test suite green on both --interp and --aot. Stable API.',
  },
  conjecture: {
    emoji: '🟡',
    label: 'Conjecture',
    color: 'var(--ifm-color-warning)',
    description:
      'Implementation complete; proof in progress; tests passing in at least one tier. Stable in spirit.',
  },
  draft: {
    emoji: '🟠',
    label: 'Draft',
    color: 'var(--ifm-color-danger-light)',
    description:
      'Implementation incomplete or partially gated. Pin a specific Verum version.',
  },
  deprecated: {
    emoji: '⚫',
    label: 'Deprecated',
    color: 'var(--ifm-color-secondary-darker)',
    description:
      'Superseded by another module; kept for source-level compatibility until next major.',
  },
};

const TIER_META: Record<TierKeyword, BadgeMeta> = {
  both: {
    emoji: '✓✓',
    label: '--interp ✓ --aot ✓',
    color: 'var(--ifm-color-success)',
    description: 'Tests pass on both Tier 0 interpreter and Tier 2 AOT.',
  },
  interp: {
    emoji: '✓·',
    label: '--interp ✓ --aot pending',
    color: 'var(--ifm-color-warning)',
    description: '--interp green; --aot verification pending.',
  },
  partial: {
    emoji: '·~',
    label: 'partial',
    color: 'var(--ifm-color-warning)',
    description: 'Some tests green on at least one tier; full sweep pending.',
  },
  none: {
    emoji: '··',
    label: 'no coverage',
    color: 'var(--ifm-color-danger)',
    description: 'No test coverage in this module yet.',
  },
};

const TEST_COV_META: Record<TestCovKeyword, BadgeMeta> = {
  full: {
    emoji: '🟢',
    label: 'full',
    color: 'var(--ifm-color-success)',
    description:
      'unit_test.vr + property_test.vr + integration_test.vr + regression_test.vr + audit.md all present.',
  },
  partial: {
    emoji: '🟡',
    label: 'partial',
    color: 'var(--ifm-color-warning)',
    description:
      'Subset of the 4-file conformance shape — see the module audit.md for what is deferred.',
  },
  none: {
    emoji: '🔴',
    label: 'no',
    color: 'var(--ifm-color-danger)',
    description: 'No core-tests/<module>/ folder yet.',
  },
};

interface LifecycleBadgeProps {
  lifecycle: LifecycleKeyword;
  version?: string;
}

/**
 * Inline lifecycle badge — emoji + label + version.  Drops in to a
 * markdown table cell.  Hover for the full description.
 */
export function LifecycleBadge({
  lifecycle,
  version,
}: LifecycleBadgeProps): React.ReactElement {
  const m = LIFECYCLE_META[lifecycle];
  return (
    <span
      className={styles.badge}
      title={m.description}
      style={{ borderColor: m.color }}
    >
      <span className={styles.emoji}>{m.emoji}</span>
      <span className={styles.label}>{m.label}</span>
      {version && <span className={styles.version}>({version})</span>}
    </span>
  );
}

interface TierBadgeProps {
  tier: TierKeyword;
}

export function TierBadge({ tier }: TierBadgeProps): React.ReactElement {
  const m = TIER_META[tier];
  return (
    <span
      className={styles.badge}
      title={m.description}
      style={{ borderColor: m.color }}
    >
      <span className={styles.emoji}>{m.emoji}</span>
      <span className={styles.label}>{m.label}</span>
    </span>
  );
}

interface TestCovBadgeProps {
  cov: TestCovKeyword;
}

export function TestCovBadge({ cov }: TestCovBadgeProps): React.ReactElement {
  const m = TEST_COV_META[cov];
  return (
    <span
      className={styles.badge}
      title={m.description}
      style={{ borderColor: m.color }}
    >
      <span className={styles.emoji}>{m.emoji}</span>
      <span className={styles.label}>{m.label}</span>
    </span>
  );
}

/**
 * Combined three-axis status badge — lifecycle + tier + test-coverage.
 * Drop into a docs page header to give readers a one-glance picture.
 */
export interface ModuleStatusProps {
  lifecycle: LifecycleKeyword;
  version?: string;
  tier: TierKeyword;
  cov: TestCovKeyword;
}

export default function ModuleStatus({
  lifecycle,
  version,
  tier,
  cov,
}: ModuleStatusProps): React.ReactElement {
  return (
    <span className={styles.combined}>
      <LifecycleBadge lifecycle={lifecycle} version={version} />
      <TierBadge tier={tier} />
      <TestCovBadge cov={cov} />
    </span>
  );
}
