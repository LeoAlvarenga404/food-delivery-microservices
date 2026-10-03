import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  fromJsonString,
  toJsonString,
  type DescMessage,
  type MessageShape,
} from '@bufbuild/protobuf';
import { expect } from 'vitest';

export interface GoldenSample<Schema extends DescMessage> {
  readonly directory: URL;
  readonly topic: string;
  readonly schema: Schema;
}

function sampleFile<Schema extends DescMessage>(sample: GoldenSample<Schema>): URL {
  return new URL(`${sample.topic}/${sample.schema.name}.json`, sample.directory);
}

function shouldUpdateGoldenSamples(): boolean {
  return process.env['UPDATE_GOLDEN'] === '1';
}

export async function expectGoldenSample<Schema extends DescMessage>(
  sample: GoldenSample<Schema>,
  message: MessageShape<Schema>,
): Promise<void> {
  const file = sampleFile(sample);
  const actualJson = `${toJsonString(sample.schema, message, { prettySpaces: 2 })}\n`;
  if (shouldUpdateGoldenSamples()) {
    await mkdir(new URL('.', file), { recursive: true });
    await writeFile(file, actualJson);
    return;
  }
  const expectedJson = await readFile(file, 'utf8');
  const actual: unknown = JSON.parse(actualJson);
  const expected: unknown = JSON.parse(expectedJson);
  expect(
    actual,
    `golden sample ${fileURLToPath(file)} (run with UPDATE_GOLDEN=1 to rewrite)`,
  ).toEqual(expected);
}

export async function readGoldenSample<Schema extends DescMessage>(
  sample: GoldenSample<Schema>,
): Promise<MessageShape<Schema>> {
  return fromJsonString(sample.schema, await readFile(sampleFile(sample), 'utf8'));
}
