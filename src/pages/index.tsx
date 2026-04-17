import React, {useEffect, useRef, useState} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import styles from './index.module.css';

/**
 * The Verum Seal.
 *
 * One typing judgement holds the whole language:
 *
 *         Γ  ⊢  e  :  τ
 *         │   │   │    │
 *      context proof term type
 *
 * Four glyphs, at the four cardinal directions, bear those four symbols:
 *
 *         τ  (top)       Σ  types
 *         Γ  (right)     θ  context
 *         e  (bottom)    &  memory / locality of the term
 *         ⊢  (left)      ⊢  derivation
 *
 * Silent concentric rings imply the gradual-verification axis (weaker →
 * stronger) without labelling every rung — the ladder belongs in the docs.
 * Light strokes stream inward from each glyph: evidence converging on the
 * centre, where the four judgements collapse into a single well-typed
 * program. Everything else is deliberately absent.
 */
function VerumSeal() {
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
  const pulse  = Math.sin(t * 0.9) * 0.5 + 0.5;
  const breath = Math.sin(t * 0.45) * 0.025 + 1;

  const toXY = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  };

  // Cardinal placement — each pillar carries one role of the judgement
  // Γ ⊢ e : τ. The glyph on the rim matches the symbol in the centre.
  const pillars = [
    { role: 'τ', name: 'TYPES',   glyph: 'Σ', deg: 270, color: '#14b8a6', offset: 0.00 }, // top
    { role: 'Γ', name: 'CONTEXT', glyph: 'θ', deg:   0, color: '#db2777', offset: 0.25 }, // right
    { role: 'e', name: 'TERM',    glyph: '&', deg:  90, color: '#a78bfa', offset: 0.50 }, // bottom
    { role: '⊢', name: 'PROOF',   glyph: '⊢', deg: 180, color: '#f59e0b', offset: 0.75 }, // left
  ];

  // Three silent rings. Inner = weak claim (runtime check), outer = strongest
  // (machine-checked certificate). No labels — the ladder is shown, not named.
  const rings = [0.45, 0.70, 0.95];

  // Evidence streams — from each glyph inward to the centre.
  const PARTICLES_PER_PILLAR = 2;
  const LIFETIME = 4.2;
  const particles = pillars.flatMap((p, pi) =>
    Array.from({ length: PARTICLES_PER_PILLAR }, (_, i) => {
      const raw = t / LIFETIME + p.offset + i / PARTICLES_PER_PILLAR;
      const phase = raw - Math.floor(raw);
      const r = R * 1.05 * (1 - phase);
      const aRad = (p.deg * Math.PI) / 180;
      const x = r * Math.cos(aRad);
      const y = r * Math.sin(aRad);
      const opacity = Math.sin(phase * Math.PI);
      const size = 1.6 + phase * 1.4;
      return { x, y, opacity, size, color: p.color, phase, key: `${pi}-${i}` };
    })
  );

  const absorbing = particles.filter(p => p.phase > 0.85).length;
  const witnessBoost = Math.min(absorbing * 0.15, 0.4);

  return (
    <svg viewBox="-240 -240 480 480" className={styles.prism}
         aria-label="The Verum seal — one typing judgement Γ ⊢ e : τ with four glyphs.">
      <defs>
        <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#fcd34d" stopOpacity="1" />
          <stop offset="40%"  stopColor="#db2777" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ambient" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#a78bfa" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ambient glow */}
      <circle cx="0" cy="0" r="230" fill="url(#ambient)" />

      {/* Silent verification rings — the gradual ladder, shown but not named */}
      {rings.map((f, i) => (
        <circle key={`r${i}`} cx="0" cy="0" r={R * f} fill="none"
          stroke="currentColor"
          strokeOpacity={0.055 + (i === rings.length - 1 ? 0.035 : 0)}
          strokeWidth={i === rings.length - 1 ? 1 : 0.7}
          strokeDasharray={i === rings.length - 1 ? 'none' : '2 6'} />
      ))}

      {/* Four fine spokes — rays of evidence toward the centre */}
      {pillars.map((p) => {
        const inner = toXY(R * 0.20, p.deg);
        const outer = toXY(R * 0.95, p.deg);
        return (
          <line key={`spoke-${p.name}`}
            x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
            stroke={p.color} strokeOpacity="0.22" strokeWidth="0.8" strokeLinecap="round" />
        );
      })}

      {/* Particle streams */}
      {particles.map((p) => (
        <g key={`pt-${p.key}`}>
          <circle cx={p.x} cy={p.y} r={p.size * 1.6} fill={p.color} opacity={p.opacity * 0.22} />
          <circle cx={p.x} cy={p.y} r={p.size} fill={p.color} opacity={p.opacity}
            style={{ filter: `drop-shadow(0 0 ${3 + p.size}px ${p.color})` }} />
        </g>
      ))}

      {/* Four glyphs on the rim, gently breathing */}
      <g style={{ transform: `scale(${breath})`, transformOrigin: 'center', transformBox: 'fill-box' }}>
        {pillars.map((p) => {
          const glyph = toXY(R * 1.12, p.deg);
          const phase = Math.sin(t * 0.8 + p.offset * 4) * 0.5 + 0.5;
          return (
            <g key={`gly-${p.name}`}>
              <circle cx={glyph.x} cy={glyph.y} r={22}
                fill={p.color} fillOpacity={0.08 + phase * 0.05}
                stroke={p.color} strokeOpacity="0.35" strokeWidth="0.9" />
              <text x={glyph.x} y={glyph.y + 7.5} textAnchor="middle"
                fill={p.color} opacity="0.95" fontSize="20"
                fontFamily="Fraunces, Iowan Old Style, serif" fontStyle="italic" fontWeight="500"
                style={{ filter: `drop-shadow(0 0 6px ${p.color}88)` }}>
                {p.glyph}
              </text>
            </g>
          );
        })}
      </g>

      {/* Pillar names — single line each, well outside the rim, no neighbours to collide with */}
      {pillars.map((p) => {
        const lbl = toXY(R * 1.38, p.deg);
        return (
          <text key={`lbl-${p.name}`} x={lbl.x} y={lbl.y + 3} textAnchor="middle"
            fill="currentColor" opacity="0.48" fontSize="8.5"
            fontFamily="JetBrains Mono, monospace" fontWeight="700" letterSpacing="2.4">
            {p.name}
          </text>
        );
      })}

      {/* Witness core */}
      <g>
        <circle cx="0" cy="0" r={(42 + witnessBoost * 26) * breath}
          fill="url(#coreGlow)" opacity={0.6 + witnessBoost * 0.3} />
        <circle cx="0" cy="0" r={8 + pulse * 1.8 + witnessBoost * 3} fill="#fcd34d" opacity="0.95" />
        <circle cx="0" cy="0" r="2.2" fill="#ffffff" />
      </g>

      {/* The judgement itself, set in mathematical italic. This is the
          whole language in one line; the four glyphs around it name its parts. */}
      <g>
        <text x="0" y="4" textAnchor="middle" fill="currentColor" opacity="0.92"
          fontSize="17" fontFamily="Fraunces, Iowan Old Style, serif" fontStyle="italic"
          letterSpacing="0.12em" fontWeight="500">
          <tspan fill="#db2777">Γ</tspan>
          <tspan dx="6" fill="currentColor" opacity="0.88">⊢</tspan>
          <tspan dx="6" fill="#a78bfa">e</tspan>
          <tspan dx="5" fill="currentColor" opacity="0.6">:</tspan>
          <tspan dx="4" fill="#14b8a6">τ</tspan>
        </text>
      </g>
    </svg>
  );
}

