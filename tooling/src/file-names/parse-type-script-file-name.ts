export type TestKind = 'unit' | 'integration' | 'component' | 'golden' | 'e2e';

export interface ParsedTypeScriptFileName {
  readonly concept: string;
  readonly role: string | undefined;
  readonly testKind: TestKind | undefined;
}

const qualifiedTestKinds: readonly TestKind[] = ['integration', 'component', 'golden', 'e2e'];
const typeScriptExtensions: readonly string[] = ['ts', 'tsx'];

function detectTestKind(segments: readonly string[]): TestKind | undefined {
  if (segments.at(-2) !== 'spec') return undefined;
  const qualifier = segments.at(-3);
  return qualifiedTestKinds.find((testKind) => testKind === qualifier) ?? 'unit';
}

function countTestSuffixSegments(testKind: TestKind | undefined): number {
  if (testKind === undefined) return 0;
  return testKind === 'unit' ? 1 : 2;
}

export function parseTypeScriptFileName(fileName: string): ParsedTypeScriptFileName | undefined {
  const segments = fileName.split('.');
  if (!typeScriptExtensions.includes(segments.at(-1) ?? '')) return undefined;

  const testKind = detectTestKind(segments);
  const nameSegmentCount = segments.length - 1 - countTestSuffixSegments(testKind);
  const [concept, role, ...unexpectedSegments] = segments.slice(0, nameSegmentCount);
  if (concept === undefined || unexpectedSegments.length > 0) return undefined;

  return { concept, role, testKind };
}
