export default {
  '*.ts': ['prettier --write', 'eslint --max-warnings=0 --no-warn-ignored', 'secretlint'],
  '!(*.ts)': ['prettier --write --ignore-unknown', 'secretlint'],
};
