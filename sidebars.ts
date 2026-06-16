import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/install',
        'getting-started/hello-world',
        'getting-started/first-wired-app',
        'getting-started/project-layout',
      ],
    },
    {
      type: 'category',
      label: 'Language',
      collapsed: false,
      items: [
        'language/sides',
        'language/types',
        'language/options',
        'language/enums',
        'language/casts',
        'language/generics',
        'language/interfaces',
        'language/concurrency',
        'language/packages',
        'language/annotations',
        'language/embed',
      ],
    },
    {
      type: 'category',
      label: 'Wiring',
      collapsed: false,
      items: [
        'wiring/overview',
        'wiring/sessions',
        'wiring/authorization',
        'wiring/wired-state',
        'wiring/raw-http',
      ],
    },
    {
      type: 'category',
      label: 'Frontend',
      collapsed: false,
      items: [
        'frontend/strix-overview',
        'frontend/views',
        'frontend/reactivity',
        'frontend/app-and-plugins',
        'frontend/router',
        'frontend/i18n',
        'frontend/stores',
        'frontend/annotations',
      ],
    },
    {
      type: 'category',
      label: 'Standard Library',
      collapsed: false,
      items: [
        'stdlib/overview',
        'stdlib/time',
        'stdlib/random',
        'stdlib/env',
        'stdlib/fetch',
      ],
    },
    {
      type: 'category',
      label: 'Libraries',
      collapsed: false,
      items: [
        'libraries/gorm',
        'libraries/redis',
      ],
    },
    {
      type: 'category',
      label: 'Advanced',
      collapsed: true,
      items: [
        'advanced/interop',
        'advanced/testing',
        'advanced/deployment',
        'advanced/bundling',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      collapsed: true,
      items: [
        'reference/lsp',
        'reference/cli',
      ],
    },
  ],
};

export default sidebars;
