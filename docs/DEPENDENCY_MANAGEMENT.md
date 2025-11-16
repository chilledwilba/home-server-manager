# Dependency Management

Comprehensive guide for managing dependencies in the Home Server Monitor project using Renovate.

## Table of Contents

- [Overview](#overview)
- [Renovate Setup](#renovate-setup)
- [Update Strategy](#update-strategy)
- [Security Updates](#security-updates)
- [Auto-Merge Policy](#auto-merge-policy)
- [Manual Review Process](#manual-review-process)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Overview

This project uses [Renovate](https://docs.renovatebot.com/) for automated dependency management. Renovate automatically:

- Detects outdated dependencies
- Creates pull requests with updates
- Groups related updates together
- Prioritizes security vulnerabilities
- Auto-merges safe updates
- Maintains lock files

### Why Renovate?

- **Automated**: Reduces manual work for dependency updates
- **Secure**: Prioritizes security vulnerabilities
- **Customizable**: Highly configurable for project needs
- **pnpm Support**: Excellent support for pnpm monorepos
- **GitHub Integration**: Seamless integration with GitHub workflows

## Renovate Setup

### Configuration File

Renovate configuration is in `renovate.json` at the project root.

### Enabling Renovate

Renovate runs automatically on GitHub when:
1. The Renovate GitHub App is installed on the repository
2. The repository contains a `renovate.json` configuration file

To install Renovate:
1. Go to https://github.com/apps/renovate
2. Click "Install" or "Configure"
3. Select the repository
4. Renovate will start creating PRs within minutes

### Schedule

Renovate runs on the following schedule:

- **Regular updates**: Before 6am UTC on Mondays
- **Lock file maintenance**: Before 6am UTC on the 1st of each month
- **Security updates**: At any time (immediate)
- **Major updates**: Before 6am UTC on the 1st of each month

This schedule ensures:
- Updates don't interrupt development during work hours
- Security patches are applied immediately
- Breaking changes are reviewed monthly

## Update Strategy

### Update Grouping

Dependencies are grouped by type for easier review:

#### 1. Security Updates (Highest Priority)
- **Auto-merge**: Patch and minor security updates
- **Labels**: `security`, `priority-high`
- **Schedule**: Immediate
- **Requirements**: Must pass all tests

```json
{
  "vulnerabilitySeverity": ["HIGH", "CRITICAL"],
  "automerge": true
}
```

#### 2. Patch Updates
- **Group**: All patch updates together
- **Auto-merge**: Yes (if tests pass)
- **Labels**: `patch-update`, `auto-merge`
- **Schedule**: Weekly (Mondays)

**Examples**: `1.2.3` → `1.2.4`

#### 3. Minor Updates
- **Group**: All minor updates together
- **Auto-merge**: No (manual review required)
- **Labels**: `minor-update`
- **Schedule**: Weekly (Mondays)

**Examples**: `1.2.3` → `1.3.0`

#### 4. Major Updates
- **Group**: All major updates together
- **Auto-merge**: No (manual review required)
- **Labels**: `major-update`, `breaking-change`
- **Schedule**: Monthly (1st of month)

**Examples**: `1.2.3` → `2.0.0`

### Ecosystem-Specific Groups

Renovate groups related packages for easier review:

**TypeScript & Linting**:
- `typescript`, `@types/node`, `eslint`, `@typescript-eslint/*`
- Label: `typescript`, `tooling`

**Testing Frameworks**:
- `jest`, `@types/jest`, `ts-jest`, `@playwright/test`, `playwright`
- Label: `testing`, `tooling`

**Fastify Ecosystem**:
- `fastify`, `@fastify/*` packages
- Label: `fastify`, `backend`

**React Ecosystem**:
- `react`, `react-dom`, `@react/*` packages
- Label: `react`, `frontend`

**GitHub Actions**:
- All workflow action versions
- Label: `ci`, `github-actions`
- Auto-merge: Yes

## Security Updates

### Vulnerability Detection

Renovate automatically detects vulnerabilities using:
- npm advisory database
- GitHub Security Advisories
- OSV (Open Source Vulnerabilities)

### Security Update Priority

**Critical & High Severity**:
- Created immediately (bypasses schedule)
- Auto-merged for patch/minor versions
- Requires manual review for major versions
- Labels: `security`, `priority-high`

**Medium & Low Severity**:
- Included in regular update schedule
- Requires manual review
- Labels: `security`

### Security PR Example

```
chore(deps): update fastify to 4.25.2 [SECURITY]

This PR contains a security update to address CVE-2024-XXXXX

Severity: HIGH
CVSS Score: 7.5
Affected: fastify < 4.25.2

Changes:
- fastify: 4.25.1 → 4.25.2

Tests: All passing ✅
Auto-merge: Enabled
```

## Auto-Merge Policy

### What Gets Auto-Merged?

✅ **Auto-merged** (if all tests pass):
- Patch updates (e.g., `1.2.3` → `1.2.4`)
- Security patches (high/critical severity)
- GitHub Actions updates
- Lock file maintenance

❌ **Requires manual review**:
- Minor updates (e.g., `1.2.0` → `1.3.0`)
- Major updates (e.g., `1.0.0` → `2.0.0`)
- TypeScript/tooling updates
- React/Fastify ecosystem updates

### Auto-Merge Requirements

For a PR to be auto-merged, it must:

1. **Pass all status checks**:
   - ✅ Type checking
   - ✅ Linting
   - ✅ Unit tests
   - ✅ Integration tests
   - ✅ E2E tests
   - ✅ Build successful

2. **Match auto-merge criteria**:
   - Patch update OR security patch
   - No breaking changes
   - Configured with `automerge: true`

3. **Stability requirement**:
   - Package has been published for 3+ days
   - Reduces risk of adopting broken releases

### Disabling Auto-Merge

To temporarily disable auto-merge:

1. Add `renovate:ignore` label to a PR
2. Or update `renovate.json`:

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

## Manual Review Process

### When to Review

You should manually review PRs for:

1. **Minor updates** - May include new features
2. **Major updates** - Likely contain breaking changes
3. **TypeScript updates** - May affect type checking
4. **Testing framework updates** - May require test changes
5. **Framework updates** (React, Fastify, etc.)

### Review Checklist

When reviewing a Renovate PR:

- [ ] Read the changelog/release notes
- [ ] Check for breaking changes
- [ ] Review the diff
- [ ] Ensure all tests pass
- [ ] Check for new deprecation warnings
- [ ] Test locally if needed
- [ ] Verify documentation is up to date

### Approving Updates

```bash
# Checkout the Renovate branch
git fetch origin
git checkout renovate/package-name

# Test locally
pnpm install
pnpm run test
pnpm run build

# If all looks good, merge the PR on GitHub
```

### Declining Updates

If an update causes issues:

1. Close the PR with a comment explaining why
2. Renovate will not recreate it automatically
3. To permanently ignore:

```json
{
  "ignoreDeps": ["problem-package"]
}
```

## Troubleshooting

### Renovate Not Creating PRs

**Check**:
1. Renovate GitHub App is installed
2. `renovate.json` is valid (use JSON validator)
3. Check Renovate logs in Dependency Dashboard issue
4. Verify schedule configuration

**Debug**:
```bash
# Validate renovate.json locally
npx --yes renovate-config-validator
```

### Too Many PRs

**Solution**: Adjust concurrency limits in `renovate.json`:

```json
{
  "prConcurrentLimit": 3,
  "prHourlyLimit": 1,
  "branchConcurrentLimit": 5
}
```

### Auto-Merge Not Working

**Common causes**:
1. Tests are failing
2. Branch protection rules prevent auto-merge
3. PR doesn't meet auto-merge criteria
4. Status checks are pending

**Fix**:
- Check GitHub branch protection settings
- Ensure `platformAutomerge: true` is set
- Verify all required status checks pass

### Lock File Conflicts

**Solution**:
```bash
# Renovate automatically rebases
# But if manual intervention needed:
git checkout renovate/branch-name
pnpm install
git add pnpm-lock.yaml
git commit -m "chore: update lock file"
git push
```

### Dependency Dashboard Missing

Renovate creates a "Dependency Dashboard" issue. If missing:

1. Check repository issues
2. Ensure `dependencyDashboard: true` in config
3. Renovate may be disabled or misconfigured

## Best Practices

### 1. Regular Review Schedule

Set aside time weekly to review dependency updates:
- **Monday morning**: Review patch updates (usually auto-merged)
- **First Monday of month**: Review minor/major updates

### 2. Test Before Merging

Always ensure tests pass before merging:
- CI must be green
- E2E tests should pass
- Consider manual testing for major updates

### 3. Read Changelogs

For minor and major updates:
- Read the release notes
- Check for breaking changes
- Review migration guides

### 4. Gradual Rollout

For major framework updates:
1. Create feature branch
2. Merge renovate PR to feature branch
3. Test thoroughly
4. Merge to main when stable

### 5. Pin Critical Dependencies

For dependencies that must be specific versions:

```json
{
  "packageRules": [
    {
      "matchPackageNames": ["critical-package"],
      "rangeStrategy": "pin"
    }
  ]
}
```

### 6. Monitor Security Advisories

- Enable GitHub Dependabot alerts
- Review security PRs immediately
- Subscribe to security mailing lists for critical dependencies

### 7. Keep Configuration Updated

Periodically review and update `renovate.json`:
- Add new package groups as project grows
- Adjust schedules based on team workflow
- Update ignore lists as needed

### 8. Use Dependency Dashboard

The Dependency Dashboard issue shows:
- All pending updates
- Rate-limited PRs
- Ignored dependencies
- Error logs

Check it regularly for overview of dependency status.

### 9. Communicate with Team

When merging major updates:
- Notify team members
- Update documentation
- Announce in team chat
- Add migration notes if needed

### 10. Rollback Plan

If an update causes production issues:

```bash
# Revert the merge commit
git revert <commit-hash>
git push

# Or roll back to previous version
git checkout <previous-commit>
```

## Configuration Reference

### Current Configuration

The project's `renovate.json` includes:

- ✅ Dependency dashboard enabled
- ✅ Semantic commits enabled
- ✅ Separate patch releases
- ✅ Security vulnerability detection
- ✅ Auto-merge for patches and security updates
- ✅ Grouped updates by type
- ✅ pnpm support with deduplication
- ✅ 3-day stability period
- ✅ Scheduled updates (Mondays)
- ✅ Lock file maintenance (monthly)

### Modifying Configuration

To change Renovate behavior:

1. Edit `renovate.json`
2. Validate with `npx renovate-config-validator`
3. Commit and push
4. Renovate picks up changes on next run

### Configuration Examples

**Ignore a package**:
```json
{
  "ignoreDeps": ["package-to-ignore"]
}
```

**Change update schedule**:
```json
{
  "schedule": ["after 10pm every weekday", "before 5am every weekday", "every weekend"]
}
```

**Disable auto-merge globally**:
```json
{
  "automerge": false
}
```

**Add custom group**:
```json
{
  "packageRules": [
    {
      "matchPackagePatterns": ["^@myorg/"],
      "groupName": "myorg packages"
    }
  ]
}
```

## Resources

- [Renovate Documentation](https://docs.renovatebot.com/)
- [Configuration Options](https://docs.renovatebot.com/configuration-options/)
- [Preset Configs](https://docs.renovatebot.com/presets-config/)
- [GitHub App](https://github.com/apps/renovate)
- [pnpm Support](https://docs.renovatebot.com/modules/manager/npm/#pnpm)

## Support

For issues or questions:

1. Check Renovate logs in Dependency Dashboard issue
2. Review [Renovate Docs](https://docs.renovatebot.com/)
3. Search [Renovate Discussions](https://github.com/renovatebot/renovate/discussions)
4. File issue in project repository

---

**Last Updated**: 2025-11-16
**Maintained by**: Home Server Monitor Team
