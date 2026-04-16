import React, {useEffect, useRef, useState} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import styles from './index.module.css';

/**
 * Witness — Curry-Howard, operationalised.
 *
 * Four pillars bear the four judgement forms:
 *   Σ TYPES    — refinement = dependent sum
 *   θ CONTEXT  — environment / context-modal
 *   & MEMORY   — locality witness (CBGR generation)
 *   ⊢ PROOF    — propositional entailment
 *
 * Particles stream inward — evidence converging on the witness.
 */
function WitnessVisualization() {
  const [t, setT] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const tick = () => {
      setT((performance.now() - start) / 1000);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  const R = 150;
  const RIM = R * 1.18;
  const pulse     = Math.sin(t * 0.9) * 0.5 + 0.5;
  const slowPulse = Math.sin(t * 0.3) * 0.5 + 0.5;
  const breath    = Math.sin(t * 0.45) * 0.035 + 1;

  const toXY = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  };
  const arcPath = (r: number, fromDeg: number, toDeg: number) => {
    const s = toXY(r, fromDeg);
    const e = toXY(r, toDeg);
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 0 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };

  const pillars = [
    { name: 'TYPES',   from: 270, to: 360, midDeg: 315, color: '#14b8a6', glyph: 'Σ', offset: 0.00 },
    { name: 'CONTEXT', from:   0, to:  90, midDeg:  45, color: '#db2777', glyph: 'θ', offset: 0.25 },
    { name: 'MEMORY',  from:  90, to: 180, midDeg: 135, color: '#a78bfa', glyph: '&', offset: 0.50 },
    { name: 'PROOF',   from: 180, to: 270, midDeg: 225, color: '#f59e0b', glyph: '⊢', offset: 0.75 },
  ];

  const junctions = [
    { label: 'effect types',     deg:   0, color: '#e11d48' },
    { label: 'capability refs',  deg:  90, color: '#9333ea' },
    { label: 'proof-carrying',   deg: 180, color: '#c2410c' },
    { label: 'refinement types', deg: 270, color: '#0d9488' },
  ];

  const verificationRings = [
    { f: 0.42, label: 'runtime'   },
    { f: 0.58, label: 'static'    },
    { f: 0.73, label: 'formal'    },
    { f: 0.86, label: 'thorough'  },
    { f: 1.00, label: 'certified' },
  ];

  const PARTICLES_PER_PILLAR = 3;
  const LIFETIME = 4.0;
  const particles = pillars.flatMap((p, pi) =>
    Array.from({ length: PARTICLES_PER_PILLAR }, (_, i) => {
      const raw = t / LIFETIME + p.offset + i / PARTICLES_PER_PILLAR;
      const phase = raw - Math.floor(raw);
      const r = RIM * (1 - phase);
      const aRad = (p.midDeg * Math.PI) / 180;
      const aWobble = Math.sin(phase * Math.PI) * 0.09;
      const x = r * Math.cos(aRad + aWobble);
      const y = r * Math.sin(aRad + aWobble);
      const opacity = Math.sin(phase * Math.PI);
      const size = 1.8 + phase * 1.6;
      return { x, y, opacity, size, color: p.color, phase, key: `${pi}-${i}` };
    })
  );

  const absorbing = particles.filter(p => p.phase > 0.85).length;
  const witnessBoost = Math.min(absorbing * 0.12, 0.5);

  return (
    <svg viewBox="-240 -240 480 480" className={styles.prism}
         aria-label="Verum — evidence converging on a witness">
      <defs>
        <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#fcd34d" stopOpacity="1" />
          <stop offset="35%" stopColor="#db2777" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ambient" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#a78bfa" stopOpacity="0.12" />
          <stop offset="70%" stopColor="#7c3aed" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="0" cy="0" r="230" fill="url(#ambient)" />
      {verificationRings.map((r, i) => (
        <circle key={`ring-${r.label}`} cx="0" cy="0" r={R * r.f}
          fill="none" stroke="currentColor"
          strokeOpacity={0.06 + (i === verificationRings.length - 1 ? 0.04 : 0)}
          strokeWidth={i === verificationRings.length - 1 ? 1 : 0.8}
          strokeDasharray={i === verificationRings.length - 1 ? 'none' : '2 5'} />
      ))}
      {verificationRings.map((r) => {
        const pos = toXY(R * r.f, 202);
        return (
          <text key={`lbl-${r.label}`} x={pos.x} y={pos.y + 3} textAnchor="middle"
            fill="currentColor" opacity="0.28" fontSize="6.5"
            fontFamily="JetBrains Mono, monospace" letterSpacing="1.2">
            {r.label}
          </text>
        );
      })}
      <g style={{ transform: `scale(${breath})`, transformOrigin: 'center', transformBox: 'fill-box' }}>
        {pillars.map((p) => {
          const phase = Math.sin(t * 0.8 + p.offset * 4) * 0.5 + 0.5;
          return (
            <path key={`arc-${p.name}`} d={arcPath(R, p.from, p.to)}
              stroke={p.color} strokeWidth={2.5 + phase * 1.5} strokeOpacity="0.85"
              fill="none" strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 ${5 + phase * 8}px ${p.color})` }} />
          );
        })}
      </g>
      {pillars.map((p) => {
        const out = toXY(R * 1.05, p.midDeg);
        return <line key={`spoke-${p.name}`} x1="0" y1="0" x2={out.x} y2={out.y}
          stroke={p.color} strokeOpacity="0.07" strokeWidth="1" />;
      })}
      {junctions.map((j, i) => {
        const p = toXY(R, j.deg);
        const phase = Math.sin(t * 1.3 + i * 1.57) * 0.5 + 0.5;
        return (
          <g key={`junc-${j.label}`}>
            <circle cx={p.x} cy={p.y} r={11 + phase * 3} fill={j.color} fillOpacity="0.18" />
            <circle cx={p.x} cy={p.y} r={4 + phase * 1.4} fill={j.color} fillOpacity="1"
              style={{ filter: `drop-shadow(0 0 10px ${j.color})` }} />
          </g>
        );
      })}
      {junctions.map((j) => {
        const pos = toXY(R * 0.66, j.deg);
        return (
          <text key={`syn-${j.label}`} x={pos.x} y={pos.y + 3} textAnchor="middle"
            fill="currentColor" opacity="0.5" fontSize="8" fontStyle="italic"
            fontFamily="Fraunces, Iowan Old Style, serif">
            {j.label}
          </text>
        );
      })}
      {particles.map((p) => (
        <g key={`pt-${p.key}`}>
          <circle cx={p.x} cy={p.y} r={p.size * 1.8} fill={p.color} opacity={p.opacity * 0.25} />
          <circle cx={p.x} cy={p.y} r={p.size} fill={p.color} opacity={p.opacity}
            style={{ filter: `drop-shadow(0 0 ${4 + p.size}px ${p.color})` }} />
        </g>
      ))}
      {pillars.map((p) => {
        const glyphPos = toXY(RIM * 1.06, p.midDeg);
        const labelPos = toXY(RIM * 1.26, p.midDeg);
        return (
          <g key={`gly-${p.name}`}>
            <text x={glyphPos.x} y={glyphPos.y + 7} textAnchor="middle"
              fill={p.color} opacity="0.9" fontSize="22"
              fontFamily="Fraunces, Iowan Old Style, serif" fontStyle="italic" fontWeight="500"
              style={{ filter: `drop-shadow(0 0 8px ${p.color}66)` }}>
              {p.glyph}
            </text>
            <text x={labelPos.x} y={labelPos.y + 4} textAnchor="middle"
              fill="currentColor" opacity="0.62" fontSize="9"
              fontFamily="JetBrains Mono, monospace" fontWeight="700" letterSpacing="2.5">
              {p.name}
            </text>
          </g>
        );
      })}
      <g>
        <circle cx="0" cy="0" r={(38 + witnessBoost * 32) * breath}
          fill="url(#coreGlow)" opacity={0.55 + slowPulse * 0.2 + witnessBoost * 0.4} />
        <circle cx="0" cy="0" r={9 + pulse * 1.8 + witnessBoost * 4} fill="#fcd34d" opacity="0.95" />
        <circle cx="0" cy="0" r="3" fill="#ffffff" />
      </g>
    </svg>
  );
}

const HERO_CODE = `type Positive is Int { self > 0 };

fn transfer(from: &mut Account, to: &mut Account, amount: Positive)
    using [Database, Logger]
    where requires from.balance >= amount,
          ensures  from.balance == old(from.balance) - amount,
          ensures  to.balance   == old(to.balance)   + amount
{
    from.balance -= amount;
    to.balance   += amount;
    Logger.info(f"transferred {amount}");
}

@verify(certified)
fn consensus_round(state: &mut State) -> Proof<StateValid>
    using [Network, Clock]
    where ensures is_valid(result, state)
{ ... }`;

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroText}>
          <h1 className={styles.heroTitle}>
            <span className="verum-gradient-text">Verum</span>
          </h1>
          <p className={styles.heroTagline}>
            A systems language where verification meets you where you are.
          </p>
          <p className={styles.heroDesc}>
            Prototype with runtime checks. Harden with static analysis.
            Prove with SMT. Ship with machine-checked certificates.
            Same language, smooth migration, one <code>@verify</code> annotation apart.
          </p>
          <div className={styles.heroButtons}>
            <Link className="button button--primary button--lg" to="/docs/intro">
              Get Started
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/getting-started/tour">
              Language Tour
            </Link>
            <Link className="button button--link button--lg" to="/docs/philosophy/principles">
              Why Verum?
            </Link>
          </div>
        </div>
        <div className={styles.heroVis}>
          <WitnessVisualization />
        </div>
      </div>
    </header>
  );
}

const PILLARS = [
  {
    title: 'Gradual verification as a language primitive',
    accent: '#a78bfa',
    blurb:
      'Nine verification strategies from @verify(runtime) to @verify(certified). ' +
      'You declare the intent; the compiler picks the solver. Z3, CVC5, tactic search, or portfolio ' +
      '— routed automatically by the capability router based on the obligation\'s theory mix.',
    code: `@verify(runtime)    fn prototype() { ... }  // assertions only
@verify(formal)     fn production() { ... }  // SMT, auto-routed
@verify(thorough)   fn critical()   { ... }  // Z3 + CVC5 raced
@verify(certified)  fn kernel()     { ... }  // cross-validated proof`,
  },
  {
    title: 'One context system for everything',
    accent: '#db2777',
    blurb:
      'Runtime DI and compile-time meta use the same using [...] syntax. ' +
      'Database, Logger, Clock at runtime; TypeInfo, BuildAssets, Schema at compile time. ' +
      '14 meta-contexts, 10 standard runtime contexts, same scoping rules, same negative constraints.',
    code: `// Runtime — provider explicit at call site
fn handle(req: Request) -> Response
    using [Database, Logger, Clock] { ... }

// Compile-time — provider is the compiler
meta fn derive_eq<T>() -> TokenStream
    using [TypeInfo, AstAccess, CompileDiag] { ... }`,
  },
  {
    title: 'Types that carry proof obligations to zero-cost discharge',
    accent: '#14b8a6',
    blurb:
      'A refinement predicate is part of the type — not a comment, not a linter, not a separate tool. ' +
      'Int { self > 0 } flows through inference, narrows via control flow, discharges to SMT, ' +
      'reflects user @logic functions as solver axioms, falls back to tactics when SMT can\'t — ' +
      'and the proof embeds in the binary as a certificate exportable to Coq or Lean. Zero runtime cost.',
    code: `type Sorted<T: Ord> is List<T> { self.is_sorted() };

@logic fn is_sorted<T: Ord>(xs: &List<T>) -> Bool {
    forall i in 0..xs.len()-1. xs[i] <= xs[i+1]
}

@verify(formal)
fn insert<T: Ord>(xs: Sorted<T>, x: T) -> Sorted<T>
    where ensures is_sorted(result)
{
    let pos = xs.partition_point(|y| *y < x);
    xs.insert(pos, x)   // SMT proves sortedness is preserved
}`,
  },
  {
    title: 'Three-tier references without language fragmentation',
    accent: '#f59e0b',
    blurb:
      '&T (CBGR-checked, ~15ns), &checked T (compiler-proven, 0ns), &unsafe T (you prove it, 0ns). ' +
      'All three are the same type family — choose per-use-site, not per-language-dialect. ' +
      'Escape analysis promotes 60-95% of &T to &checked T automatically.',
    code: `fn process(data: &List<Record>) {     // Tier 0: ~15ns check
    for r in data.iter() {
        let id: &checked Int = &checked r.id;  // Tier 1: 0ns
        insert(id);
    }
}`,
  },
];

function PillarCard({pillar}: {pillar: typeof PILLARS[number]}) {
  return (
    <div className={styles.pillarCard} style={{'--accent': pillar.accent} as React.CSSProperties}>
      <div className={styles.pillarAccent} />
      <h3 className={styles.pillarTitle}>{pillar.title}</h3>
      <p className={styles.pillarBlurb}>{pillar.blurb}</p>
      <pre className={styles.pillarCode}><code>{pillar.code}</code></pre>
    </div>
  );
}

function Pillars() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>What Verum actually does differently</h2>
        <p>
          Not features borrowed from research papers. Not syntax sugar over known patterns.
          Four integrated design decisions that change how you write and ship systems code.
        </p>
      </div>
      <div className={styles.pillarGrid}>
        {PILLARS.map(p => <PillarCard key={p.title} pillar={p} />)}
      </div>
    </section>
  );
}

function CodeShowcase() {
  return (
    <section className={clsx(styles.section, styles.codeShowcase)}>
      <div className={styles.sectionHeader}>
        <h2>Contracts that the compiler discharges</h2>
        <p>
          Refinement types, preconditions, postconditions, and loop invariants
          become SMT obligations. The capability router picks Z3 or CVC5 by theory.
          Results are cached — change one function, only its obligations re-verify.
        </p>
      </div>
      <div className={styles.codeWrap}>
        <CodeBlock language="verum" showLineNumbers>{HERO_CODE}</CodeBlock>
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: 'Σ',
    title: 'Refinement types in the type system',
    body: 'Int { self > 0 }, List<T> { self.is_sorted() }, Text { self.matches(rx#"...") }. Predicates checked by SMT, erased at runtime. Not a linter — a type.',
  },
  {
    icon: '⊢',
    title: 'Proof-carrying code',
    body: 'VBC archives embed proof certificates. Downstream consumers verify offline without re-running the compiler. Exportable to Coq, Lean, Dedukti, Metamath.',
  },
  {
    icon: 'Π',
    title: 'Dependent types for shape safety',
    body: 'Tensor<T, [B,H,L,D]> with compile-time matmul shape checks. Path types and cubical HoTT for equational reasoning. Proof terms erased before codegen.',
  },
  {
    icon: 'θ',
    title: '14 compile-time meta-contexts',
    body: 'TypeInfo, AstAccess, CodeSearch, Schema, DepGraph, Hygiene — the same using [...] as runtime DI. 335 methods, Tier 0/1 gating, deterministic compilation.',
  },
  {
    icon: '&',
    title: '8-capability monotonic references',
    body: 'READ, WRITE, EXECUTE, DELEGATE, REVOKE, BORROWED, MUTABLE, NO_ESCAPE. Capabilities only attenuate — never expand. One AND + one branch per check.',
  },
  {
    icon: '0',
    title: 'Pure-Verum standard library',
    body: 'Zero C/Rust dependencies. Direct syscalls on Linux, libSystem on macOS, kernel32 on Windows. core/ is allocator-free; std/ adds the CBGR heap.',
  },
];

function Features() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Under the surface</h2>
        <p>
          Research brought to production — not as a paper, but as a toolchain
          that compiles, links, and ships.
        </p>
      </div>
      <div className={styles.featureGrid}>
        {FEATURES.map(f => (
          <div key={f.title} className={styles.featureCard}>
            <div className={styles.featureIcon}>{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className={styles.cta}>
      <div className={styles.ctaInner}>
        <h2>Start with runtime checks. End with proofs.</h2>
        <p>
          Install the toolchain. Write a refinement type. Add <code>@verify(formal)</code>.
          Watch the compiler prove what your comments used to merely claim.
        </p>
        <div className={styles.heroButtons}>
          <Link className="button button--primary button--lg" to="/docs/getting-started/installation">
            Install Verum
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/getting-started/tour">
            Language Tour
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): React.ReactElement {
  return (
    <Layout
      title="Verum — A verifiable systems language"
      description="Verum: gradual verification from runtime checks to machine-checked proofs. Three-tier memory safety. Unified context system for runtime DI and compile-time meta. Z3 + CVC5 capability-routed SMT."
    >
      <Hero />
      <main>
        <Pillars />
        <CodeShowcase />
        <Features />
        <CTA />
      </main>
    </Layout>
  );
}
