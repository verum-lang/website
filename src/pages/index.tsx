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

const HERO_CODE = `// 1. Refinement types — invariants live in the type system
type Port      is Int { 1 <= self && self <= 65535 };
type NonEmpty<T> is List<T> { self.len() > 0 };

// 2. Architectural type — every cog declares its trust shape
@arch_module(
    lifecycle: Lifecycle.Theorem("v1.0"),
    exposes:   [Capability.Network(Tcp, Inbound)],
    requires:  [Capability.Read(Logger)],
    preserves: [BoundaryInvariant.AuthenticatedFirst],
)
module my_app.api;

// 3. Explicit dependencies — runtime DI typed at compile time
async fn serve(routes: NonEmpty<Route>) -> Result<(), Error>
    using [Logger, Config]
{
    let port: Port = Config.get_int("port").unwrap_or(8080);
    Logger.info(f"listening on :{port}");

    // 4. Structured concurrency — no task outlives its scope
    nursery(on_error: cancel_all) {
        for route in routes.iter() {
            spawn accept_loop(route.clone());
        }
    }
}

// 5. Verification ladder — same function, stronger proof at higher ν-ordinal
@verify(certified)
fn find<T: Eq>(xs: &NonEmpty<T>, key: &T) -> Maybe<Int>
    where ensures result is Some(i) => xs[i] == *key
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
            A verifiable systems language with architecture-as-types.
          </p>
          <p className={styles.heroDesc}>
            Prototype with runtime checks. Harden with refinements.
            Prove with SMT. Re-check with two independent kernels.
            Type your <em>architecture</em>, not just your values.
            Same language, smooth migration, one annotation apart.
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
    title: 'Thirteen-strategy verification ladder',
    accent: '#a78bfa',
    blurb:
      'Strategies indexed by countable ordinals (ν-ordinal) — strict-monotone from runtime to certified to synthesise. ' +
      'Pick the strongest tier that fits your time budget. Refinement predicates compile to SMT obligations dispatched ' +
      'through a capability router (Z3 + CVC5 + dependent + exhaustiveness backends); ' +
      'tactic fallback when SMT cannot close; portfolio cross-validation at `reliable`; certificate export at `certified`.',
    code: `// Same body, three tiers — pick per function.
type NonNeg is Int { self >= 0 };

@verify(runtime)        // ν = 0  — runtime assertion
fn abs_r(x: Int) -> NonNeg {
    if x >= 0 { x } else { -x }
}

@verify(formal)         // ν = ω  — portfolio SMT
fn abs_f(x: Int) -> NonNeg {
    if x >= 0 { x } else { -x }
}

@verify(certified)      // ν = ω·2 + 2 — proof embedded + recheck
fn abs_c(x: Int) -> NonNeg {
    if x >= 0 { x } else { -x }
}

