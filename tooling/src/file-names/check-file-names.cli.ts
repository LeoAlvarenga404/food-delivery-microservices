import { fileNameCatalogue } from './file-name-catalogue.ts';
import { findFileNameViolations } from './find-file-name-violations.ts';
import { listRepositoryFiles } from './list-repository-files.ts';

const violations = findFileNameViolations(listRepositoryFiles(), fileNameCatalogue);

for (const violation of violations) {
  console.error(`${violation.path}: ${violation.reason}`);
}

process.exitCode = violations.length === 0 ? 0 : 1;
