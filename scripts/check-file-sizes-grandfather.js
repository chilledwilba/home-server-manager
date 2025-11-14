#!/usr/bin/env node
/* eslint-disable no-undef, no-unused-vars */
/**
 * Pre-commit hook to enforce file size limits (GRANDFATHER MODE)
 * Allows existing large files, blocks new violations
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

// Files that are allowed to be over limit (existing violations)
const grandfatheredFiles = [
  'src/mcp/server.ts',
  'src/server.ts',
  'src/services/ai/insights-service.ts',
  'src/services/infrastructure/manager.ts',
  'src/services/zfs/manager.ts',
  'src/services/arr/arr-optimizer.ts',
  'src/services/ups/ups-monitor.ts',
  'src/routes/security.ts',
  'src/routes/infrastructure.ts',
  'src/routes/ai-insights.ts',
  'src/routes/ups.ts',
];

console.log('🔍 Checking file sizes (grandfather mode)...\n');

// Get staged files
let stagedFiles = [];
try {
  const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' });
  stagedFiles = output.split('\n').filter((f) => f.endsWith('.ts'));
} catch (error) {
  console.log('Not a git repository or no staged files');
  process.exit(0);
}

if (stagedFiles.length === 0) {
  console.log('No TypeScript files staged for commit\n');
  process.exit(0);
}

console.log(`Checking ${stagedFiles.length} staged files...\n`);

let violations = [];

for (const file of stagedFiles) {
  if (!existsSync(file)) continue;

  // Check if file matches any pattern
  let limit = 500; // default
  if (file.includes('routes/')) limit = 250;
  else if (file.includes('services/')) limit = 400;
  else if (file.includes('integrations/')) limit = 500;

  const content = readFileSync(file, 'utf-8');
  const lines = content.split('\n').length;

  if (lines > limit) {
    // Check if grandfathered
    if (grandfatheredFiles.includes(file)) {
      console.log(`⚠️  ${file}: ${lines} lines (grandfathered)`);
    } else {
      violations.push({ file, lines, limit, over: lines - limit });
    }
  }
}

if (violations.length > 0) {
  console.error('\n❌ New file size violations detected:\n');

  for (const v of violations) {
    console.error(`   ${v.file}`);
    console.error(`      ${v.lines} lines (${v.over} over limit of ${v.limit})`);
  }

  console.error('\n💡 To fix:');
  console.error('   1. Split large files into smaller modules');
  console.error('   2. Extract functionality into separate files');
  console.error('   3. See claude-code-web-tasks.md for guidance\n');

  process.exit(1);
}

console.log('✅ All staged files within size limits\n');
process.exit(0);
