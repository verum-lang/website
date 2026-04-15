import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const ghPagesUrl = process.env.GH_PAGES_URL || 'https://verum-lang.org';
const ghPagesBaseUrl = process.env.GH_PAGES_BASE_URL || '/';

const config: Config = {
  title: 'Verum',
  tagline: 'A verifiable systems language with semantic honesty',
  favicon: 'img/favicon.png',
  url: ghPagesUrl,
  baseUrl: ghPagesBaseUrl,
  organizationName: process.env.GH_ORG_NAME || 'verum-lang',
  projectName: process.env.GH_PROJECT_NAME || 'verum',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
    localeConfigs: {
      en: {
        label: 'English',
        htmlLang: 'en-US',
      },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          remarkPlugins: [remarkMath],
          rehypePlugins: [[rehypeKatex, {strict: false}]],
          showLastUpdateTime: false,
          showLastUpdateAuthor: false,
          editUrl: undefined,
        },
        blog: {
          showReadingTime: true,
          blogTitle: 'Verum Blog',
          blogDescription: 'Release notes and articles on the Verum programming language',
          postsPerPage: 10,
          blogSidebarTitle: 'Posts',
          blogSidebarCount: 'ALL',
          remarkPlugins: [remarkMath],
          rehypePlugins: [[rehypeKatex, {strict: false}]],
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ['@docusaurus/theme-mermaid'],

  markdown: {
    mermaid: true,
    format: 'md',
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  clientModules: [
    require.resolve('./src/theme/prismVerum.ts'),
  ],

  plugins: [
    // Silence a benign webpack warning from vscode-languageserver-types,
    // a transitive dep of the search plugin's indexer.
    function silenceVscodeWarning() {
      return {
        name: 'silence-vscode-warning',
        configureWebpack() {
          return {
            ignoreWarnings: [
              {module: /vscode-languageserver-types/},
            ],
            module: { exprContextCritical: false },
          };
        },
      };
    },
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        docsRouteBasePath: '/docs',
        indexBlog: true,
      },
    ],
  ],

  stylesheets: [
    {
      href: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
      type: 'text/css',
      integrity: 'sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV',
      crossorigin: 'anonymous',
    },
  ],

  themeConfig: {
    metadata: [
      {name: 'keywords', content: 'verum, programming language, refinement types, dependent types, SMT verification, CBGR, systems programming'},
      {name: 'description', content: 'Verum is a verifiable systems language with refinement types, dependent types, SMT-backed proofs, and a three-tier memory safety model.'},
    ],
    image: 'img/social-card.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
    navbar: {
      logo: {
        alt: 'Verum Logo',
        src: 'img/logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'docSidebar',
          sidebarId: 'language',
          position: 'left',
          label: 'Language',
        },
        {
          type: 'docSidebar',
          sidebarId: 'stdlib',
          position: 'left',
          label: 'Standard Library',
        },
        {
          type: 'docSidebar',
          sidebarId: 'architecture',
          position: 'left',
          label: 'Architecture',
        },
        {
          type: 'docSidebar',
          sidebarId: 'reference',
          position: 'left',
          label: 'Reference',
        },
        {to: '/blog', label: 'Blog', position: 'left'},
        {
          href: 'https://github.com/verum-lang/verum',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Learn',
          items: [
            {label: 'Introduction', to: '/docs/intro'},
            {label: 'Installation', to: '/docs/getting-started/installation'},
            {label: 'Language Tour', to: '/docs/getting-started/tour'},
            {label: 'Philosophy', to: '/docs/philosophy/principles'},
          ],
        },
        {
          title: 'Language',
          items: [
            {label: 'Syntax', to: '/docs/language/syntax'},
            {label: 'Type System', to: '/docs/language/types'},
            {label: 'Refinement Types', to: '/docs/language/refinement-types'},
            {label: 'Memory Model', to: '/docs/language/memory-model'},
            {label: 'Context System', to: '/docs/language/context-system'},
          ],
        },
        {
          title: 'Advanced',
          items: [
            {label: 'Verification', to: '/docs/verification/gradual-verification'},
            {label: 'SMT Routing', to: '/docs/verification/smt-routing'},
            {label: 'Dependent Types', to: '/docs/language/dependent-types'},
            {label: 'Cubical & HoTT', to: '/docs/verification/cubical-hott'},
            {label: 'Metaprogramming', to: '/docs/language/metaprogramming'},
          ],
        },
        {
          title: 'Tools',
          items: [
            {label: 'CLI', to: '/docs/tooling/cli'},
            {label: 'LSP', to: '/docs/tooling/lsp'},
            {label: 'Playbook', to: '/docs/tooling/playbook'},
            {label: 'Cog Packages', to: '/docs/tooling/cog-packages'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'Blog', to: '/blog'},
            {label: 'GitHub', href: 'https://github.com/verum-lang/verum'},
            {label: 'Grammar (EBNF)', to: '/docs/reference/grammar-ebnf'},
            {label: 'Glossary', to: '/docs/reference/glossary'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Verum Language Project. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['rust', 'haskell', 'bash', 'toml', 'json', 'diff'],
      // Map Verum's file extension and a couple of friendly aliases.
      magicComments: [
        {
          className: 'theme-code-block-highlighted-line',
          line: 'highlight-next-line',
          block: {start: 'highlight-start', end: 'highlight-end'},
        },
      ],
    },
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
