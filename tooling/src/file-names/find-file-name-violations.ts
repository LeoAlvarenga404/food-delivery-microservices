import type { CatalogueRule } from './file-name-catalogue.ts';
import { isKebabCase } from './is-kebab-case.ts';
import {
  parseTypeScriptFileName,
  type ParsedTypeScriptFileName,
} from './parse-type-script-file-name.ts';

export interface FileNameViolation {
  readonly path: string;
  readonly reason: string;
}

const conventionalFileNames = ['Dockerfile'];
const packageEntryPathPattern = /^packages\/(?:chassis\/)?[^/]+\/src\/index\.ts$/;
const migrationFileNamePattern = /^\d{4}-[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/;

function findDirectoryReasons(directorySegments: readonly string[]): readonly string[] {
  return directorySegments
    .filter((segment) => !segment.startsWith('.') && !isKebabCase(segment))
    .map((segment) => `directory "${segment}" is not kebab-case`);
}

function findGenericFileReasons(fileName: string): readonly string[] {
  const hasInvalidSegment = fileName.split('.').some((segment) => !isKebabCase(segment));
  return hasInvalidSegment ? [`file name "${fileName}" is not kebab-case`] : [];
}

function findMigrationReasons(path: string, fileName: string): readonly string[] {
  const isMigration = path.includes('/migrations/') && migrationFileNamePattern.test(fileName);
  return isMigration ? [] : [`migration "${fileName}" must be named NNNN-kebab-name.sql`];
}

function isRolelessNameAllowed(parsedName: ParsedTypeScriptFileName, rule: CatalogueRule): boolean {
  if (rule.allowedRolelessNames === 'any') return true;
  if (rule.allowedRolelessNames === 'test-files') return parsedName.testKind !== undefined;
  return rule.allowedRolelessNames.includes(parsedName.concept);
}

function findParsedNameReasons(
  fileName: string,
  parsedName: ParsedTypeScriptFileName,
  rule: CatalogueRule,
): readonly string[] {
  if (!isKebabCase(parsedName.concept))
    return [`concept "${parsedName.concept}" is not kebab-case`];
  if (parsedName.role === undefined) {
    const isAllowed = isRolelessNameAllowed(parsedName, rule);
    return isAllowed ? [] : [`file "${fileName}" needs a role suffix in ${rule.description}`];
  }
  const isAllowedRole = rule.allowedRoles.includes(parsedName.role);
  return isAllowedRole ? [] : [`role ".${parsedName.role}" is not allowed in ${rule.description}`];
}

function findCatalogueReasons(
  path: string,
  fileName: string,
  rule: CatalogueRule,
): readonly string[] {
  if (fileName.endsWith('.sql')) return findMigrationReasons(path, fileName);
  if (!fileName.endsWith('.ts')) return [`only .ts files are allowed in ${rule.description}`];

  const parsedName = parseTypeScriptFileName(fileName);
  if (parsedName === undefined) return [`file "${fileName}" does not follow <concept>.<role>.ts`];
  return findParsedNameReasons(fileName, parsedName, rule);
}

function findPackageEntryReasons(path: string): readonly string[] {
  return packageEntryPathPattern.test(path)
    ? []
    : ['file "index.ts" is allowed only as package entry'];
}

function findFileReasons(
  path: string,
  fileName: string,
  catalogue: readonly CatalogueRule[],
): readonly string[] {
  if (fileName.startsWith('.') || conventionalFileNames.includes(fileName)) return [];
  if (fileName === 'index.ts') return findPackageEntryReasons(path);
  const rule = catalogue.find((candidate) => candidate.pathPattern.test(path));
  if (rule === undefined) return findGenericFileReasons(fileName);
  return findCatalogueReasons(path, fileName, rule);
}

function findPathViolations(
  path: string,
  catalogue: readonly CatalogueRule[],
): readonly FileNameViolation[] {
  const segments = path.split('/');
  const fileName = segments.at(-1) ?? '';
  const reasons = [
    ...findDirectoryReasons(segments.slice(0, -1)),
    ...findFileReasons(path, fileName, catalogue),
  ];
  return reasons.map((reason) => ({ path, reason }));
}

export function findFileNameViolations(
  paths: readonly string[],
  catalogue: readonly CatalogueRule[],
): readonly FileNameViolation[] {
  return paths.flatMap((path) => findPathViolations(path, catalogue));
}
