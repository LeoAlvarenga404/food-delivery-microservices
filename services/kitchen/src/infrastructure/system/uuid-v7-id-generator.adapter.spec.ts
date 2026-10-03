import { describe, expect, it } from 'vitest';
import { UuidV7IdGenerator } from './uuid-v7-id-generator.adapter.ts';

describe('UuidV7IdGenerator', () => {
  it('generates version 7 ticket ids', () => {
    expect(new UuidV7IdGenerator().generateTicketId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
