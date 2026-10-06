export interface CatalogueRule {
  readonly description: string;
  readonly pathPattern: RegExp;
  readonly allowedRoles: readonly string[];
  readonly allowedRolelessNames: readonly string[] | 'any' | 'test-files';
  readonly allowedExtensions?: readonly string[];
}

const domainRoles = [
  'aggregate',
  'entity',
  'value-object',
  'state',
  'event',
  'errors',
  'repository',
  'policy',
  'domain-service',
];

const applicationRoles = [
  'command',
  'command-handler',
  'query',
  'query-handler',
  'view',
  'saga',
  'saga-state',
  'port',
];

const infrastructureRoles = [
  'repository',
  'adapter',
  'persistence-mapper',
  'message-mapper',
  'consumer',
  'rpc-service',
  'config',
];

const testSupportRoles = ['repository', 'adapter', 'fake', 'builder', 'contract'];

const bffRoles = ['routes', 'message-mapper', 'adapter', 'config'];

const frontendRoles = ['component', 'hook', 'action', 'adapter', 'message-mapper', 'config'];

const frontendExtensions = ['.ts', '.tsx'];

export const fileNameCatalogue: readonly CatalogueRule[] = [
  {
    description: 'generated database types',
    pathPattern: /^services\/[^/]+\/src\/infrastructure\/persistence\/generated\/database\.ts$/,
    allowedRoles: [],
    allowedRolelessNames: ['database'],
  },
  {
    description: 'generated database types',
    pathPattern: /^services\/[^/]+\/src\/infrastructure\/persistence\/generated\//,
    allowedRoles: [],
    allowedRolelessNames: [],
  },
  {
    description: 'service domain layer',
    pathPattern: /^services\/[^/]+\/src\/domain\//,
    allowedRoles: domainRoles,
    allowedRolelessNames: [],
  },
  {
    description: 'service application layer',
    pathPattern: /^services\/[^/]+\/src\/application\//,
    allowedRoles: applicationRoles,
    allowedRolelessNames: [],
  },
  {
    description: 'service infrastructure layer',
    pathPattern: /^services\/[^/]+\/src\/infrastructure\//,
    allowedRoles: infrastructureRoles,
    allowedRolelessNames: [],
  },
  {
    description: 'service source outside layers',
    pathPattern: /^services\/[^/]+\/src\//,
    allowedRoles: [],
    allowedRolelessNames: ['main'],
  },
  {
    description: 'service test support',
    pathPattern: /^services\/[^/]+\/test\//,
    allowedRoles: testSupportRoles,
    allowedRolelessNames: 'test-files',
  },
  {
    description: 'bff source',
    pathPattern: /^bffs\/[^/]+\/src\//,
    allowedRoles: bffRoles,
    allowedRolelessNames: ['main'],
  },
  {
    description: 'bff test support',
    pathPattern: /^bffs\/[^/]+\/test\//,
    allowedRoles: testSupportRoles,
    allowedRolelessNames: 'test-files',
  },
  {
    description: 'frontend routes',
    pathPattern: /^frontends\/[^/]+\/src\/app\//,
    allowedRoles: [],
    allowedRolelessNames: ['page', 'layout', 'route'],
    allowedExtensions: frontendExtensions,
  },
  {
    description: 'frontend entry',
    pathPattern: /^frontends\/[^/]+\/src\/main\.tsx?$/,
    allowedRoles: [],
    allowedRolelessNames: ['main'],
    allowedExtensions: ['.tsx'],
  },
  {
    description: 'frontend source',
    pathPattern: /^frontends\/[^/]+\/src\//,
    allowedRoles: frontendRoles,
    allowedRolelessNames: [],
    allowedExtensions: frontendExtensions,
  },
  {
    description: 'end-to-end tests',
    pathPattern: /^e2e\/(?:test|browser)\//,
    allowedRoles: testSupportRoles,
    allowedRolelessNames: 'test-files',
  },
  {
    description: 'shared package source',
    pathPattern: /^packages\/(?:chassis\/)?[^/]+\/src\//,
    allowedRoles: [],
    allowedRolelessNames: 'any',
  },
  {
    description: 'tooling source',
    pathPattern: /^tooling\/src\//,
    allowedRoles: ['rule', 'cli'],
    allowedRolelessNames: 'any',
  },
  {
    description: 'TypeScript outside catalogued folders',
    pathPattern: /\.tsx?$/,
    allowedRoles: ['config'],
    allowedRolelessNames: 'any',
  },
];
