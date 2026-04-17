import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';
import styles from './index.module.css';

/**
 * Verum hero mark — the prismatic "V" softly floating inside a layered
 * cyberpunk bloom. Three stacked halos (outer violet/cyan cloud, middle
 * magenta/cyan chromatic separation, inner warm gold core) are each
 * heavily blurred and animated on staggered periods. The logo itself
 * drifts on a 3-axis float so it reads as suspended in light.
 */
function VerumMark() {
  return (
    <div className={styles.mark} aria-hidden={false}>
      <div className={styles.markHaloOuter} />
      <div className={styles.markHaloMid}   />
      <div className={styles.markHaloCore}  />
      <img
        src="/img/verum-logo-512.png"
        alt="Verum"
        className={styles.markImage}
        loading="eager"
        decoding="async"
      />
    </div>
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
          <VerumMark />
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
      'Seven verification strategies — runtime, static, fast, formal, thorough, certified, synthesize. ' +
      'You declare the intent; the compiler picks the technique. ' +
      'Refinement predicates compile to SMT obligations dispatched through a capability router, ' +
      'with tactic fallback and portfolio cross-validation for the strongest tiers.',
    code: `// Same body, three guarantee levels — pick per function.
type NonNeg is Int { self >= 0 };

@verify(runtime)
fn abs_r(x: Int) -> NonNeg {
    if x >= 0 { x } else { -x }        // assert at runtime
}

@verify(formal)
fn abs_f(x: Int) -> NonNeg {
    if x >= 0 { x } else { -x }        // proved by the SMT backend
}

@verify(certified)
fn abs_c(x: Int) -> NonNeg {
    if x >= 0 { x } else { -x }        // + proof embedded in the .cog
}`,
  },
  {
    title: 'One context system for everything',
    accent: '#db2777',
    blurb:
      'Runtime DI and compile-time meta share one \`using [...]\` grammar. ' +
      'Database, Logger, Clock at runtime; TypeInfo, BuildAssets, Schema at compile time. ' +
      '14 meta-contexts, 10 standard runtime contexts, one lookup rule, ~2 ns for an inline slot.',
    code: `// Runtime: caller provides Database and Logger.
fn handle(req: &Request) -> Response
    using [Database, Logger]
{
    Logger.info(f"{req.method} {req.path}");
    let user = Database.find_user(req.auth)?;
    Response.ok(&user)
}

// Compile time: the compiler provides TypeInfo and CompileDiag.
meta fn field_count<T>() -> Int using [TypeInfo] {
    TypeInfo.fields_of<T>().len()
}`,
  },
  {
    title: 'Types that carry proof obligations to zero-cost discharge',
    accent: '#14b8a6',
    blurb:
      'A refinement predicate is part of the type — not a comment, not a linter, not a separate tool. ' +
      '\`Int { self > 0 }\` flows through inference, narrows via control flow, discharges to SMT, ' +
      'reflects user \`@logic\` functions as axioms, falls back to tactics when SMT can\u2019t — ' +
      'and the proof embeds in the binary as a certificate exportable to Coq or Lean. Zero runtime cost.',
    code: `type Sorted<T: Ord> is List<T> { self.is_sorted() };

@logic
fn is_sorted<T: Ord>(xs: &List<T>) -> Bool {
    forall i in 0..xs.len() - 1. xs[i] <= xs[i + 1]
}

@verify(formal)
fn insert<T: Ord>(xs: Sorted<T>, x: T) -> Sorted<T>
    where ensures is_sorted(&result)
{
    let pos = xs.partition_point(|y| *y < x);
    xs.insert(pos, x)    // sortedness preserved — proved at compile time
}`,
  },
  {
    title: 'Three-tier references without language fragmentation',
    accent: '#f59e0b',
    blurb:
      '\`&T\` (CBGR-checked, ~15 ns), \`&checked T\` (compiler-proven, 0 ns), \`&unsafe T\` (you prove it, 0 ns). ' +
      'All three are the same type family — chosen per-use-site, not per-language-dialect. ' +
      'Escape analysis auto-promotes the hot-path fraction of \`&T\` to \`&checked T\`.',
    code: `fn sum_ages(users: &List<User>) -> Int {
    let mut total = 0;
    for u in users.iter() {              // &u: &User — ~15 ns CBGR check
        let age: &checked Int = &checked u.age;
        total += *age;                   //  0 ns — compiler proved safe
    }
    total
}

// $ verum analyze --escape
// sum_ages:  4 / 5 references promoted to &checked  (80 %)`,
  },
];

function PillarCard({pillar}: {pillar: typeof PILLARS[number]}) {
  return (
    <div className={styles.pillarCard} style={{'--accent': pillar.accent} as React.CSSProperties}>
      <div className={styles.pillarAccent} />
      <h3 className={styles.pillarTitle}>{pillar.title}</h3>
      <p className={styles.pillarBlurb}>{pillar.blurb}</p>
      <div className={styles.pillarCode}>
        <CodeBlock language="verum">{pillar.code}</CodeBlock>
      </div>
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
    body: 'CAP_READ, CAP_WRITE, CAP_EXECUTE, CAP_DELEGATE, CAP_REVOKE, CAP_BORROWED, CAP_MUTABLE, CAP_NO_ESCAPE. Capabilities only attenuate — never expand. One AND + one branch per check.',
  },
  {
    icon: '0',
    title: 'Pure-Verum standard library',
    body: 'No Rust runtime, no libc, no pthread. Syscalls, atomics, I/O, and clocks go through VBC opcodes directly (0xF1 / 0xF2 / 0xF4 / 0xF5). The CBGR allocator lives in core/mem — no malloc underneath.',
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
