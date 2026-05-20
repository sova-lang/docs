import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Sova',
  tagline: 'A multi-tier language that lets a single codebase span the backend and the frontend.',
  favicon: 'img/favicon.png',

  url: 'https://sova-lang.dev',
  baseUrl: '/',

  organizationName: 'sova-lang',
  projectName: 'sova',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl:
            'https://github.com/sova-lang/sova/tree/main/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/logo.png',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Sova',
      logo: {
        alt: 'Sova owl logo',
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
          href: 'https://github.com/sova-lang/sova',
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
            {label: 'Getting Started', to: '/getting-started/install'},
            {label: 'Language Tour', to: '/language/types'},
            {label: 'Wiring', to: '/wiring/overview'},
          ],
        },
        {
          title: 'Community',
          items: [
            {label: 'GitHub Discussions', href: 'https://github.com/sova-lang/sova/discussions'},
            {label: 'Issue Tracker', href: 'https://github.com/sova-lang/sova/issues'},
          ],
        },
        {
          title: 'More',
          items: [
            {label: 'GitHub', href: 'https://github.com/sova-lang/sova'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Sova contributors. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.oneLight,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ['go', 'bash', 'json', 'toml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
