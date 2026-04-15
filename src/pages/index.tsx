import React, {useEffect, useRef, useState} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import styles from './index.module.css';

/**
 * Witness — Curry-Howard, operationalised.
 *
 * Verum's deepest commitment is that programs and proofs are one object.
 * Every claim made in code (refinement, contract, capability, locality)
 * requires a constructive witness; the compiler is a witness verifier.
 *
 * The figure shows the constructive act, not a static schema:
 *
 *   ⋅ Four pillars (quarter-arcs) bear the four judgement forms in their
 *     Curry-Howard reading. Each carries a math glyph at its outer rim:
 *
 *        Σ   TYPES    — refinement = dependent sum {x : T | P(x)}
 *        θ   CONTEXT  — environment / context-modal □_C
 *        &   MEMORY   — locality witness (CBGR generation)
 *        ⊢   PROOF    — propositional entailment
 *
 *   ⋅ At each pillar boundary, two judgements unify into a Verum
 *     construct: refinement types, proof-carrying code, capability
 *     references, effect types.
 *
 *   ⋅ Particles stream INWARD along each pillar — evidence converging
 *     on the witness. The central core absorbs them and brightens
 *     proportionally; this is verification, made visible.
 *
 *   ⋅ Faint concentric rings name the verification spectrum
 *     (runtime → static → smt → portfolio → certified).
 *
 * The narrative: a Verum program is constructed FROM evidence, not
 * stated and then proved. The witness is what remains when all four
 * kinds of evidence have converged.
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

  // SVG y is downward: 270° = up, 0° = right, 90° = down, 180° = left.
  // Each pillar carries the math glyph of its judgement form.
  const pillars = [
    { name: 'TYPES',   from: 270, to: 360, midDeg: 315, color: '#14b8a6', glyph: 'Σ', offset: 0.00 },
    { name: 'CONTEXT', from:   0, to:  90, midDeg:  45, color: '#db2777', glyph: 'θ', offset: 0.25 },
    { name: 'MEMORY',  from:  90, to: 180, midDeg: 135, color: '#a78bfa', glyph: '&', offset: 0.50 },
    { name: 'PROOF',   from: 180, to: 270, midDeg: 225, color: '#f59e0b', glyph: '⊢', offset: 0.75 },
  ];

  // Where two judgement domains unify into a Verum construct.
  const junctions = [
    { label: 'effect types',     deg:   0, color: '#e11d48' },   // CONTEXT ↔ TYPES
    { label: 'capability refs',  deg:  90, color: '#9333ea' },   // MEMORY ↔ CONTEXT
    { label: 'proof-carrying',   deg: 180, color: '#c2410c' },   // PROOF ↔ MEMORY
    { label: 'refinement types', deg: 270, color: '#0d9488' },   // TYPES ↔ PROOF
  ];

  const verificationRings = [
    { f: 0.42, label: 'runtime'   },
    { f: 0.58, label: 'static'    },
    { f: 0.73, label: 'smt'       },
    { f: 0.86, label: 'portfolio' },
    { f: 1.00, label: 'certified' },
  ];

  // Inward particle streams — evidence converging on the witness.
  // Each pillar emits a continuous train of particles travelling from
  // its outer rim toward the centre along a slightly curved radial.
  const PARTICLES_PER_PILLAR = 3;
  const LIFETIME = 4.0;
  const particles = pillars.flatMap((p, pi) =>
    Array.from({ length: PARTICLES_PER_PILLAR }, (_, i) => {
      const raw = t / LIFETIME + p.offset + i / PARTICLES_PER_PILLAR;
      const phase = raw - Math.floor(raw); // ∈ [0, 1)
      const r = RIM * (1 - phase);
      const aRad = (p.midDeg * Math.PI) / 180;
      // Gentle inward curve (sine wobble that vanishes at both endpoints)
      const aWobble = Math.sin(phase * Math.PI) * 0.09;
      const x = r * Math.cos(aRad + aWobble);
      const y = r * Math.sin(aRad + aWobble);
      // Bell-curve opacity — fades in at the rim, peaks mid-flight, dims at absorption
      const opacity = Math.sin(phase * Math.PI);
      const size = 1.8 + phase * 1.6;
      return { x, y, opacity, size, color: p.color, phase, key: `${pi}-${i}` };
    })
  );

  // The witness intensifies with each absorption event.
  const absorbing = particles.filter(p => p.phase > 0.85).length;
  const witnessBoost = Math.min(absorbing * 0.12, 0.5);

  return (
    <svg viewBox="-240 -240 480 480" className={styles.prism}
         aria-label="Verum — evidence converging on a witness (Curry-Howard, operationalised)">
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

      {/* Ambient field */}
      <circle cx="0" cy="0" r="230" fill="url(#ambient)" />

      {/* Gradual-verification rings */}
      {verificationRings.map((r, i) => (
        <circle
          key={`ring-${r.label}`}
          cx="0" cy="0" r={R * r.f}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.06 + (i === verificationRings.length - 1 ? 0.04 : 0)}
          strokeWidth={i === verificationRings.length - 1 ? 1 : 0.8}
          strokeDasharray={i === verificationRings.length - 1 ? 'none' : '2 5'}
        />
      ))}

      {/* Verification-level labels along the 202° spoke */}
      {verificationRings.map((r) => {
        const pos = toXY(R * r.f, 202);
        return (
          <text key={`lbl-${r.label}`}
                x={pos.x} y={pos.y + 3} textAnchor="middle"
                fill="currentColor" opacity="0.28"
                fontSize="6.5"
                fontFamily="JetBrains Mono, monospace"
                letterSpacing="1.2">
            {r.label}
          </text>
        );
      })}

      {/* Four pillar arcs — the judgement domains */}
      <g style={{ transform: `scale(${breath})`, transformOrigin: 'center', transformBox: 'fill-box' }}>
        {pillars.map((p) => {
          const phase = Math.sin(t * 0.8 + p.offset * 4) * 0.5 + 0.5;
          return (
            <path
              key={`arc-${p.name}`}
              d={arcPath(R, p.from, p.to)}
              stroke={p.color}
              strokeWidth={2.5 + phase * 1.5}
              strokeOpacity="0.85"
              fill="none"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 ${5 + phase * 8}px ${p.color})` }}
            />
          );
        })}
      </g>

      {/* Faint constructive radii — the directions evidence flows */}
      {pillars.map((p) => {
        const out = toXY(R * 1.05, p.midDeg);
        return (
          <line key={`spoke-${p.name}`}
                x1="0" y1="0" x2={out.x} y2={out.y}
                stroke={p.color} strokeOpacity="0.07" strokeWidth="1" />
        );
      })}

      {/* Synthesis junctions */}
      {junctions.map((j, i) => {
        const p = toXY(R, j.deg);
        const phase = Math.sin(t * 1.3 + i * 1.57) * 0.5 + 0.5;
        return (
          <g key={`junc-${j.label}`}>
            <circle cx={p.x} cy={p.y} r={11 + phase * 3}
                    fill={j.color} fillOpacity="0.18" />
            <circle cx={p.x} cy={p.y} r={4 + phase * 1.4}
                    fill={j.color} fillOpacity="1"
                    style={{ filter: `drop-shadow(0 0 10px ${j.color})` }} />
          </g>
        );
      })}

      {/* Synthesis labels (italic, inside) */}
      {junctions.map((j) => {
        const pos = toXY(R * 0.66, j.deg);
        return (
          <text key={`syn-${j.label}`}
                x={pos.x} y={pos.y + 3} textAnchor="middle"
                fill="currentColor" opacity="0.5"
                fontSize="8" fontStyle="italic"
                fontFamily="Fraunces, Iowan Old Style, serif">
            {j.label}
          </text>
        );
      })}

      {/* Convergent particle streams — evidence flowing inward */}
      {particles.map((p) => (
        <g key={`pt-${p.key}`}>
          <circle cx={p.x} cy={p.y} r={p.size * 1.8}
                  fill={p.color} opacity={p.opacity * 0.25} />
          <circle cx={p.x} cy={p.y} r={p.size}
                  fill={p.color} opacity={p.opacity}
                  style={{ filter: `drop-shadow(0 0 ${4 + p.size}px ${p.color})` }} />
        </g>
      ))}

      {/* Outer-rim judgement glyphs — Σ θ & ⊢ */}
      {pillars.map((p) => {
        const glyphPos = toXY(RIM * 1.06, p.midDeg);
        const labelPos = toXY(RIM * 1.26, p.midDeg);
        return (
          <g key={`gly-${p.name}`}>
            <text x={glyphPos.x} y={glyphPos.y + 7}
                  textAnchor="middle"
                  fill={p.color} opacity="0.9"
                  fontSize="22"
                  fontFamily="Fraunces, Iowan Old Style, serif"
                  fontStyle="italic"
                  fontWeight="500"
                  style={{ filter: `drop-shadow(0 0 8px ${p.color}66)` }}>
              {p.glyph}
            </text>
            <text x={labelPos.x} y={labelPos.y + 4}
                  textAnchor="middle"
                  fill="currentColor" opacity="0.62"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                  letterSpacing="2.5">
              {p.name}
            </text>
          </g>
        );
      })}

      {/* The witness — what evidence converges upon */}
      <g>
        <circle cx="0" cy="0" r={(38 + witnessBoost * 32) * breath}
                fill="url(#coreGlow)"
                opacity={0.55 + slowPulse * 0.2 + witnessBoost * 0.4} />
        <circle cx="0" cy="0" r={9 + pulse * 1.8 + witnessBoost * 4}
                fill="#fcd34d" opacity="0.95" />
        <circle cx="0" cy="0" r="3" fill="#ffffff" />
      </g>
    </svg>
  );
}

const HERO_CODE = `// Verum: refinement types meet systems programming

type NonEmpty<T> is List<T> { self.len() > 0 };

fn head<T>(xs: NonEmpty<T>) -> T using [] {
    xs[0]   // proven safe at compile time — no runtime check
}

@verify(portfolio)   // Z3 + CVC5 cross-validated
fn binary_search(xs: &List<Int>, key: Int) -> Maybe<Int>
    where ensures result is Some(i) => xs[i] == key
{
    let (mut lo, mut hi) = (0, xs.len());
    while lo < hi
        invariant 0 <= lo && hi <= xs.len()
        decreases hi - lo
    {
        let mid = lo + (hi - lo) / 2;
        match xs[mid].cmp(&key) {
            Ordering.Less    => lo = mid + 1,
            Ordering.Greater => hi = mid,
            Ordering.Equal   => return Some(mid),
        }
    }
    None
}`;

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroText}>
          <div className={styles.pill}>
            <span className={styles.pillDot} /> version 0.32 · phase D complete
          </div>
          <h1 className={styles.heroTitle}>
            <span className="verum-gradient-text">Verum</span>
          </h1>
          <p className={styles.heroTagline}>
            A systems language in which a program <em>is</em> its proof —
            and every claim made in code requires a constructive witness
            the compiler can mechanically verify.
          </p>
          <p className={styles.heroDesc}>
            Refinement types. Dependent types. Cubical type theory.
            Dual-solver SMT verification. A three-tier memory model with
            15-nanosecond safety checks. Explicit context instead of hidden globals.
          </p>
          <div className={styles.heroButtons}>
            <Link className="button button--primary button--lg" to="/docs/intro">
              Get Started →
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
    title: 'Types that tell the truth',
    accent: '#14b8a6',
    blurb:
      'List, Text, Map — never Vec, String, HashMap. Types describe meaning, not implementation. ' +
      'Refinement predicates travel with values; contracts become types; types become proofs.',
    code: `type Probability is Float { 0.0 <= self && self <= 1.0 };
type EmailAddr   is Text  { self.matches(rx#"[^@]+@[^@]+") };
type SortedList<T: Ord> is List<T> { self.is_sorted() };`,
  },
  {
    title: 'Gradual verification',
    accent: '#a78bfa',
    blurb:
      'Four verification levels, one language. Prototype at runtime. Harden with static analysis. ' +
      'Prove critical invariants with Z3 and CVC5 — cross-validated via portfolio routing.',
    code: `@verify(runtime)     fn quick()   { ... }   // assertions only
@verify(static)      fn harden()  { ... }   // dataflow + CBGR
@verify(smt)         fn secure()  { ... }   // discharge to SMT
@verify(portfolio)   fn critical(){ ... }   // Z3 + CVC5 + cross-check
@verify(certified)   fn kernel()  { ... }   // machine-checked proof`,
  },
  {
    title: 'Three-tier memory safety',
    accent: '#f59e0b',
    blurb:
      'Start with `&T` — Capability-Based Generational References, 15ns checks, zero UAF. ' +
      'Graduate to `&checked T` when the compiler proves safety — zero overhead. ' +
      'Drop to `&unsafe T` where you need it, with explicit proof obligations.',
    code: `fn default(x: &T)   -> &T         { x }  // ~15ns CBGR check
fn proven (x: &checked T) -> &checked T { x }  // 0ns, compiler-verified
fn escape (x: &unsafe T)  -> &unsafe T  { x }  // 0ns, you prove it`,
  },
  {
    title: 'Contexts instead of globals',
    accent: '#db2777',
    blurb:
      'No hidden singletons. Dependencies flow through typed contexts — injected explicitly ' +
      'at call sites, inherited automatically across async boundaries, erased at runtime when static.',
    code: `fn fetch_user(id: UserId) -> User using [Database, Logger, Cache] {
    let user = Database.query(id)?;
    Logger.info(f"loaded user {id}");
    Cache.put(id, &user);
    user
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
        <h2>Four pillars, one coherent whole</h2>
        <p>
          Verum is not a collection of features stapled together. Each pillar reinforces
          the others: refinement types feed the SMT solver; the memory model preserves
          the invariants SMT proved; contexts carry capabilities that refinements track.
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
        <h2>Proof at compile time. Performance at runtime.</h2>
        <p>
          This function is verified before it ships. The postcondition becomes
          an SMT obligation — discharged by Z3 for linear arithmetic, by CVC5 when
          strings or nonlinearity appear, and cross-validated in portfolio mode.
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
    icon: '◇',
    title: 'Bidirectional type inference',
    body: 'Faster than Algorithm W, aware of refinements, GATs, and higher-kinded types. Type-checks 10K LOC in under 100 ms.',
  },
  {
    icon: '⟐',
    title: 'Dependent types, done',
    body: 'Σ-types, Π-types, path types, HIT path constructors. Cubical normalizer with computational univalence.',
  },
  {
    icon: '✦',
    title: 'Dual SMT backend',
    body: 'Z3 for bitvectors, arrays, optimization. CVC5 for strings, nonlinear arithmetic, SyGuS, finite model finding. Capability-based routing picks the right one automatically.',
  },
  {
    icon: '⊛',
    title: 'Structured concurrency',
    body: '`nursery` scopes, `select`, async contexts that flow across `spawn`, work-stealing executor, cancellation that actually composes.',
  },
  {
    icon: '⟡',
    title: 'Metaprogramming you can read',
    body: 'No `!` macro syntax. `@derive`, `@verify`, multi-stage `quote`/`meta`, capability-gated compile-time execution.',
  },
  {
    icon: '◈',
    title: 'Tooling included',
    body: 'Full LSP, Playbook TUI, REPL, formatter, linter, package registry, incremental compilation, DAP debugger.',
  },
  {
    icon: '⬡',
    title: 'VBC + native codegen',
    body: 'Unified bytecode with 200+ opcodes drives the interpreter and lowers to LLVM IR (+ Metal for GPU) for AOT.',
  },
  {
    icon: '◉',
    title: 'Semantic honesty',
    body: '`List<T>`, `Text`, `Map<K,V>`, `Heap<T>`, `Shared<T>`. No `Vec`, no `String`, no hidden allocations.',
  },
];

function Features() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>What makes Verum distinctive</h2>
        <p>Production-grade implementations of ideas usually found in research languages.</p>
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
        <h2>Ready to write code that's proven correct?</h2>
        <p>
          Install the toolchain, write your first refinement type, and watch the
          compiler prove what your comments used to merely claim.
        </p>
        <div className={styles.heroButtons}>
          <Link className="button button--primary button--lg" to="/docs/getting-started/installation">
            Install Verum
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/reference/grammar-ebnf">
            Read the Grammar
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
      description="Verum is a verifiable systems language with refinement types, dependent types, SMT-backed proofs (Z3 + CVC5), and a three-tier memory safety model."
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
