export interface CatalogueRule {
  readonly description: string;
  readonly pathPattern: RegExp;
  readonly allowedRoles: readonly string[];
  readonly allowedRolelessNames: readonly string[] | 'any' | 'test-files';
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

export const fileNameCatalogue: readonly CatalogueRule[] = [
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
    pathPattern: /\.ts$/,
    allowedRoles: ['config'],
    allowedRolelessNames: 'any',
  },
];
