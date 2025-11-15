# Claude Code for Web - Task Management

> **Purpose**: Documentation for task management system used by Claude Code for Web
> **Version**: 1.0
> **Last Updated**: 2025-11-15

---

## 📁 File Structure

```
.claude-web-tasks/
├── README.md              # This file - overview and instructions
├── tasks.md              # Main task list with all priorities
├── completed.md          # Log of completed tasks
├── issues.md             # Active blockers and questions
├── priority-5-feature-flags.md          # Detailed P5 tasks
├── priority-6-context7-mcp.md           # Detailed P6 tasks
├── priority-7-migration-safety.md       # Detailed P7 tasks
├── priority-8-e2e-tests.md              # Detailed P8 tasks
├── priority-9-dependency-updates.md     # Detailed P9 tasks
└── priority-10-performance-monitoring.md # Detailed P10 tasks
```

---

## 🚀 Quick Start for Claude Code for Web

### Starting Work

**Prompt**:
```
Continue tasks.md
```

Claude will:
1. Read `tasks.md`
2. Check the Progress Tracker
3. Start working on the current priority
4. Update status as work progresses

### Resuming After Break

**Prompt**:
```
Resume from tasks.md - show me what's completed and what's next
```

Claude will:
1. Check `completed.md` for finished tasks
2. Check `issues.md` for any blockers
3. Update you on progress
4. Continue from where it left off

### Checking Status

**Prompt**:
```
Show progress from tasks.md
```

Claude will:
1. Display Progress Tracker summary
2. Show last completed task
3. Show current task in progress
4. List any active blockers

---

## 📋 Task Workflow

### 1. Reading Tasks
Claude reads `tasks.md` to understand:
- Current priority (see "Current Focus" section)
- Task checklist
- Acceptance criteria
- Verification commands

### 2. Executing Tasks
Claude will:
- Work through checklist items
- Update progress in real-time
- Run verification commands
- Test changes

### 3. Completing Tasks
When a task is complete, Claude will:
- Update Progress Tracker in `tasks.md` (🟡 → 🟢)
- Add entry to `completed.md` with details
- Commit changes with proper message
- Move to next task

### 4. Handling Blockers
If Claude encounters a blocker:
- Update task status to 🔵 Blocked
- Add detailed entry to `issues.md`
- Request human assistance if needed
- Move to next non-blocked task

---

## 🎯 Status Indicators

| Icon | Status | Meaning |
|------|--------|---------|
| 🔴 | Not Started | Task not yet begun |
| 🟡 | In Progress | Currently working on this |
| 🟢 | Completed | Task finished and verified |
| 🔵 | Blocked | Waiting on dependency or human input |

---

## 📝 Documentation Standards

### Commit Messages
Follow this format (from tasks.md):
```
<type>: <short description>

<detailed description>

<benefits/changes>

🤖 Generated with Claude Code
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `perf`

### Completed Task Entry
When documenting in `completed.md`:
- Include timestamp
- Include commit hash
- Note any deviations
- Document lessons learned
- Include verification results

### Issue Entry
When documenting in `issues.md`:
- Clear description
- Impact assessment
- Attempted solutions
- Next steps
- Mark resolved when fixed

---

## 🔄 Update Protocol

### After Each Work Session
Claude should update:
1. **tasks.md** - Progress Tracker status
2. **completed.md** - Any finished tasks
3. **issues.md** - Any new blockers or resolved issues

### Before Starting New Priority
Claude should:
1. Verify previous priority is 🟢 Complete
2. Update "Current Focus" in tasks.md
3. Review acceptance criteria
4. Check for dependencies

---

## ✅ Acceptance Criteria Checklist

Each priority has acceptance criteria. Task is only 🟢 Complete when:
- ✅ All checklist items checked
- ✅ All verification commands pass
- ✅ Tests pass
- ✅ Code committed
- ✅ Documentation updated
- ✅ Acceptance criteria met

---

## 🛠️ Common Commands

### Verification Commands
```bash
# Type checking
pnpm run type-check

# Linting
pnpm run lint

# Tests
pnpm test

# Coverage
pnpm run test:coverage

# Build
pnpm run build

# All checks
pnpm run validate
```

### Development Commands
```bash
# Start dev server
pnpm run dev

# Start client dev
pnpm run dev:client

# Both servers
pnpm run dev & pnpm run dev:client
```

### Utility Commands
```bash
# Check outdated dependencies
pnpm outdated

# Security audit
pnpm audit

# Clean build
pnpm run clean && pnpm install
```

---

## 📊 Progress Tracking

### Overall Progress Formula
```
Completed Priorities / Total Priorities = % Complete
```

Current: 0 / 10 = 0% complete

### Time Tracking
- P1: 2-3h (Infrastructure)
- P2: 4-6h (Quality)
- P3: 3-4h (Documentation)
- P4: 2-3h (Reliability)
- P5: 2-3h (Features)
- P6: 1-2h (Tooling)
- P7: 2-3h (Safety)
- P8: 3-4h (Testing)
- P9: 1-2h (Maintenance)
- P10: 2-3h (Performance)

**Total**: 25-35 hours estimated

---

## 🎓 Learning Resources

### TypeScript Best Practices
- Use strict mode (already enabled)
- Prefer types over interfaces for objects
- Use Zod for runtime validation
- Avoid `any`, use `unknown` instead

### Testing Best Practices
- Write tests before refactoring
- Aim for 30%+ coverage minimum
- Test happy path + error cases
- Use factories for test data

### Git Best Practices
- Small, focused commits
- Descriptive commit messages
- Test before committing
- Use conventional commits

### Fastify Best Practices
- Use schemas for validation
- Enable type providers
- Use plugins for organization
- Proper error handling

---

## 🚨 Emergency Procedures

### If Build Breaks
1. Check `issues.md` for known issues
2. Run `pnpm install --force`
3. Run `pnpm run clean`
4. Check git diff for unexpected changes
5. Revert last commit if needed

### If Tests Fail
1. Run failing test in isolation
2. Check for environment issues
3. Verify test database is clean
4. Check for race conditions
5. Document in `issues.md`

### If Blocked
1. Document blocker in `issues.md`
2. Mark task as 🔵 Blocked
3. Move to next non-blocked task
4. Request human assistance if critical

---

## 📞 Human Escalation

Escalate to human for:
- 🔴 Critical blockers preventing all progress
- 🔴 Security concerns
- 🔴 Data loss risks
- 🟡 Design decisions requiring input
- 🟡 Ambiguous requirements
- 🔵 Questions about priorities

---

## 📚 Additional Documentation

Project documentation in `docs/`:
- `docs/home-server-monitor/` - Original project docs
- `docs/AI-DEVELOPMENT.md` - AI tooling setup (to be created)
- `docs/API.md` - API documentation (to be created)
- `docs/ERROR_CODES.md` - Error reference (to be created)
- `docs/MAINTENANCE.md` - Maintenance guide (to be created)

---

## 🎯 Success Metrics

Track these metrics as tasks complete:
- ✅ Test coverage: 24% → 30%+ (P2)
- ✅ Build time: Baseline → 50% faster (P1)
- ✅ API documentation: 0% → 100% (P3)
- ✅ Error standardization: 0% → 100% (P4)
- ✅ E2E tests: 0 → 3+ critical paths (P8)

---

## 🔄 Version History

### v1.0 - 2025-11-15
- Initial task management system
- 10 priorities defined
- Documentation structure created
- Workflow established

---

**Maintained by**: Claude Code for Web
**For questions**: Check `issues.md` or escalate to human
