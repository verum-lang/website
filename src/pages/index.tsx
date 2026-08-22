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

const HERO_CODE = `// The language you write all day —
type Event is
    | Ping
    | Join(Text)
    | Msg(Text, Text);   // user, body

fn render(e: Event) -> Text {
    match e {
        Ping                         => "ping".clone(),
        Join(user)                   => f"{user} joined",
        Msg(user, body) if body.len() > 0
                                     => f"{user}: {body}",
        Msg(user, _)                 => f"{user} sent nothing",
    }
}

async fn broadcast(rx: Receiver<Event>) using [Logger] {
    while let Some(e) = rx.recv().await {
        Logger.info(render(e));
    }
}

// — is the language that proves things when you ask it to.
@verify(formal)
fn binary_search(xs: &List<Int> { self.is_sorted() },
                 target: Int) -> Maybe<Int>
    where ensures (result is Some(i) => xs[i] == target)
{ /* body */ }`;

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroText}>
          <h1 className={styles.heroTitle}>
            <span className="verum-gradient-text">Verum</span>
          </h1>
          <p className={styles.heroTagline}>
            A complete systems language. Proof-grade when you need it.
          </p>
          <p className={styles.heroDesc}>
            Sum types and exhaustive matching, protocols and generics,
            structured async, memory safety without a garbage collector, and a
            batteries-included standard library built on nothing but syscalls —
            that is the everyday language. Then, in the same file, the ceiling
            rises: refinement types when invariants matter, contracts when
            correctness pays, machine-checked proofs when it is load-bearing.
            Each layer costs nothing until you ask for it.
          </p>
          <div className={styles.heroButtons}>
            <Link className="button button--primary button--lg" to="/docs/intro">
              Get Started
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/getting-started/tour">
              Language Tour
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

/* ------------------------------------------------------------------ */
/* Quick start — from zero to a running program, honestly.             */
/* Commands mirror docs/getting-started/installation.md exactly.       */
/* ------------------------------------------------------------------ */

