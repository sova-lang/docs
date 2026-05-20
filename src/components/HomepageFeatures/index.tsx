import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'One Source, Two Targets',
    description: (
      <>
        Write Sova once. The compiler emits idiomatic Go for the server and
        modern JavaScript for the browser, sharing the types and validation
        rules between both worlds.
      </>
    ),
  },
  {
    title: 'Wire the Boundary',
    description: (
      <>
        Mark a function with <code>wire</code> and the compiler generates the
        transport, serialisation, authentication, and routing for you. No
        REST scaffolding, no manual JSON contracts.
      </>
    ),
  },
  {
    title: 'Reactive by Design',
    description: (
      <>
        First-class reactive fields, composable view trees, and a small set of
        framework primitives. The frontend story stays close to plain Sova
        without ceremony.
      </>
    ),
  },
  {
    title: 'Sessions Built In',
    description: (
      <>
        HMAC-signed cookie sessions, role and rooms metadata, and an
        ergonomic <code>@</code> shorthand on the backend. Authentication is
        a language feature, not a library.
      </>
    ),
  },
  {
    title: 'Strict Where It Matters',
    description: (
      <>
        Option types instead of nulls, exhaustive enums, explicit casts, and
        underscore privacy keep accidents in check. The type system catches
        the routine bugs.
      </>
    ),
  },
  {
    title: 'Editor-Aware',
    description: (
      <>
        Sova ships an LSP from day one: diagnostics, navigation, hover docs,
        renaming, and code actions, all built on the same compiler the
        production toolchain uses.
      </>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4', styles.featureCol)}>
      <div className="feature-card">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={clsx('features', styles.features)}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
