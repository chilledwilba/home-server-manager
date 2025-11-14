#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * Pre-commit hook to enforce file size limits (WARNING MODE)
 * Shows warnings but doesn't block commits
 */

import { readFileSync, existsSync } from 'fs';
import { glob } from 'glob';

const limits = {
  'src/routes/**/*.ts': 250,
  'src/services/**/*.ts': 400,
  'src/integrations/**/*.ts': 500,
  'src/**/*.ts': 500,
};

const excludePatterns = ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts', '**/node_modules/**'];

console.log('🔍 Checking file sizes (warning mode)...\n');

let violations = [];
let checkedFiles = 0;

for (const [pattern, limit] of Object.entries(limits)) {
  try {
    const files = glob.sync(pattern, { ignore: excludePatterns });

    for (const file of files) {
      if (!existsSync(file)) continue;

      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n').length;
      checkedFiles++;

      if (lines > limit) {
        violations.push({ file, lines, limit, over: lines - limit });
      }
    }
  } catch (error) {
    console.error(`Error processing ${pattern}:`, error.message);
  }
}

console.log(`Checked ${checkedFiles} TypeScript files\n`);

if (violations.length > 0) {
  console.warn('⚠️  File size warnings:\n');

  for (const v of violations) {
    console.warn(`   ${v.file}: ${v.lines} lines (${v.over} over ${v.limit})`);
  }

  console.warn('\n💡 Consider refactoring large files');
  console.warn(`⚠️  ${violations.length} file(s) exceed recommended limits\n`);
}

// Exit 0 - don't block commit
console.log('✅ Commit allowed (warnings only)\n');
process.exit(0);
