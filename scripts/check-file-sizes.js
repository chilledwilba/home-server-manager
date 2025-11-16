#!/usr/bin/env node
/**
 * File size checker for pre-commit hook
 * Enforces file size limits to maintain code quality and modularity
 */

import { readFileSync } from 'fs';
import { glob } from 'glob';

// File size limits by pattern (in lines)
const limits = {
  'src/routes/**/*.ts': 250,
  'src/services/**/*.ts': 400,
  'src/integrations/**/*.ts': 500,
  'src/**/*.ts': 500,
};

// Files that are grandfathered (can exceed limits temporarily)
const grandfatheredFiles = [
  'src/mcp/server.ts', // 1397 lines - planned refactoring
  'src/server.ts', // 660 lines - core server file
];

// Get mode from command line arguments
const args = process.argv.slice(2);
const mode = args.includes('--mode=error') ? 'error' : 'warning';

let violations = [];
let grandfathered = [];

console.log(`🔍 Checking file sizes (${mode} mode)...`);
console.log('');

// Check each pattern
for (const [pattern, limit] of Object.entries(limits)) {
  const files = glob.sync(pattern, {
    ignore: ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'],
  });

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n').length;

      if (lines > limit) {
        const violation = {
          file,
          lines,
          limit,
          over: lines - limit,
        };

        // Check if file is grandfathered
        if (grandfatheredFiles.includes(file)) {
          grandfathered.push(violation);
        } else {
          violations.push(violation);
        }
      }
    } catch (error) {
      console.error(`❌ Error reading ${file}:`, error.message);
    }
  }
}

console.log(`Checked ${glob.sync('src/**/*.ts', { ignore: ['**/*.test.ts', '**/*.spec.ts'] }).length} TypeScript files`);
console.log('');

// Report grandfathered files (informational only)
if (grandfathered.length > 0) {
  console.log(`⚠️  Grandfathered files (exceeding limits but allowed):`);
  for (const v of grandfathered) {
    console.log(`   ${v.file}: ${v.lines} lines (${v.over} over limit of ${v.limit})`);
  }
  console.log('');
}

// Report violations
if (violations.length > 0) {
  if (mode === 'error') {
    console.error('❌ File size violations detected:\n');
    for (const v of violations) {
      console.error(`   ${v.file}: ${v.lines} lines (${v.over} over limit of ${v.limit})`);
    }
    console.error('');
    console.error('Please split large files before committing.');
    console.error('Run: git reset HEAD <file> to unstage files that are too large.');
    process.exit(1);
  } else {
    // Warning mode
    console.log(`⚠️  File size warnings (not blocking commit):`);
    for (const v of violations) {
      console.log(`   ${v.file}: ${v.lines} lines (${v.over} over limit of ${v.limit})`);
    }
    console.log('');
    console.log('💡 Consider splitting these files for better maintainability.');
    console.log('');
  }
}

console.log('✅ Commit allowed' + (mode === 'warning' && violations.length > 0 ? ' (warnings only)' : ''));
process.exit(0);