function QuickStart() {
  return (
    <section className={clsx(styles.section, styles.quickStart)}>
      <div className={styles.quickStartGrid}>
        <div className={styles.quickStartIntro}>
          <h2>Zero to running in one binary</h2>
          <p>
            The <code>verum</code> binary is the whole toolchain — compiler,
            interpreter, LSP server, debugger, REPL, Playbook TUI, formatter,
            test runner. Prebuilt for six platforms, rebuilt daily. No runtime
            to install, no package manager required before your first program.
          </p>
          <p className={styles.quickStartHint}>
            <Link to="/docs/getting-started/installation">
              All six platforms and checksums →
            </Link>
          </p>
        </div>
        <div className={styles.terminal}>
          <div className={styles.terminalBar}>
            <span /><span /><span />
            <em>terminal</em>
          </div>
          <CodeBlock language="bash">{`# Grab today's build (macOS arm64 shown; six triples published daily)
curl -LO https://github.com/verum-lang/verum/releases/download/dev/verum-dev-aarch64-apple-darwin.tar.gz
tar xzf verum-dev-aarch64-apple-darwin.tar.gz
sudo install -m755 verum /usr/local/bin/verum

# Write a program
echo 'fn main() { print("hello, verum"); }' > hello.vr

# Run it two ways — same bytecode, same semantics
verum run hello.vr      # Tier 0: interpreter, instant start
verum build hello.vr    # Tier 1: native AOT binary`}</CodeBlock>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The language — the everyday surface, before any verification story. */
/* ------------------------------------------------------------------ */

const LANGUAGE = [
  {
    title: 'Types that say what they mean',
    accent: '#38bdf8',
    blurb:
      'The standard vocabulary is semantic, not implementation-flavoured: ' +
      '`List`, `Map`, `Set`, `Text`, `Heap`, `Shared` — names that state intent ' +
      'and leave representation to the compiler. Errors travel as values ' +
      'through `Result` and `Maybe` with `?` propagation; interpolated ' +
      'strings and newtypes keep the everyday code short and typed.',
    code: `type OrderId is (Int);          // newtype — not just an Int

fn total(orders: &Map<OrderId, Order>) -> Result<Money, PriceError> {
    let mut sum = Money.zero();
    for (_, order) in orders.iter() {
        sum = sum.add(order.price()?);   // ? propagates the error
    }
    Ok(sum)
}

fn receipt(id: OrderId, m: Money) -> Text {
    f"order {id}: {m}"                   // typed interpolation
}`,
  },
  {
    title: 'Model the domain, match on it',
    accent: '#a78bfa',
    blurb:
      'Sum types carry exactly the states your domain has — no nullable ' +
      'placeholders, no sentinel values. `match` is exhaustive: add a variant ' +
      'and every non-total match in the codebase becomes a compile error, ' +
      'with guards for the cases that need a condition.',
    code: `type Shape is
    | Circle(Float)
    | Rectangle(Float, Float)
    | Square(Float);

fn describe(s: Shape) -> Text {
    match s {
        Circle(_)                     => "a circle".clone(),
        Rectangle(w, h) if w == h     => "a square in disguise".clone(),
        Rectangle(_, _)               => "a rectangle".clone(),
        Square(_)                     => "a square".clone(),
    }
}
// Add a variant to Shape and this match stops compiling
// until you say what it means. That is the point.`,
  },
  {
    title: 'Protocols, not hierarchies',
    accent: '#34d399',
    blurb:
      'Behaviour is a protocol; any type can implement it, including types ' +
      'you did not write. Generics take protocol bounds, and function types ' +
      'go up to rank-2 polymorphism — `fn<R>(Reducer<B, R>) -> Reducer<A, R>` ' +
      'is an ordinary type here, which is what makes transducer-style ' +
      'libraries expressible without macros.',
    code: `type Drawable is protocol {
    fn draw(&self) -> Text;
    fn area(&self) -> Float;
};

implement Drawable for Circle {
    fn draw(&self) -> Text { f"Circle(r={self.radius})" }
    fn area(&self) -> Float { 3.14159 * self.radius * self.radius }
}

fn report<S: Drawable>(s: &S) {
    print(f"{s.draw()} covers {s.area()}");
}`,
  },
  {
    title: 'Concurrency that composes',
    accent: '#fbbf24',
    blurb:
      'Async functions suspend at `.await` and cost nothing until spawned. ' +
      'Bounded channels give you backpressure by construction; `select` races ' +
      'sources; structured spawning keeps every task owned by a scope that ' +
      'joins it — no orphaned work, no ambient executor state.',
    code: `async fn producer(tx: Sender<Int>, n: Int) {
    let mut i = 0;
    while i < n {
        tx.send(i).await;      // blocks when the buffer is full:
        i = i + 1;             // backpressure is automatic
    }
}

fn main() {
    let (tx, rx): (Sender<Int>, Receiver<Int>) = bounded(4);
    let p = spawn(producer(tx, 100));
    let c = spawn(consume(rx));
    p.join();
    c.join();
}`,
  },
];

function LanguageSection() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>The language itself</h2>
        <p>
          Before any proof enters the picture, Verum is a full modern systems
          language — the code below is its everyday register, and all of it
          runs identically under the instant-start interpreter and the
          native AOT compiler.
        </p>
      </div>
      <div className={styles.pillarGrid}>
        {LANGUAGE.map(p => <PillarCard key={p.title} pillar={p} />)}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pillars — the engineering decisions underneath.                     */
/* ------------------------------------------------------------------ */

const PILLARS = [
  {
    title: 'Batteries included, dependencies zero',
    accent: '#e879f9',
    blurb:
      'The standard library is written in Verum on the no-libc substrate and ' +
      'ships inside the toolchain: an embedded SQL engine, PostgreSQL / MySQL ' +
      '/ Redis wire clients, HTTP with TLS 1.3 and QUIC, a full terminal-UI ' +
      'framework, a shell DSL, X.509 / post-quantum / zero-knowledge crypto, ' +
      'tensors with GPU lowering, reverse-mode autodiff. No package manager ' +
      'required before your first real program.',
    code: `mount core.database.sqlite.native.l7_api.{
    Database, DbError, open_readwrite};

fn example() -> Result<(), DbError> {
    let mut db: Database = open_readwrite()?;
    db.execute(&"CREATE TABLE users (id INTEGER PRIMARY KEY, \\
                 name TEXT NOT NULL)".into())?;
    db.execute(&"INSERT INTO users (id, name) \\
                 VALUES (1, 'alice'), (2, 'bob')".into())?;
    let rows = db.query_all(&"SELECT id, name FROM users \\
                              ORDER BY id".into())?;
    for row in rows.iter() { print(f"{row[1].as_text()}"); }
    Ok(())
}
// A SQL engine written in Verum, embedded in the toolchain.`,
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
    title: 'Architecture is a type',
    accent: '#10b981',
    blurb:
      'Architectural intent — what a module is allowed to do, what it depends on, ' +
      'what invariants its boundaries preserve, what stage of maturity it is at — ' +
      'is a typed annotation the compiler enforces on every build. Architectural ' +
      'drift becomes a compile error with a stable diagnostic code, not a ' +
      'code-review gap. The same discipline scales from a single embedded driver ' +
      'to a federation of services.',
    code: `@arch_module(
    lifecycle: Lifecycle.Definition,
    exposes:   [Capability.Read(Database("ledger")),
                Capability.Network(Grpc, Outbound)],
    requires:  [Capability.Read(Logger)],
    preserves: [BoundaryInvariant.AllOrNothing,
                BoundaryInvariant.AuthenticatedFirst],
    composes_with: ["payment.fraud", "payment.audit"],
)
module payment.settlement;
// Capability escalation, boundary violation, lifecycle
// regression — each is a compile-time diagnostic with a
// stable code. Claiming Theorem status without a closed
// proof triple is itself an error the compiler catches.`,
  },
  {
    title: 'Correctness is a dial',
    accent: '#f43f5e',
    blurb:
      'One spectrum from runtime assertions to kernel-checked certificates, ' +
      'indexed so every step is at least as strong as the previous. Refinements ' +
      'erase at runtime; proofs are per function, per module, or per project — ' +
      'never required, never silently taxing the code that does not ask. The ' +
      'kernel re-checks every certificate from every solver, and two independent ' +
      'kernels must agree before an audit passes.',
    code: `// Same body, different tiers.
type NonNeg is Int { self >= 0 };

@verify(runtime)        // assertion at runtime
fn abs_r(x: Int) -> NonNeg { if x >= 0 { x } else { -x } }

@verify(formal)         // SMT-proved at compile time
fn abs_f(x: Int) -> NonNeg { if x >= 0 { x } else { -x } }

@verify(certified)      // certificate exported, kernel re-checks
fn abs_c(x: Int) -> NonNeg { if x >= 0 { x } else { -x } }

// Promote the tier when the function lands in a load-bearing
// role. Demote when the role changes back. Same source.`,
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
          systems code — without committing you to machinery you did not ask for.
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
        <CodeBlock language="verum" showLineNumbers>{`// Plain systems code — no annotations needed.
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

// Each level is a single attribute apart. Pay for what you use.`}</CodeBlock>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Standard library breadth — module names straight from core/.        */
/* ------------------------------------------------------------------ */

const STDLIB_GROUPS: {domain: string; accent: string; chips: string[]}[] = [
  {
    domain: 'Data',
    accent: '#38bdf8',
    chips: ['SQL engine (sqlite, in Verum)', 'postgres', 'mysql', 'redis',
            'json', 'protobuf', 'encoding', 'compress', 'storage'],
  },
  {
    domain: 'Network',
    accent: '#a78bfa',
    chips: ['http/1.1 · 2 · 3', 'tls 1.3', 'quic', 'websocket', 'dns',
            'url · uri-template', 'proxy', 'weft framework'],
  },
  {
    domain: 'Security',
    accent: '#f43f5e',
    chips: ['x509', 'aead · hpke · kdf', 'post-quantum', 'zero-knowledge',
            'jwt · oidc · webauthn', 'sigstore · tuf', 'constant-time subtle'],
  },
  {
    domain: 'Compute',
    accent: '#34d399',
    chips: ['tensors + GPU lowering', 'autodiff', 'simd', 'math',
            'random', 'hash', 'search'],
  },
  {
    domain: 'Runtime',
    accent: '#fbbf24',
    chips: ['async', 'sync · concurrency', 'mem · arenas', 'time',
            'io · fs', 'signal', 'tracing · metrics'],
  },
  {
    domain: 'Surface',
    accent: '#e879f9',
    chips: ['terminal UI (widgets, layout)', 'shell DSL', 'cli args',
            'text · fmt', 'config', 'money', 'id'],
  },
];

function StdlibSection() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>The standard library ships whole</h2>
        <p>
          Fifty-plus top-level modules, written in Verum on the no-libc
          substrate and baked into the toolchain binary. Every name below is a
          directory in <code>core/</code> today — not a roadmap.
        </p>
      </div>
      <div className={styles.stdlibGrid}>
        {STDLIB_GROUPS.map(g => (
          <div key={g.domain} className={styles.stdlibGroup}
               style={{'--accent': g.accent} as React.CSSProperties}>
            <h3>{g.domain}</h3>
            <div className={styles.chipRow}>
              {g.chips.map(c => <span key={c} className={styles.chip}>{c}</span>)}
            </div>
          </div>
        ))}
      </div>
      <p className={styles.stdlibFootnote}>
        <Link to="/docs/stdlib/overview">Browse the standard library →</Link>
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Toolchain — what the one binary actually contains.                  */
/* ------------------------------------------------------------------ */

const TOOLS = [
  {
    icon: '▸',
    title: 'verum run — Tier 0',
    body: 'The interpreter. Instant start on the same bytecode the AOT path compiles — your development loop is edit → run, no build step, identical semantics.',
  },
  {
    icon: '⚙',
    title: 'verum build — Tier 1',
    body: 'Native AOT through LLVM: one self-contained binary at 0.85–0.95× native-C speed, speaking syscalls (or libSystem / kernel32) directly. Cross-target flags included.',
  },
  {
    icon: '✎',
    title: 'Language server',
    body: 'Completion, diagnostics, go-to-definition, incremental lossless parsing — the same binary serves your editor over LSP. First-party VS Code extension.',
  },
  {
    icon: '⊙',
    title: 'Step debugger',
    body: 'A Debug Adapter Protocol server in the box: breakpoints, stepping, variable inspection — wired to the interpreter tier for zero-rebuild debug sessions.',
  },
  {
    icon: '≋',
    title: 'REPL & Playbook TUI',
    body: 'An interactive REPL for quick exploration, and Playbook — a terminal notebook for literate, replayable sessions against real code.',
  },
  {
    icon: '✓',
    title: 'Tests, benches, audits',
    body: 'A spec-test runner with tiered conformance levels, criterion benchmarks, escape-analysis reports, and architecture audit gates that aggregate to one verdict.',
  },
];

function Toolchain() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>One binary, the whole workshop</h2>
        <p>
          Everything below ships inside the same <code>verum</code> executable
          you installed above — there is no companion toolchain to version-match.
        </p>
      </div>
      <div className={styles.toolGrid}>
        {TOOLS.map(t => (
          <div key={t.title} className={styles.featureCard}>
            <div className={styles.featureIcon}>{t.icon}</div>
            <h3>{t.title}</h3>
            <p>{t.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Numbers + tooling — measurable claims, enterprise table stakes.     */
/* ------------------------------------------------------------------ */

const NUMBERS = [
  {
    icon: '0.93 ns',
    title: 'Memory-safety check',
    body: 'Measured cost of the default-tier reference check on the production benchmark — against a 15 ns budget. Escape analysis promotes most hot-path accesses to exactly zero.',
  },
  {
    icon: '1.4 M',
    title: 'Lines parsed per second',
    body: 'Front-end throughput, held by a compile-speed contract test in the repository — a regression fails the build, not a quarterly report.',
  },
  {
    icon: '0.85–0.95×',
    title: 'Native-C runtime',
    body: 'The AOT target window. Interpreter startup is effectively instant, and both paths execute the same bytecode with identical semantics.',
  },
  {
    icon: '0',
    title: 'libc dependencies',
    body: 'Linux, FreeBSD and embedded builds speak raw syscalls; macOS uses libSystem and Windows kernel32+ntdll — the platform-required boundary and nothing else.',
  },
];

function Numbers() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>By the numbers</h2>
        <p>
          Performance claims here are either measured on benchmarks that live
          in the repository or held by contract tests that fail the build on
          regression — never a slide-deck figure.
        </p>
      </div>
      <div className={styles.featureGrid}>
        {NUMBERS.map(n => (
          <div key={n.title} className={styles.featureCard}>
            <div className={styles.featureIcon}>{n.icon}</div>
            <h3>{n.title}</h3>
            <p>{n.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: '◆',
    title: 'For embedded developers',
    body: 'No runtime, no libc, no allocator. Direct hardware access through typed MMIO registers. Bare-metal targets across ARM Cortex-M, RISC-V, Xtensa. Same language as the desktop AOT path; only the toolchain target changes.',
  },
  {
    icon: '◇',
    title: 'For systems programmers',
    body: 'Memory safety without garbage collection. Three reference tiers cover the safe / proven-safe / unsafe spectrum. Structured concurrency with cancellation. AOT compilation to native binaries that run at near-C speeds.',
  },
  {
    icon: '●',
    title: 'For application developers',
    body: 'A semantically honest standard library — List / Map / Text / Heap / Shared, no implementation-leaking names. Async with explicit join and select. Database, HTTP, TLS and QUIC stacks in the box. One context system for dependency injection.',
  },
  {
    icon: '○',
    title: 'For correctness engineers',
    body: 'Refinement types in the type system. SMT integration with capability-based routing across multiple solvers. Pre/post conditions, loop invariants, decreases clauses. Counterexample extraction with delta-debugging minimisation.',
  },
  {
    icon: '■',
    title: 'For working mathematicians',
    body: 'Dependent types, identity types, cubical paths. A trusted base small enough to read in one sitting. Two independent algorithmic kernels with continuous differential testing. Proof export to Lean, Coq, Dedukti, Metamath, Isabelle.',
  },
  {
    icon: '□',
    title: 'For architects and auditors',
    body: 'Architectural intent — capability discipline, boundary invariants, lifecycle maturity, foundation profile — is a typed annotation checked on every build. Every artefact carries an explicit lifecycle status; promoting and demoting are deliberate, audited actions.',
  },
  {
    icon: '▲',
    title: 'For data & ML engineers',
    body: 'Tensors with GPU lowering (PTX, Metal, SPIR-V), reverse-mode autodiff, and SIMD in the standard library. An embedded SQL engine plus PostgreSQL, MySQL and Redis wire clients for the data plumbing around the model.',
  },
  {
    icon: '▽',
    title: 'For security engineers',
    body: 'X.509, TLS 1.3, AEAD/HPKE/KDF suites, post-quantum and zero-knowledge primitives, JWT/OIDC/WebAuthn, sigstore and TUF — with a constant-time subtle module and capability-typed boundaries the compiler enforces.',
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

/* ------------------------------------------------------------------ */
/* Side by side — where Verum sits among its neighbours.               */
/* ------------------------------------------------------------------ */

const COMPARISON: {dim: string; verum: string; rust: string; go: string; c: string}[] = [
  {
    dim: 'Memory safety',
    verum: 'Generational references, three tiers — no lifetime annotations in types',
    rust: 'Ownership + borrow checker, lifetimes in signatures',
    go: 'Garbage collector',
    c: 'Manual',
  },
  {
    dim: 'Formal verification',
    verum: 'In the language: refinements → SMT → kernel-checked certificates, one dial',
    rust: 'External tools (Kani, Prusti, Creusot)',
    go: '—',
    c: 'External tools (Frama-C, CBMC)',
  },
  {
    dim: 'Concurrency',
    verum: 'Structured async in the stdlib; select, channels, supervision',
    rust: 'Library executors (tokio, async-std)',
    go: 'Goroutines on a managed runtime',
    c: 'Threads + libraries',
  },
  {
    dim: 'Standard library',
    verum: 'SQL engine, TLS 1.3/QUIC, terminal UI, tensors — in the box',
    rust: 'Lean core, rich crates.io ecosystem',
    go: 'Broad stdlib',
    c: 'Minimal, per-platform',
  },
  {
    dim: 'Development loop',
    verum: 'One binary: instant interpreter and native AOT on the same bytecode',
    rust: 'Compile-first',
    go: 'Fast compile',
    c: 'Compile-first',
  },
  {
    dim: 'Embedded / no-libc',
    verum: 'First-class: no runtime, raw syscalls, bare-metal targets',
    rust: 'no_std, mature',
    go: 'Needs the runtime',
    c: 'First-class',
  },
];

function Comparison() {
  return (
    <section className={clsx(styles.section, styles.comparison)}>
      <div className={styles.sectionHeader}>
        <h2>Side by side</h2>
        <p>
          Each of these languages is excellent at what it optimises for.
          This table is where Verum sits — the column to read is the one
          whose trade-offs match your problem.
        </p>
      </div>
      <div className={styles.comparisonWrap}>
        <table className={styles.comparisonTable}>
          <thead>
            <tr>
              <th></th>
              <th className={styles.comparisonVerum}>Verum</th>
              <th>Rust</th>
              <th>Go</th>
              <th>C / C++</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map(row => (
              <tr key={row.dim}>
                <th>{row.dim}</th>
                <td className={styles.comparisonVerum}>{row.verum}</td>
                <td>{row.rust}</td>
                <td>{row.go}</td>
                <td>{row.c}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
          Download a prebuilt <code>verum</code> binary — rebuilt daily for
          Linux, macOS, and Windows. Write ordinary code with an extraordinary
          standard library behind it. Add a refinement when it pays, a contract
          when it earns its keep, a proof when it is load-bearing — and let the
          compiler hold every invariant you decide is one.
        </p>
        <div className={styles.heroButtons}>
          <Link className="button button--primary button--lg" to="/docs/getting-started/installation">
            Download Verum
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/getting-started/tour">
            Language Tour
          </Link>
          <Link className="button button--link button--lg" to="/docs/stdlib/overview">
            Standard Library
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): React.ReactElement {
  return (
    <Layout
      title="Verum — a complete systems language, proof-grade when you need it"
      description="Verum: sum types, protocols, structured async, memory safety without GC, and a batteries-included standard library on raw syscalls — plus refinement types, contracts and machine-checked proofs in the same file when correctness is load-bearing."
    >
      <Hero />
      <main>
        <QuickStart />
        <LanguageSection />
        <Pillars />
        <CodeShowcase />
        <StdlibSection />
        <Toolchain />
        <Numbers />
        <Features />
        <Comparison />
        <CTA />
      </main>
    </Layout>
  );
}
