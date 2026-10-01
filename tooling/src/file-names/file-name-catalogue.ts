export interface DirectoryRule {
  readonly description: string;
  readonly directoryPattern: RegExp;
  readonly allowedRoles: readonly string[];
  readonly allowedRolelessNames: readonly string[] | 'any';
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

export const fileNameCatalogue: readonly DirectoryRule[] = [
  {
    description: 'service domain layer',
    directoryPattern: /^services\/[^/]+\/src\/domain\//,
    allowedRoles: domainRoles,
    allowedRolelessNames: [],
  },
  {
    description: 'service application layer',
    directoryPattern: /^services\/[^/]+\/src\/application\//,
    allowedRoles: applicationRoles,
    allowedRolelessNames: [],
  },
  {
    description: 'service infrastructure layer',
    directoryPattern: /^services\/[^/]+\/src\/infrastructure\//,
    allowedRoles: infrastructureRoles,
    allowedRolelessNames: [],
  },
  {
    description: 'service source root',
    directoryPattern: /^services\/[^/]+\/src\/[^/]+$/,
    allowedRoles: [],
    allowedRolelessNames: ['main'],
  },
  {
    description: 'service test support',
    directoryPattern: /^services\/[^/]+\/test\//,
    allowedRoles: testSupportRoles,
    allowedRolelessNames: 'any',
  },
  {
    description: 'shared package source',
    directoryPattern: /^packages\/(?:chassis\/)?[^/]+\/src\//,
    allowedRoles: [],
    allowedRolelessNames: 'any',
  },
  {
    description: 'tooling source',
    directoryPattern: /^tooling\/src\//,
    allowedRoles: ['rule', 'cli'],
    allowedRolelessNames: 'any',
  },
];
