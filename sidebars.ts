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
        'language/concurrency',
        'language/packages',
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
      ],
    },
    {
      type: 'category',
      label: 'Frontend',
      collapsed: false,
      items: [
        'frontend/views',
        'frontend/reactivity',
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