const HERO_CODE = `// 1. Types carry invariants — the compiler enforces them
type Port     is Int  { 1 <= self && self <= 65535 };
type NonEmpty<T> is List<T> { self.len() > 0 };

// 2. Dependencies are visible — no hidden globals
async fn serve(routes: NonEmpty<Route>) -> Result<(), Error>
    using [Logger, Config]
{
    let port: Port = Config.get_int("port").unwrap_or(8080);
    Logger.info(f"listening on :{port}");

    // 3. Structured concurrency — no task outlives its scope
    nursery(on_error: cancel_all) {
        for route in routes.iter() {
            spawn accept_loop(route.clone());
        }
    }
}

// 4. Verification is gradual — same function, stronger proof
@verify(formal)
fn find<T: Eq>(xs: &NonEmpty<T>, key: &T) -> Maybe<Int>
    where ensures result.is_some() => xs[result.unwrap()] == *key
{
    for i in 0..xs.len() {
        if xs[i] == *key { return Maybe.Some(i); }
    }
    Maybe.None
}`;

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
          <VerumSeal />
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
      'Seven verification strategies — runtime, static, formal, fast, thorough, certified, synthesize. ' +
      'You declare the intent; the compiler picks the solver. Z3, CVC5, tactic search, or portfolio ' +
      '— routed automatically by the capability router based on the obligation\'s theory mix.',
    code: `// Same function, four guarantee levels:
fn abs(x: Int) -> Int { self >= 0 } {
    if x >= 0 { x } else { -x }
}

@verify(runtime)   fn abs_r(x: Int) -> Int { self >= 0 } {
    if x >= 0 { x } else { -x }  // assert at runtime
}

@verify(formal)    fn abs_f(x: Int) -> Int { self >= 0 } {
    if x >= 0 { x } else { -x }  // Z3 proves it
}

@verify(certified) fn abs_c(x: Int) -> Int { self >= 0 } {
    if x >= 0 { x } else { -x }  // proof certificate in binary
}`,
  },
  {
    title: 'One context system for everything',
    accent: '#db2777',
    blurb:
      'Runtime DI and compile-time meta share one using [...] grammar. ' +
      'Database, Logger, Clock at runtime; TypeInfo, BuildAssets, Schema at compile time. ' +
      '14 meta-contexts, 10 standard runtime contexts, identical scoping rules, identical negative constraints.',
    code: `// Runtime — caller provides Database, Logger, Clock
fn handle(req: Request) -> Response
    using [Database, Logger, Clock]
{
    Logger.info(f"{req.method} {req.path}");
    let user = Database.query(req.auth)?;
    ok(user)
}

// Compile-time — compiler provides TypeInfo, CompileDiag
meta fn field_count<T>() -> Int using [TypeInfo] {
    TypeInfo.fields_of<T>().len()
}`,
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
    code: `fn sum_ages(users: &List<User>) -> Int {
    let mut total = 0;
    for u in users.iter() {          // &u: &User — ~15ns CBGR check
        let age: &checked Int = &checked u.age;
        total += *age;               // 0ns — compiler proved it safe
    }
    total
}
// verum analyze --escape: sum_ages  promoted 4/5 refs (80%)`,
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
        <h2>One example. Four unique features.</h2>
        <p>
          Refinement types in the signature. Explicit context dependencies.
          Structured concurrency with cancellation. A postcondition the compiler
          proves via SMT. No runtime cost for any of it.
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
    body: 'TypeInfo, AstAccess, CodeSearch, Schema, DepGraph, Hygiene + 8 more — the same using [...] as runtime DI. 230+ methods across them, stage-aware, deterministic by construction.',
  },
  {
    icon: '&',
    title: '8-capability monotonic references',
    body: 'READ, WRITE, EXECUTE, DELEGATE, REVOKE, BORROWED, MUTABLE, NO_ESCAPE. Capabilities only attenuate — never expand. One AND + one branch per check.',
  },
  {
    icon: '0',
    title: 'Pure-Verum standard library',
    body: 'No Rust runtime. Direct syscalls on Linux, libSystem on macOS (Apple\'s stable ABI), kernel32 + ntdll on Windows. The CBGR allocator lives in core/mem — no libc malloc.',
  },
  {
    icon: '⊙',
    title: '22 proof tactics in a systems language',
    body: 'auto, simp, ring, field, omega, blast, smt, trivial, assumption, contradiction, induction, cases, rewrite, unfold, apply, exact, intro(s), cubical, category_simp, category_law, descent_check — plus combinators. When SMT can\'t, you help. No separate prover needed.',
  },
  {
    icon: '⇌',
    title: 'Interpreter and AOT from the same bytecode',
    body: 'VBC-first: instant startup via interpreter for dev, LLVM AOT for production. Same semantics, same CBGR, same context stack. verum run (instant) and verum build --release (0.85-0.95x C) are one flag apart.',
  },
];

function Features() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Under the surface</h2>
        <p>
          Research brought to production — compiled, linked, and shipped
          as a single binary.
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
          Download the <code>verum</code> binary. Write a refinement type.
          Add <code>@verify(formal)</code>. The compiler proves what your
          comments used to merely claim.
        </p>
        <div className={styles.heroButtons}>
          <Link className="button button--primary button--lg" to="/docs/getting-started/installation">
            Download Verum
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
