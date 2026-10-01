import { describe, expect, it } from 'vitest';
import { parseTypeScriptFileName } from './parse-type-script-file-name.ts';

describe('parseTypeScriptFileName', () => {
  it.each([
    ['main.ts', { concept: 'main', role: undefined, testKind: undefined }],
    ['order.aggregate.ts', { concept: 'order', role: 'aggregate', testKind: undefined }],
    ['order.aggregate.spec.ts', { concept: 'order', role: 'aggregate', testKind: 'unit' }],
    [
      'postgres-order.repository.integration.spec.ts',
      { concept: 'postgres-order', role: 'repository', testKind: 'integration' },
    ],
    [
      'place-order.component.spec.ts',
      { concept: 'place-order', role: undefined, testKind: 'component' },
    ],
    ['order.weird.ts', { concept: 'order', role: 'weird', testKind: undefined }],
  ])('parses %s', (fileName, expected) => {
    expect(parseTypeScriptFileName(fileName)).toEqual(expected);
  });

  it.each(['order.json', 'order.aggregate.extra.ts', 'integration.spec.ts', 'spec.ts'])(
    'rejects %s',
    (fileName) => {
      expect(parseTypeScriptFileName(fileName)).toBeUndefined();
    },
  );
});
