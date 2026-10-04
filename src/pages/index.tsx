import React from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
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
    <div className={styles.mark} aria-hidden="true">
      <div className={styles.markHaloOuter} />
      <div className={styles.markHaloMid}   />
      <div className={styles.markHaloCore}  />
      <img
        src={useBaseUrl('/img/verum-logo-512.png')}
        alt=""
        className={styles.markImage}
        loading="eager"
        decoding="async"
      />
    </div>
  );
}

const EXAMPLE = `type Event is
    | Joined(Int)
    | Left(Int);

fn describe(event: Event) -> Text {
    match event {
        Joined(id) => f"user {id} joined",
        Left(id)   => f"user {id} left",
    }
}

fn main() {
    print(describe(Joined(7)));
}`;

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroText}>
          <p className={styles.pill}>The Verum language platform</p>
          <h1 className={styles.heroTitle}>
            <span className="verum-gradient-text">Verum</span>
          </h1>
          <p className={styles.heroTagline}>
            Build systems. Express intent. Make correctness part of the code.
          </p>
          <p className={styles.heroDesc}>
            A systems language, execution engine, standard library and verification
            toolchain designed together. Start with types and functions. Add explicit
            dependencies, contracts and proofs as your system demands them.
          </p>
          <div className={styles.heroButtons}>
            <Link className="button button--primary button--lg" to="/docs/getting-started/installation">
              Get started
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/getting-started/tour">
              Take the language tour
            </Link>
          </div>
          <Link className={styles.heroStatus} to="/docs/intro#current-implementation">
            Current implementation and execution limits →
          </Link>
        </div>
        <div className={styles.heroVis}><VerumMark /></div>
      </div>
    </header>
  );
}

const PATHS = [
  {number: '01', title: 'Write your first program',
    body: 'Install the toolchain, run a small program and learn the project layout.',
    to: '/docs/getting-started/first-hour', link: 'Your first hour'},
  {number: '02', title: 'Learn the language',
    body: 'Explore types, protocols, pattern matching, references and explicit contexts.',
    to: '/docs/language/overview', link: 'Language reference'},
  {number: '03', title: 'Understand the platform',
    body: 'Follow source through bytecode and execution, then explore verification.',
    to: '/docs/architecture/overview', link: 'Platform architecture'},
];

function LearningPaths() {
  return (
    <section className={styles.section} aria-labelledby="learning-paths">
      <div className={styles.sectionHeader}>
        <h2 id="learning-paths">Choose your starting point</h2>
        <p>A short route into the platform, whatever you are building.</p>
      </div>
      <div className={styles.pathGrid}>
        {PATHS.map(path => (
          <article className={styles.pathCard} key={path.number}>
            <span className={styles.pathNumber} aria-hidden="true">{path.number}</span>
            <h3>{path.title}</h3>
            <p>{path.body}</p>
            <Link to={path.to}>{path.link} →</Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function QuickStart() {
  return (
    <section className={clsx(styles.section, styles.quickStart)} aria-labelledby="first-program">
      <div className={styles.quickStartGrid}>
        <div className={styles.quickStartIntro}>
          <h2 id="first-program">Start with a small, complete program</h2>
          <p>
            Define the states your application can be in and match on their data.
            Save this as <code>events.vr</code>; it prints <code>user 7 joined</code>.
          </p>
          <CodeBlock language="bash">{`# After installing Verum:
verum run --tier interpret events.vr

# Exercise the native compiler explicitly:
verum run --tier aot events.vr`}</CodeBlock>
          <p className={styles.quickStartHint}>
            <Link to="/docs/getting-started/installation">Installation instructions</Link>
            {' · '}
            <Link to="/docs/architecture/runtime-tiers">Choosing an execution mode</Link>
          </p>
        </div>
        <div className={styles.terminal}>
          <div className={styles.terminalBar} aria-hidden="true">
            <span /><span /><span /><em>events.vr</em>
          </div>
          <CodeBlock language="verum">{EXAMPLE}</CodeBlock>
        </div>
      </div>
    </section>
  );
}

const PLATFORM = [
  {title: 'Model meaning in types', accent: '#38bdf8',
    body: 'Records and sum types describe data; protocols and generics describe reusable behaviour. List, Map, Text, Result and Maybe form a shared vocabulary across application code and the standard library.',
    to: '/docs/language/types', link: 'Types and data modelling'},
  {title: 'Make dependencies explicit', accent: '#a78bfa',
    body: 'The using clause names the contexts a function needs. Dependencies such as logging or a clock become visible in the interface, with the same syntax extending into metaprogramming.',
    to: '/docs/language/context-system', link: 'The context system'},
  {title: 'Choose how invariants are checked', accent: '#34d399',
    body: 'Refinements and contracts express properties alongside the program. Verification settings select runtime checks, static proof obligations or certificate checking; each has its own supported scope and cost.',
    to: '/docs/verification/contracts', link: 'Contracts and verification'},
  {title: 'Inspect execution and memory', accent: '#fbbf24',
    body: 'The interpreter and LLVM AOT compiler consume Verum bytecode. Reference checking, native resource cleanup and async execution have distinct contracts: use the execution and reference guides to choose a mode for your workload.',
    to: '/docs/architecture/runtime-tiers', link: 'Execution contracts'},
  {title: 'Compose library building blocks', accent: '#e879f9',
    body: 'Explore collections, I/O, concurrency and application libraries through one module system. Module documentation describes APIs and limitations; the presence of a module alone is not a deployment guarantee.',
    to: '/docs/stdlib/overview', link: 'Standard library'},
  {title: 'Connect architecture to code', accent: '#fb7185',
    body: 'Architectural annotations describe capabilities, dependencies and boundary invariants. Explore how the platform represents these claims, checks them and records the assumptions behind them.',
    to: '/docs/architecture-types', link: 'Architecture as types'},
];

function Platform() {
  return (
    <section className={styles.section} aria-labelledby="platform">
      <div className={styles.sectionHeader}>
        <h2 id="platform">One platform, connected layers</h2>
        <p>
          Language design, execution, libraries and verification share an ambition:
          make the system’s intent visible and its behaviour testable.
        </p>
      </div>
      <div className={styles.pillarGrid}>
        {PLATFORM.map(part => (
          <article className={styles.pillarCard} key={part.title}
            style={{'--accent': part.accent} as React.CSSProperties}>
            <div className={styles.pillarAccent} />
            <h3 className={styles.pillarTitle}>{part.title}</h3>
            <p className={styles.pillarBlurb}>{part.body}</p>
            <Link to={part.to}>{part.link} →</Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function Explore() {
  return (
    <section className={styles.cta} aria-labelledby="explore">
      <div className={styles.ctaInner}>
        <h2 id="explore">Keep the whole system in view</h2>
        <p>
          Move from a language feature to its runtime contract, from an API to
          its implementation, and from a claim to the checks that support it.
          The guides connect these parts of Verum.
        </p>
        <div className={styles.heroButtons}>
          <Link className="button button--primary button--lg" to="/docs/intro">Explore the platform</Link>
          <Link className="button button--secondary button--lg" to="/docs/tooling/cli">CLI and tools</Link>
          <Link className="button button--link button--lg" to="/docs/language/async-concurrency">Async execution</Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): React.ReactElement {
  return (
    <Layout title="Verum — a platform for verifiable systems"
      description="Explore Verum: a systems language, bytecode and native execution, a standard library, and integrated contracts and verification. Learn the language and its current implementation.">
      <Hero />
      <main>
        <LearningPaths />
        <QuickStart />
        <Platform />
        <Explore />
      </main>
    </Layout>
  );
}
