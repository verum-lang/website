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

const HERO_CODE = `// Plain systems code — no annotations needed.
fn parse_packet(buf: &Bytes) -> Result<Packet, Error> {
    let header = read_header(buf)?;
    if header.magic != MAGIC { return Err(Error.BadMagic); }
    Ok(Packet { header, payload: buf.slice(HEADER_LEN..) })
}

// Add a refinement when an invariant matters.
type Port is Int { 1 <= self && self <= 65535 };

// Add a context when a dependency is explicit.
async fn serve(port: Port) -> Result<(), Error>
    using [Logger]
{
    Logger.info(f"listening on :{port}");
    accept_loop(port).await
}

// Add a proof when correctness is load-bearing.
@verify(formal)
fn binary_search(xs: &List<Int> { self.is_sorted() },
                 target: Int) -> Maybe<Int>
    where ensures (result is Some(i) => xs[i] == target)
{ /* body */ }

// Each level is a single attribute apart. Pay for what you use.`;

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroText}>
          <h1 className={styles.heroTitle}>
            <span className="verum-gradient-text">Verum</span>
          </h1>
          <p className={styles.heroTagline}>
            A systems language with opt-in correctness depth.
          </p>
          <p className={styles.heroDesc}>
            Write idiomatic systems code today. Add refinement types when
            invariants matter, contracts when correctness pays, machine-checked
            proofs when it's load-bearing. The runtime cost of each layer is
            zero unless you ask for it. Same source, smooth migration —
            from microcontroller firmware to a verified theorem corpus.
          </p>
          <div className={styles.heroButtons}>
            <Link className="button button--primary button--lg" to="/docs/intro">
              Get Started
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/getting-started/tour">
              Language Tour
            </Link>
            <Link className="button button--link button--lg" to="/docs/foundations/principles">
              Engineering Principles
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
    title: 'Pay for what you use',
    accent: '#a78bfa',
    blurb:
      'Plain systems code costs you what plain systems code costs anywhere. ' +
      'Refinement types compile to compile-time obligations and erase at runtime. ' +
      'Memory-safety checks live behind a single tier flag — promote them to zero-cost ' +
      'where the compiler can prove the lifetime, keep them where it cannot. ' +
      'Verification is opt-in per function, per module, or per project — never required, ' +
      'never silently penalising the code that does not request it.',
    code: `// 1. Plain code — zero verification machinery.
fn checksum(buf: &Bytes) -> u32 {
    let mut acc: u32 = 0;
    for b in buf.iter() { acc = acc.wrapping_add(*b as u32); }
    acc
}

// 2. Refinement type — checked at compile time, erased at runtime.
type Port is Int { 1 <= self && self <= 65535 };

// 3. Full proof — same body, the compiler proves it.
@verify(formal)
fn safe_index<T>(xs: &NonEmpty<T>, i: Int { 0 <= self && self < xs.len() })
  -> &T
{ &xs[i] }
// No bounds check at runtime. The type system proved it.`,
  },
  {
    title: 'Architecture is a type',
    accent: '#10b981',
    blurb:
      'Architectural intent — what a module is allowed to do, what it depends on, ' +
      'what invariants its boundaries preserve, what stage of maturity it is at — ' +
      'is a typed annotation the compiler enforces. Architectural drift becomes a ' +
      'compile error with a stable diagnostic code, not a code-review gap. The same ' +
      'discipline scales from a single embedded driver to a federation of services.',
    code: `@arch_module(
    lifecycle: Lifecycle.Theorem("v3.2"),
    exposes:   [Capability.Read(Database("ledger")),
                Capability.Network(Grpc, Outbound)],
    requires:  [Capability.Read(Logger)],
    preserves: [BoundaryInvariant.AllOrNothing,
                BoundaryInvariant.AuthenticatedFirst],
    composes_with: ["payment.fraud", "payment.audit"],
    strict:        true,
)
module payment.settlement;
// Capability escalation, boundary violation, lifecycle regression
// — each surfaces as a stable architectural diagnostic at build
// time. Same discipline, embedded driver to federated service.`,
  },
  {
    title: 'Three-tier memory safety',
    accent: '#f59e0b',
    blurb:
      'A safe reference, a compiler-proven safe reference, and an unsafe reference — ' +
      'all the same type family, chosen per use site. The default tier carries a ' +
      'per-access generation check; escape analysis routinely promotes hot-path ' +
      'references to the proven-safe tier with zero residual cost. The unsafe tier ' +
      'is available where you need it (FFI, custom allocators) — and visible to the ' +
      'audit when you use it.',
    code: `fn sum_ages(users: &List<User>) -> Int {
    let mut total = 0;
    for u in users.iter() {           // &u: &User — checked default
        let age: &checked Int = &checked u.age;
        total += *age;                // 0 ns — compiler proved safe
    }
    total
}

// $ verum analyze --escape
// sum_ages: most references promoted to &checked
//   safe by default, zero-cost where provable`,
  },
  {
    title: 'No hidden runtime',
    accent: '#0ea5e9',
    blurb:
      'No language runtime, no hidden allocator, no hidden exception machinery. ' +
      'Tier-0 binaries talk to the OS through the platform-required boundary only — ' +
      'direct syscalls on Linux/FreeBSD, libSystem on macOS, kernel32+ntdll on ' +
      'Windows, bare-metal on embedded. The interpreter and the AOT compiler share ' +
      'the same bytecode — instant startup for development, native-speed binary for ' +
      'production, identical semantics across both.',
    code: `// Embedded build — no malloc, no libc, no stdio.
@no_std
@target("thumbv7em-none-eabihf")
module firmware.uart;

mount sys.mmio;

public fn write_byte(b: u8)
    using [UartRegisters]
{
    while !UartRegisters.tx_empty() {}
    UartRegisters.tx_data.write(b);
}

// Compiles to a microcontroller binary. Same language as
// the verified theorem corpus.`,
  },
  {
    title: 'One context system unifies DI and meta',
    accent: '#db2777',
    blurb:
      'The same `using [...]` clause drives runtime dependency injection (Database, ' +
      'Logger, Clock, FileSystem) and compile-time metaprogramming (TypeInfo, ' +
      'AstAccess, CodeSearch, Schema). One lookup discipline, no hidden globals, no ' +
      'thread-locals, no ambient state. Application developers see a clean DI ' +
      'system; metaprogrammers see a stage-aware reflection layer; both are the ' +
      'same grammar.',
    code: `// Runtime — caller provides Database and Logger.
fn handle(req: &Request) -> Response
    using [Database, Logger]
{
    Logger.info(f"{req.method} {req.path}");
    Database.find_user(req.auth)
        .map(|u| Response.ok(&u))
        .unwrap_or_else(|| Response.unauthorised())
}

// Compile time — the compiler provides TypeInfo.
meta fn field_count<T>() -> Int using [TypeInfo] {
    TypeInfo.fields_of<T>().len()
}`,
  },
  {
    title: 'Verification spans the full ladder',
    accent: '#f43f5e',
    blurb:
      'A spectrum from runtime assertions to fully kernel-checked proofs, indexed ' +
      'by a strictly-monotone ordinal so every step is "at least as strong as the ' +
      'previous". Pick the strongest tier your time budget supports — runtime for ' +
      'prototypes, static for the default, formal for shipped code, certified for ' +
      'safety-critical, synthesise for spec-first. The kernel re-checks every ' +
      'certificate from every solver; two independent algorithmic kernels run in ' +
      'parallel and any disagreement fails the audit.',
    code: `// Same body, different tiers.
type NonNeg is Int { self >= 0 };

@verify(runtime)        // assertion at runtime
fn abs_r(x: Int) -> NonNeg { if x >= 0 { x } else { -x } }

@verify(formal)         // SMT-proved at compile time
fn abs_f(x: Int) -> NonNeg { if x >= 0 { x } else { -x } }

@verify(certified)      // proof certificate exported, kernel re-checks
fn abs_c(x: Int) -> NonNeg { if x >= 0 { x } else { -x } }

// Promote tier when the function lands in a load-bearing role.
// Demote when the role changes back. Single source, smooth migration.`,
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
        <h2>What Verum gives you</h2>
        <p>
          Six engineering decisions that change how you write, verify, and ship
          systems code — without committing you to verification you do not need.
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
        <h2>Same source, four levels of correctness</h2>
        <p>
          Plain code, refinement type, explicit context, formal proof — each level
          is one annotation apart. You stay in the same file, the same syntax, the
          same toolchain.
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
    icon: '⛁',
    title: 'For embedded developers',
    body: 'No runtime, no libc, no allocator. Direct hardware access through typed MMIO registers. Bare-metal targets across ARM Cortex-M, RISC-V, Xtensa. Same language as the desktop AOT path; only the toolchain target changes.',
  },
  {
    icon: '◇',
    title: 'For systems programmers',
    body: 'Memory safety without garbage collection. Three reference tiers cover the safe / proven-safe / unsafe spectrum. Structured concurrency with cancellation. AOT compilation to native binaries that run at near-C speeds.',
  },
  {
    icon: '∮',
    title: 'For application developers',
    body: 'A semantic-honest standard library — List / Map / Text / Heap / Shared, no implementation-leaking names. Async with explicit join/select. Database / HTTP / TLS / QUIC stacks. A unified context system for dependency injection.',
  },
  {
    icon: 'Σ',
    title: 'For correctness engineers',
    body: 'Refinement types in the type system. SMT integration with capability-based routing across multiple solvers. Pre/post conditions, loop invariants, decreases clauses. Counterexample extraction with delta-debugging minimisation.',
  },
  {
    icon: 'Π',
    title: 'For working mathematicians',
    body: 'Dependent types, identity types, cubical paths. A trusted base small enough to read in one sitting. Two independent algorithmic kernels with continuous differential testing. Proof export to Lean, Coq, Dedukti, Metamath, Isabelle.',
  },
  {
    icon: '@',
    title: 'For architects and auditors',
    body: 'Architectural intent (capability discipline, boundary invariants, lifecycle maturity, foundation profile) is a typed annotation. Each cog declares its shape; the compiler checks the body against it. Audit gates aggregate to a single load-bearing verdict.',
  },
  {
    icon: '[Т]',
    title: 'Operational lifecycle status',
    body: 'Every artefact carries a canonical status drawn from a finite vocabulary — Theorem / Definition / Conditional / Postulate / Hypothesis / Interpretation / Retracted. Status is part of the audit chronicle; downgrading and promoting are explicit actions.',
  },
  {
    icon: '⇌',
    title: 'Same source, two execution paths',
    body: 'Interpreter for instant startup (development, REPL, scripts) and AOT compilation for production. Same bytecode, identical semantics. Add a #! shebang and your .vr file becomes an executable script.',
  },
];

function Features() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Who Verum is for</h2>
        <p>
          A single language across the full systems-engineering spectrum.
          Each audience gets the surface they need; the layers below are
          invisible until you ask for them.
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
        <h2>Start where you are. Climb when you need to.</h2>
        <p>
          Download the <code>verum</code> binary. Write a function. Add a
          refinement when it pays. Add a contract when it earns its keep. Let
          the compiler check more of your invariants the moment you decide
          they are invariants.
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
      title="Verum — A systems language with opt-in correctness depth"
      description="Verum: a systems programming language that scales from microcontroller firmware to verified theorem corpora. Three-tier memory safety, refinement types, dependent types, architecture-as-types, gradual verification — pay only for what you use."
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
