# Issues & Blockers

> **Purpose**: Track blockers, questions, and issues encountered during implementation
> **Status Key**: 🔴 Blocking | 🟡 Warning | 🟢 Resolved | 🔵 Question

---

## Active Issues

_No active issues. Issues will appear here as they are encountered._

---

## Resolved Issues

_Resolved issues will be moved here for reference._

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

**Last Updated**: 2025-11-15
