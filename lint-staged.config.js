export default {
  '*.ts': ['prettier --write', 'eslint --max-warnings=0'],
  '*.{js,cjs,json,yml,yaml}': ['prettier --write'],
  '*': ['secretlint'],
};
