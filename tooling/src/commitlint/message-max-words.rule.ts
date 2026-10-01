import type { Rule } from '@commitlint/types';

const defaultMaximumWordCount = 12;

export function countCommitMessageWords(message: string): number {
  return message
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join(' ')
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

export const messageMaxWordsRule: Rule<number> = (
  parsedCommit,
  ruleApplicability,
  maximumWordCount = defaultMaximumWordCount,
) => {
  const wordCount = countCommitMessageWords(parsedCommit['raw'] ?? '');
  const isWithinLimit = wordCount <= maximumWordCount;
  const explanation = `commit message has ${String(wordCount)} words, maximum is ${String(maximumWordCount)}`;
  return [isWithinLimit, explanation];
};
