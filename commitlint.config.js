import { messageMaxWordsRule } from '@fd/tooling/commitlint-rules';

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [{ rules: { 'message-max-words': messageMaxWordsRule } }],
  rules: {
    'message-max-words': [2, 'always', 12],
    'body-empty': [2, 'always'],
    'footer-empty': [2, 'always'],
  },
};
