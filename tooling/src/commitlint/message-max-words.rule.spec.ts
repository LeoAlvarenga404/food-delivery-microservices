import parse from '@commitlint/parse';
import { describe, expect, it } from 'vitest';
import { countCommitMessageWords, messageMaxWordsRule } from './message-max-words.rule.ts';

describe('countCommitMessageWords', () => {
  it.each([
    ['feat(order): add order aggregate', 4],
    ['feat(order):   add    order aggregate  ', 4],
    ['feat(order): add order aggregate\n', 4],
    ['feat(order): add order aggregate\n# Please enter the commit message\n# Lines starting', 4],
    ['feat: first line\n\nsecond paragraph words', 6],
    [
      'feat(order): add order aggregate\n# Please enter the commit message\n# ------------------------ >8 ------------------------\n# Do not modify or remove the line above.\ndiff --git a/order.ts b/order.ts\n+export const order = 1;\n',
      4,
    ],
    ['', 0],
  ])('counts words in %j', (message, expectedWordCount) => {
    expect(countCommitMessageWords(message)).toBe(expectedWordCount);
  });
});

describe('messageMaxWordsRule', () => {
  it('accepts a message with exactly twelve words', async () => {
    const message = 'feat(order): one two three four five six seven eight nine ten eleven';

    const [isValid] = await messageMaxWordsRule(await parse(message), 'always', 12);

    expect(isValid).toBe(true);
  });

  it('rejects a message with thirteen words and reports the count', async () => {
    const message = 'feat(order): one two three four five six seven eight nine ten eleven twelve';

    const [isValid, explanation] = await messageMaxWordsRule(await parse(message), 'always', 12);

    expect(isValid).toBe(false);
    expect(explanation).toBe('commit message has 13 words, maximum is 12');
  });
});
