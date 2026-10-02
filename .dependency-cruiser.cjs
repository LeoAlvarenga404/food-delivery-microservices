const testCode = [
  '\\.spec\\.ts$',
  '\\.contract\\.ts$',
  '\\.builder\\.ts$',
  '\\.fake\\.ts$',
  '/test/',
];

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'not-to-undeclared-dependency',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'domain-depends-only-on-domain',
      comment: 'design 9.3: domain imports only its own folder and @fd/domain',
      severity: 'error',
      from: { path: '^services/([^/]+)/src/domain/', pathNot: testCode },
      to: { pathNot: ['^services/$1/src/domain/', '^packages/domain/src/'] },
    },
    {
      name: 'application-depends-only-on-application-and-domain',
      comment: 'design 9.3: application imports domain and @fd/domain, never infrastructure',
      severity: 'error',
      from: { path: '^services/([^/]+)/src/application/', pathNot: testCode },
      to: {
        pathNot: ['^services/$1/src/(application|domain)/', '^packages/domain/src/'],
      },
    },
    {
      name: 'services-never-import-other-services',
      severity: 'error',
      from: { path: '^services/([^/]+)/' },
      to: { path: '^services/', pathNot: '^services/$1/' },
    },
    {
      name: 'production-code-never-imports-test-code',
      severity: 'error',
      from: { path: '^services/[^/]+/src/', pathNot: testCode },
      to: { path: testCode },
    },
    {
      name: 'production-code-never-imports-test-tooling',
      comment: 'devDependencies such as vitest and @fd/chassis-testing stay in test code',
      severity: 'error',
      from: {
        path: '^(services|packages)/',
        pathNot: [...testCode, '^packages/chassis/testing/', 'vitest\\.config\\.ts$'],
      },
      to: { path: ['^packages/chassis/testing/', 'node_modules/(\\.pnpm/)?@?vitest'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'default'],
      extensions: ['.ts', '.js'],
    },
  },
};
