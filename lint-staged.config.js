export default {
  '*.ts': ['prettier --write', 'eslint --max-warnings=0', 'secretlint'],
  '!(*.ts)': ['prettier --write --ignore-unknown', 'secretlint'],
};
