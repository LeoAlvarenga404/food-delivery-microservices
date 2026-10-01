import type { Rule } from '@commitlint/types';

const defaultMaximumWordCount = 12;
const scissorsLine = '# ------------------------ >8 ------------------------';

function linesBeforeScissors(lines: string[]): string[] {
  const scissorsIndex = lines.indexOf(scissorsLine);
  return scissorsIndex === -1 ? lines : lines.slice(0, scissorsIndex);
}

export function countCommitMessageWords(message: string): number {
  return linesBeforeScissors(message.split('\n'))
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
