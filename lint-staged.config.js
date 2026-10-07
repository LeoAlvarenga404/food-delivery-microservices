export default {
  '*.{ts,tsx}': ['prettier --write', 'eslint --max-warnings=0 --no-warn-ignored', 'secretlint'],
  '!(*.ts|*.tsx)': ['prettier --write --ignore-unknown', 'secretlint'],
};
