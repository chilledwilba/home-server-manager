#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * Pre-commit hook to enforce file size limits
 * Prevents monolithic files from being committed
 */

import { readFileSync, existsSync } from 'fs';
import { glob } from 'glob';

// Line limits by directory pattern
const limits = {
  'src/routes/**/*.ts': 250,
  'src/services/**/*.ts': 400,
  'src/integrations/**/*.ts': 500,
  'src/**/*.ts': 500,
};

// Files to exclude from checks
const excludePatterns = ['**/*.test.ts', '**/*.spec.ts', '**/*.d.ts', '**/node_modules/**'];

console.log('🔍 Checking file sizes...\n');

let violations = [];
let checkedFiles = 0;

for (const [pattern, limit] of Object.entries(limits)) {
  try {
    const files = glob.sync(pattern, {
      ignore: excludePatterns,
      absolute: false,
    });

    for (const file of files) {
      if (!existsSync(file)) {
        console.warn(`⚠️  File not found: ${file}`);
        continue;
      }

      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n').length;
      checkedFiles++;

      if (lines > limit) {
        violations.push({
          file,
          lines,
          limit,
          over: lines - limit,
          category: pattern.includes('routes')
            ? 'routes'
            : pattern.includes('services')
              ? 'services'
              : pattern.includes('integrations')
                ? 'integrations'
                : 'other',
        });
      }
    }
  } catch (error) {
    console.error(`❌ Error processing pattern ${pattern}:`, error.message);
  }
}

console.log(`Checked ${checkedFiles} TypeScript files\n`);

if (violations.length > 0) {
  console.error('❌ File size violations detected:\n');

  // Group by category
  const byCategory = violations.reduce((acc, v) => {
    if (!acc[v.category]) acc[v.category] = [];
    acc[v.category].push(v);
    return acc;
  }, {});

  for (const [category, files] of Object.entries(byCategory)) {
    console.error(`\n📁 ${category.toUpperCase()}:`);
    for (const v of files) {
      console.error(`   ${v.file}`);
      console.error(`      ${v.lines} lines (${v.over} over limit of ${v.limit})`);
    }
  }

  console.error('\n💡 To fix:');
  console.error('   1. Split large files into smaller, focused modules');
  console.error('   2. Extract related functionality into separate files');
  console.error('   3. See claude-code-web-tasks.md Phase 6 for refactoring guide\n');

  console.error(`❌ ${violations.length} file(s) exceed size limits\n`);
  process.exit(1);
}

console.log('✅ All files within size limits\n');
process.exit(0);
