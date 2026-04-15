import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      link: {type: 'generated-index', slug: '/category/getting-started'},
      items: [
        'getting-started/installation',
        'getting-started/hello-world',
        'getting-started/tour',
        'getting-started/project-structure',
      ],
    },
    {
      type: 'category',
      label: 'Philosophy',
      link: {type: 'generated-index', slug: '/category/philosophy'},
      items: [
        'philosophy/principles',
        'philosophy/semantic-honesty',
        'philosophy/gradual-verification',
        'philosophy/comparisons',
      ],
    },
    {
      type: 'category',
      label: 'Verification',
      link: {type: 'generated-index', slug: '/category/verification'},
      items: [
        'verification/gradual-verification',
        'verification/refinement-reflection',
        'verification/smt-routing',
        'verification/contracts',
        'verification/proofs',
        'verification/cubical-hott',
      ],
    },
    {
      type: 'category',
      label: 'Tooling',
      link: {type: 'generated-index', slug: '/category/tooling'},
      items: [
        'tooling/cli',
        'tooling/build-system',
        'tooling/cog-packages',
        'tooling/lsp',
        'tooling/playbook',
        'tooling/repl',
      ],
    },
    {
      type: 'category',
      label: 'Tutorials',
      link: {type: 'doc', id: 'tutorials/overview'},
      items: [
        'tutorials/cli-tool',
        'tutorials/verified-data-structure',
      ],
    },
    {
      type: 'category',
      label: 'Cookbook',
      link: {type: 'doc', id: 'cookbook/overview'},
      items: [
        'cookbook/file-io',
        'cookbook/json',
        'cookbook/http-server',
        'cookbook/nursery',
        'cookbook/refinements',
        'cookbook/cli-tool',
      ],
    },
    {
      type: 'category',
      label: 'Migrating',
      link: {type: 'generated-index', slug: '/category/migrating'},
      items: [
        'migrating/from-rust',
        'migrating/from-typescript',
        'migrating/from-go',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      link: {type: 'generated-index', slug: '/category/guides'},
      items: [
        'guides/faq',
        'guides/style-guide',
        'guides/best-practices',
        'guides/troubleshooting',
        'guides/performance',
        'guides/security',
      ],
    },
  ],
  language: [
    'language/overview',
    'language/syntax',
    {
      type: 'category',
      label: 'Type System',
      link: {type: 'generated-index', slug: '/category/language-types'},
      items: [
        'language/types',
        'language/refinement-types',
        'language/dependent-types',
        'language/protocols',
        'language/generics',
      ],
    },
    'language/functions',
    'language/patterns',
    {
      type: 'category',
      label: 'Memory & References',
      link: {type: 'generated-index', slug: '/category/language-memory'},
      items: [
        'language/memory-model',
        'language/references',
        'language/cbgr',
      ],
    },
    'language/modules',
    'language/context-system',
    'language/async-concurrency',
    'language/error-handling',
    'language/metaprogramming',
    'language/attributes',
    'language/ffi',
  ],
  stdlib: [
    'stdlib/overview',
    {
      type: 'category',
      label: 'Core',
      link: {type: 'generated-index', slug: '/category/stdlib-core'},
      items: [
        'stdlib/base',
        'stdlib/collections',
        'stdlib/text',
        'stdlib/mem',
        'stdlib/intrinsics',
      ],
    },
    {
      type: 'category',
      label: 'I/O & System',
      link: {type: 'generated-index', slug: '/category/stdlib-io'},
      items: [
        'stdlib/io',
        'stdlib/time',
        'stdlib/sys',
        'stdlib/term',
      ],
    },
    {
      type: 'category',
      label: 'Concurrency',
      link: {type: 'generated-index', slug: '/category/stdlib-concurrency'},
      items: [
        'stdlib/async',
        'stdlib/sync',
        'stdlib/runtime',
      ],
    },
    {
      type: 'category',
      label: 'Network',
      link: {type: 'generated-index', slug: '/category/stdlib-network'},
      items: [
        'stdlib/net',
      ],
    },
    {
      type: 'category',
      label: 'Compute',
      link: {type: 'generated-index', slug: '/category/stdlib-compute'},
      items: [
        'stdlib/math',
        'stdlib/simd',
      ],
    },
    {
      type: 'category',
      label: 'Meta & Proof',
      link: {type: 'generated-index', slug: '/category/stdlib-meta'},
      items: [
        'stdlib/meta',
        'stdlib/proof',
        'stdlib/mathesis',
      ],
    },
    {
      type: 'category',
      label: 'Context & Security',
      link: {type: 'generated-index', slug: '/category/stdlib-security'},
      items: [
        'stdlib/context',
        'stdlib/security',
      ],
    },
    {
      type: 'category',
      label: 'Foundations',
      link: {type: 'generated-index', slug: '/category/stdlib-foundations'},
      items: [
        'stdlib/eval',
        'stdlib/control',
        'stdlib/concurrency',
        'stdlib/logic',
      ],
    },
  ],
  architecture: [
    'architecture/overview',
    'architecture/compilation-pipeline',
    'architecture/vbc-bytecode',
    'architecture/runtime-tiers',
    'architecture/cbgr-internals',
    'architecture/codegen',
    'architecture/smt-integration',
    'architecture/crate-map',
  ],
  reference: [
    'reference/grammar-ebnf',
    'reference/keywords',
    'reference/operators',
    'reference/attribute-registry',
    'reference/cli-commands',
    'reference/verum-toml',
    'reference/glossary',
  ],
};

export default sidebars;