@verify(coherent)       // ν = ω·2 + 5 — α/ε bidirectional check
fn abs_coh(x: Int) -> NonNeg {
    if x >= 0 { x } else { -x }
}`,
  },
  {
    title: 'Architecture-as-Types (ATS-V) — eight typed primitives',
    accent: '#10b981',
    blurb:
      'A cog declares its architectural intent — capability, boundary, composition, lifecycle, foundation, tier, stratum, ' +
      'shape — in a single typed annotation. The compiler checks the body against the Shape; cross-cog graph against ' +
      'the composition algebra; the 32-pattern anti-pattern catalog against the project. Architectural drift becomes ' +
      'an RFC-coded compile error, not a code-review gap.',
    code: `@arch_module(
    foundation:    Foundation.ZfcTwoInacc,
    stratum:       MsfsStratum.LFnd,
    lifecycle:     Lifecycle.Theorem("v3.2"),
    at_tier:       Tier.Aot,
    exposes:       [Capability.Read(Database("ledger")),
                    Capability.Network(Grpc, Outbound)],
    requires:      [Capability.Read(Logger)],
    preserves:     [BoundaryInvariant.AllOrNothing,
                    BoundaryInvariant.AuthenticatedFirst],
    composes_with: ["payment.fraud", "payment.audit"],
    strict:        true,
)
module payment.settlement;
// AP-001..AP-032 enforced; verum audit --bundle reports
// L4 load-bearing across architectural shape, anti-patterns,
// counterfactuals, adjunctions.`,
  },
  {
    title: 'Two independent kernels with continuous differential testing',
    accent: '#f43f5e',
    blurb:
      'Verum is the first production proof assistant to ship two algorithmic kernels. The trusted base ' +
      '(`proof_checker.rs`, < 1K LOC, six minimal CoC rules) checks every certificate. The NbE kernel ' +
      '(`proof_checker_nbe.rs`, normalisation-by-evaluation, structurally distinct algorithm) checks the same. ' +
      'Mutation fuzz over an 11-variant grammar runs on every audit; a synthetic always-accept pin verifies the ' +
      'check is non-vacuous. Disagreement on any certificate fails the audit.',
    code: `$ verum audit --differential-kernel
  K-Pi-Form         BothAccept   ✓
  K-Sigma-Form      BothAccept   ✓
  K-Path-Form       BothAccept   ✓
  K-Refine          BothAccept   ✓
  K-Universe        BothAccept   ✓
  K-SMT-Replay      BothAccept   ✓
  K-Framework-Axiom BothAccept   ✓

  10 / 10 BothAccept · 0 disagreements
  verdict: load-bearing

$ verum audit --differential-kernel-fuzz
  500 mutants · 0 disagreements · 0.4s
  liveness pin: synthetic disagrees as expected ✓`,
  },
  {
    title: 'MSFS-grounded structured Gödel-2nd escape',
    accent: '#0ea5e9',
    blurb:
      'Trust delegation is enumerable. Three-layer kernel: kernel_v0 (10-rule Verum bootstrap, hand-auditable) + ' +
      'proof_checker (Rust trusted base, 6 rules) + KernelRuleId audit registry (7 canonical rules with ZFC + κ ' +
      'decomposition). Reflection-tower meta-soundness in four MSFS-grounded stages — Theorem 9.6 collapses iterated ' +
      'reflection, Theorem 8.2 bounds the tower by one extra inaccessible, Theorem 5.1 (AFN-T α) seals the absolute ' +
      'boundary as empty. No unbounded ordinal hierarchy needed.',
    code: `$ verum audit --reflection-tower
  REF^0   — Base                ✓ kernel_meta_soundness_holds
  REF^≥1  — Stable              ✓ MSFS Theorem 9.6
  REF^ω   — Bounded             ✓ MSFS Theorem 8.2 (≤ 3 inaccessibles)
  REF^Abs — Boundary empty      ✓ MSFS Theorem 5.1 (AFN-T α)

  4 / 4 stages discharged
  project required minimum: REF^0 (ZFC + 2·κ)
  verdict: load-bearing

$ verum audit --framework-axioms
  11 frameworks · 71 axioms · all cited
  lurie_htt (8) · schreiber_dcct (5) · diakrisis_acts (16) ...`,
  },
  {
    title: 'One context system unifies runtime DI and compile-time meta',
    accent: '#db2777',
    blurb:
      'The same `using [...]` grammar drives both runtime dependency injection (Database, Logger, Clock, FileSystem, ' +
      'Random — 10 standard contexts) and compile-time meta-programming (TypeInfo, AstAccess, CodeSearch, Schema, ' +
      'DepGraph, Hygiene — 14 meta-contexts, 230+ stage-aware methods). One lookup rule, ~5–30 ns per runtime ' +
      'resolution, zero cost at compile time. No hidden globals, no thread-locals, no ambient state.',
    code: `// Runtime: caller provides Database and Logger.
fn handle(req: &Request) -> Response
    using [Database, Logger]
{
    Logger.info(f"{req.method} {req.path}");
    let user = Database.find_user(req.auth)?;
    Response.ok(&user)
}

// Compile time: the compiler provides TypeInfo + CompileDiag.
meta fn field_count<T>() -> Int using [TypeInfo] {
    TypeInfo.fields_of<T>().len()
}`,
  },
  {
    title: 'Three-tier references — pay only for what you cannot prove',
    accent: '#f59e0b',
    blurb:
      '\`&T\` (CBGR-checked, ~0.93 ns measured), \`&checked T\` (compiler-proven, 0 ns), \`&unsafe T\` (you prove it, ' +
      '0 ns). Same type family — chosen per-use-site, not per-language-dialect. Escape analysis routinely ' +
      'auto-promotes 50–90 % of \`&T\` to \`&checked T\` on the hot path. ' +
      'CBGR fat-pointer: 16 bytes, generation-tag + epoch-capabilities — one AND + one branch per check.',
    code: `fn sum_ages(users: &List<User>) -> Int {
    let mut total = 0;
    for u in users.iter() {              // &u: &User — ~0.93 ns CBGR
        let age: &checked Int = &checked u.age;
        total += *age;                   //  0 ns — compiler proved safe
    }
    total
}

// $ verum analyze --escape
// sum_ages: 4 / 5 references promoted to &checked  (80 %)`,
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
          Six integrated design decisions that change how you write, verify, and ship systems code.
          No features borrowed from research papers — research brought to production, compiled,
          linked, and shipped as a single binary.
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
        <h2>One example. Five integrated features.</h2>
        <p>
          Refinement types in the signature. Architectural type carrying capability, boundary,
          and lifecycle claims. Explicit context dependencies. Structured concurrency with
          cancellation. A postcondition the compiler proves and re-checks through two
          independent kernels. Zero runtime cost for the verification.
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
    body: 'Int { self > 0 }, List<T> { self.is_sorted() }, Text { self.matches(rx#"...") }. Predicates checked by SMT, erased at runtime. Not a linter — a type. @logic functions reflect into solver axioms.',
  },
  {
    icon: '⊢',
    title: 'Three-layer kernel + two-kernel differential',
    body: 'kernel_v0 (10-rule Verum bootstrap) + proof_checker.rs (6-rule Rust trusted base, < 1K LOC) + KernelRuleId audit registry (7 canonical rules). Continuous differential testing between proof_checker and proof_checker_nbe with mutation fuzz.',
  },
  {
    icon: '@',
    title: 'Architecture-as-Types (ATS-V)',
    body: 'Eight typed primitives: Capability / Boundary / Composition / Lifecycle / Foundation / Tier / Stratum / Shape. 32-pattern anti-pattern catalog (AP-001..AP-032). Counterfactual reasoning + adjunction analyzer + Yoneda checker. Architectural drift becomes a compile error.',
  },
  {
    icon: '[Т]',
    title: 'CVE 7-symbol Lifecycle taxonomy',
    body: 'Every cog carries a canonical CVE status: [Т] Theorem (КВИ⁺ full closure) / [О] Definition / [С] Conditional / [П] Postulate / [Г] Hypothesis / [И] Interpretation / [✗] Retracted. Lifecycle ordering enforced across the citation graph; transitive regression detected.',
  },
  {
    icon: 'Π',
    title: 'Dependent + cubical types',
    body: 'Tensor<T, [B,H,L,D]> with compile-time matmul shape checks. Path types and cubical HoTT (PathTy / HComp / Transp / Glue) for equational reasoning. Univalence via Glue. Quotient inductive types.',
  },
  {
    icon: 'θ',
    title: '14 compile-time meta-contexts',
    body: 'TypeInfo, AstAccess, CodeSearch, Schema, DepGraph, Hygiene + 8 more — the same using [...] as runtime DI. 230+ methods across them, stage-aware, deterministic by construction.',
  },
  {
    icon: '&',
    title: 'Eight-capability monotonic references',
    body: 'CAP_READ, CAP_WRITE, CAP_EXECUTE, CAP_DELEGATE, CAP_REVOKE, CAP_BORROWED, CAP_MUTABLE, CAP_NO_ESCAPE. Capabilities only attenuate — never expand. CBGR check costs ~0.93 ns; escape analysis auto-promotes 50–90 % of references to zero-cost.',
  },
  {
    icon: '0',
    title: 'No-libc Tier-0 / Tier-1',
    body: 'No Rust runtime, no libc, no pthread. Linux: direct syscalls. macOS: libSystem.B.dylib only. Windows: kernel32.dll + ntdll.dll. Atomics, I/O, clocks via VBC opcodes (0xF1 / 0xF2 / 0xF4 / 0xF5). CBGR allocator in core/mem — no malloc.',
  },
  {
    icon: '⊙',
    title: '56-tactic stdlib + tactic DSL',
    body: 'auto, simp, ring, field, omega, blast, smt, induction, cases, rewrite, unfold, apply, exact, intros, cubical, category_simp, category_law, descent_check + 33 more across 7 cogs. Cog-level tactic-package registry (Project > ImportedCog > Stdlib shadowing). When SMT cannot close, you help.',
  },
  {
    icon: '11',
    title: '11 framework packages, 71 axioms',
    body: 'lurie_htt (8) · schreiber_dcct (5) · connes_reconstruction (8) · petz_classification (4) · arnold_catastrophe (8) · baez_dolan (4) · diakrisis (6) · diakrisis_acts (16) · diakrisis_biadjunction (2) · diakrisis_extensions (4) · diakrisis_stack_model (6). Every cited axiom enumerable in verum audit --framework-axioms.',
  },
  {
    icon: '⇌',
    title: 'Interpreter and AOT from the same VBC bytecode',
    body: 'VBC-first: instant startup via interpreter for dev, LLVM AOT for production. Same semantics, same CBGR, same context stack. verum run (instant) and verum build --release (0.85-0.95x C) are one flag apart. GPU lowering via MLIR for tensor ops.',
  },
  {
    icon: '~45',
    title: 'Audit catalog: ~45 gates in 8 bands',
    body: 'Kernel-soundness (10) · ATS-V (6) · framework + citation (10) · hygiene + coherence (8) · cross-format + export (3) · roadmap + coverage (6) · tooling (3) · aggregator (1). verum audit --bundle aggregates them all into a single L4 load-bearing verdict.',
  },
];

function Features() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Under the surface</h2>
        <p>
          The full capability surface of the Verum platform — every claim
          here is mechanically observable at audit time.
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
        <h2>Start with runtime checks. End with a load-bearing audit.</h2>
        <p>
          Download the <code>verum</code> binary. Write a refinement type.
          Add <code>@arch_module(...)</code>. Add <code>@verify(formal)</code>.
          Run <code>verum audit --bundle</code>. The compiler proves —
          and two independent kernels re-check — what your comments used
          to merely claim.
        </p>
        <div className={styles.heroButtons}>
          <Link className="button button--primary button--lg" to="/docs/getting-started/installation">
            Download Verum
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/getting-started/tour">
            Language Tour
          </Link>
          <Link className="button button--link button--lg" to="/docs/architecture-types">
            Architecture-as-Types
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): React.ReactElement {
  return (
    <Layout
      title="Verum — A verifiable systems language with architecture-as-types"
      description="Verum: 13-strategy gradual verification, three-layer trusted kernel with continuous differential testing, MSFS-grounded reflection tower, eight-primitive architecture-as-types, three-tier memory safety, unified context system. Z3 + CVC5 capability-routed SMT. ~45 audit gates aggregated into a single L4 load-bearing verdict."
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
