# Dependency Management - Quick Reference

Quick reference guide for common dependency management tasks.

## Daily Tasks

### Check for New PRs

```bash
# View Renovate PRs on GitHub
gh pr list --label dependencies

# Or visit Dependency Dashboard issue
# (Created automatically by Renovate in Issues tab)
```

### Review Auto-Merged Updates

```bash
# Check recent auto-merged changes
git log --grep="chore(deps)" --oneline -10
```

## Weekly Tasks

### Review Pending Minor Updates

1. Go to GitHub PRs
2. Filter by `minor-update` label
3. Review changelogs
4. Test locally if needed
5. Merge or request changes

### Check Dependency Dashboard

- Open the "Dependency Dashboard" issue
- Review pending updates
- Check for any errors or warnings
- Plan which updates to prioritize

## Monthly Tasks

### Review Major Updates

1. Filter PRs by `major-update` label
2. Read migration guides
3. Test in feature branch
4. Update code for breaking changes
5. Merge when ready

### Review Ignored Dependencies

```bash
# Check renovate.json for ignored deps
cat renovate.json | grep -A 5 "ignoreDeps"
```

## Common Commands

### Validate Renovate Config

```bash
# Validate configuration locally
npx --yes renovate-config-validator

# Or use specific file
npx --yes renovate-config-validator renovate.json
```

### Manually Trigger Renovate

Renovate runs automatically, but to force a check:

1. Go to GitHub repository
2. Navigate to "Actions" tab
3. Find "Renovate" workflow
4. Click "Run workflow"

### Update Specific Dependency

```bash
# Update to latest version
pnpm update package-name

# Update to specific version
pnpm add package-name@version

# Update all dependencies (use with caution)
pnpm update --latest
```

### Check Outdated Packages

```bash
# Check all outdated packages
pnpm outdated

# Check specific package
pnpm outdated package-name

# Interactive update
pnpm update --interactive
```

## Emergency Procedures

### Security Vulnerability Found

1. **Check severity**: Review Renovate PR or GitHub advisory
2. **If critical**: Merge immediately if tests pass
3. **If high**: Review and merge within 24 hours
4. **If medium/low**: Include in next update cycle

```bash
# Check for known vulnerabilities
pnpm audit

# Fix vulnerabilities automatically
pnpm audit fix

# Check specific package
pnpm why package-name
```

### Update Causing Production Issues

```bash
# Revert the problematic commit
git revert <commit-hash>
git push origin main

# Or rollback to previous version
git reset --hard <previous-commit>
git push --force origin main

# Then investigate and fix
```

### Too Many Renovate PRs

Temporarily reduce PR rate:

```json
// renovate.json
{
  "prConcurrentLimit": 2,
  "prHourlyLimit": 1
}
```

## Configuration Changes

### Ignore a Package

```json
// renovate.json
{
  "ignoreDeps": ["problematic-package"]
}
```

### Stop Auto-Merge for Package

```json
{
  "packageRules": [
    {
      "matchPackageNames": ["package-name"],
      "automerge": false
    }
  ]
}
```

### Change Update Schedule

```json
{
  "schedule": ["every weekend"]
}
```

## Useful Filters

### GitHub PR Filters

```
# Security updates only
is:pr label:security is:open

# Auto-merge candidates
is:pr label:auto-merge is:open

# Major updates
is:pr label:major-update is:open

# Specific ecosystem
is:pr label:fastify is:open
is:pr label:react is:open

# All dependency updates
is:pr label:dependencies is:open
```

## Cheat Sheet

| Task | Command/Action |
|------|---------------|
| Check outdated | `pnpm outdated` |
| Validate config | `npx renovate-config-validator` |
| View dependency tree | `pnpm list --depth=1` |
| Why is X installed? | `pnpm why package-name` |
| Update lock file | `pnpm install` |
| Deduplicate deps | `pnpm dedupe` |
| Security audit | `pnpm audit` |
| Update interactive | `pnpm update --interactive` |
| Renovate PRs | GitHub: `label:dependencies` |
| Dependency Dashboard | GitHub Issues: "Dependency Dashboard" |

## Labels

Renovate uses these labels to categorize PRs:

- `dependencies` - All dependency updates
- `security` - Security vulnerabilities
- `priority-high` - Urgent updates
- `auto-merge` - Will auto-merge if tests pass
- `patch-update` - Patch version updates
- `minor-update` - Minor version updates
- `major-update` - Major version updates
- `breaking-change` - Contains breaking changes
- `ci` - CI/CD related updates
- `fastify` - Fastify ecosystem
- `react` - React ecosystem
- `typescript` - TypeScript/types
- `testing` - Testing frameworks
- `tooling` - Development tools

## Best Practices

✅ **DO**:
- Review security updates immediately
- Test major updates in a feature branch
- Read changelogs for minor/major updates
- Keep lock file committed
- Monitor Dependency Dashboard weekly

❌ **DON'T**:
- Ignore security warnings
- Merge major updates without testing
- Disable auto-merge globally
- Commit with failing tests
- Let dependency PRs pile up (review weekly)

## Quick Links

- [Full Documentation](./DEPENDENCY_MANAGEMENT.md)
- [Renovate Docs](https://docs.renovatebot.com/)
- [Dependency Dashboard](https://github.com/chilledwilba/home-server-manager/issues?q=is%3Aissue+is%3Aopen+%22Dependency+Dashboard%22)
- [Security Advisories](https://github.com/chilledwilba/home-server-manager/security/advisories)

---

**Quick Start**: Enable Renovate → Review Dependency Dashboard → Merge patch updates → Review minor/major monthly
