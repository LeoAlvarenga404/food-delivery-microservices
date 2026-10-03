import type { Rule } from 'eslint';

export const noCommentsRule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Forbid comments: intent must live in names, extracted functions and tests',
    },
    messages: {
      commentForbidden:
        'Comments are not allowed. Express intent with names, extracted functions or tests.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(): void {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.loc) context.report({ loc: comment.loc, messageId: 'commentForbidden' });
        }
      },
    };
  },
};
