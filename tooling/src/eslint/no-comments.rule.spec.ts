import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, it } from 'vitest';
import { noCommentsRule } from './no-comments.rule.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const commentForbidden = { messageId: 'commentForbidden' };

ruleTester.run('no-comments', noCommentsRule, {
  valid: [
    { code: 'export const orderTotalInCents = 1500;' },
    { code: "export const greeting = 'not // a comment';" },
    { code: 'export const urlPattern = /https?:\\/\\//;' },
  ],
  invalid: [
    { code: '// explains what\nexport const total = 1;', errors: [commentForbidden] },
    { code: '/* block */ export const total = 1;', errors: [commentForbidden] },
    { code: '/** documentation */\nexport const total = 1;', errors: [commentForbidden] },
    { code: 'export const total = 1; // trailing', errors: [commentForbidden] },
    { code: '/// <reference types="node" />\nexport const total = 1;', errors: [commentForbidden] },
    { code: '// @ts-expect-error\nexport const total: number = 1;', errors: [commentForbidden] },
    {
      code: '// first\n// second\nexport const total = 1;',
      errors: [commentForbidden, commentForbidden],
    },
  ],
});
