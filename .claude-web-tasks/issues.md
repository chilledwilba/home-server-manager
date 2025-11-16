# Issues & Blockers

> **Purpose**: Track blockers, questions, and issues encountered during implementation
> **Status Key**: 🔴 Blocking | 🟡 Warning | 🟢 Resolved | 🔵 Question

---

## Active Issues

_No active issues. Issues will appear here as they are encountered._

---

## Resolved Issues

### [ISSUE-001] better-sqlite3 Build Failure
**Status**: 🟢 Resolved
**Priority**: MAINTENANCE
**Reported**: 2025-11-15
**Resolved**: 2025-11-16

**Description**:
Native module better-sqlite3 required manual rebuild after pnpm installation

**Impact**:
- Database functionality blocked
- Tests couldn't run
- Manual intervention required after each install

**Resolution**:
- Added .npmrc configuration with build approval settings
- Configured secure build script allowlist for better-sqlite3
- Native module now builds automatically during pnpm install
- Resolved in commit: 4de3022

**Lessons learned**:
- pnpm's security model requires explicit build approvals
- Configuration approach is better than manual commands
- Document build requirements for future reference

---

### [ISSUE-002] SecurityScanner Test Failures
**Status**: 🟢 Resolved
**Priority**: MAINTENANCE
**Reported**: 2025-11-15
**Resolved**: 2025-11-16

**Description**:
2 failing tests in SecurityScanner (event emission and finding filter)

**Impact**:
- Test suite not fully passing
- CI/CD pipeline showing failures
- Reduced confidence in test coverage

**Resolution**:
- Fixed event emission test assertions
- Corrected finding filter test logic
- Resolved resource leaks in test cleanup
- All tests now passing (784/784)
- Resolved in commit: 7280ba8

**Lessons learned**:
- Always ensure proper cleanup in tests
- Mock implementations must match actual behavior
- Resource leaks can cause cascading test failures

---

## Template for New Issue

```markdown
### [ISSUE-XXX] Short Description
**Status**: 🔴 Blocking | 🟡 Warning | 🔵 Question
**Priority**: PRIORITY-X (which task is blocked)
**Reported**: YYYY-MM-DD HH:MM
**Assigned to**: Claude Code / Human Review

**Description**:
Clear description of the issue or blocker

**Impact**:
- What is affected
- Which tasks are blocked
- Severity of impact

**Attempted solutions**:
1. What was tried
2. Results
3. Why it didn't work

**Next steps**:
- [ ] Step 1
- [ ] Step 2

**Resolution** (when resolved):
- How it was resolved
- Lessons learned
- Resolved at: YYYY-MM-DD HH:MM
```

---

## Common Issues & Quick Solutions

### pnpm Installation Issues
**Problem**: `pnpm: command not found`
**Solution**:
```bash
# Enable corepack (recommended)
corepack enable

# OR install globally
npm install -g pnpm@10
```

### Test Coverage Failures
**Problem**: Coverage below threshold
**Solution**: Check which files lack coverage with:
```bash
pnpm run test:coverage --verbose
```

### TypeScript Path Alias Errors
**Problem**: Cannot find module '@/...'
**Solution**: Ensure `tsconfig.json` and `jest.config.js` path mappings match

### Docker Build Failures
**Problem**: Docker build fails on dependency installation
**Solution**: Clear Docker cache:
```bash
docker builder prune -a
```

### Git Hook Failures
**Problem**: Pre-commit hook fails
**Solution**: Run the hook commands manually to debug:
```bash
pnpm run lint
pnpm run type-check
```

---

**Last Updated**: 2025-11-16
