# Known Issues

**Last Updated:** 2025-11-16

## 🐛 Active Issues

_No active issues at this time_

---

## 📋 Issue Template

When documenting issues, use this format:

```markdown
### Issue #X: Brief Description

**Phase:** Phase X - Task X.X
**Severity:** 🔴 Critical | 🟡 Medium | 🟢 Low
**Status:** 🔴 Open | 🟡 In Progress | 🟢 Resolved
**Discovered:** YYYY-MM-DD

**Description:**
Detailed description of the issue

**Steps to Reproduce:**
1. Step 1
2. Step 2
3. Step 3

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens

**Error Message:**
```
Error message or stack trace
```

**Workaround:**
Temporary solution if available

**Solution:**
Final resolution

**Resolved:** YYYY-MM-DD
```

---

## ✅ Resolved Issues

_No resolved issues yet_

---

## 📊 Issue Statistics

- **Total Issues:** 0
- **Open:** 0
- **In Progress:** 0
- **Resolved:** 0
- **Critical:** 0
- **Medium:** 0
- **Low:** 0

---

## 🔍 Common Issues & Solutions

### TypeScript Errors

**Issue:** Cannot find module '@/components/ui/...'

**Solution:**
1. Check `tsconfig.json` has path alias configured
2. Restart TypeScript server in VSCode
3. Verify component exists in `client/src/components/ui/`

---

### shadcn/ui Installation Issues

**Issue:** Components not found after installation

**Solution:**
1. Verify `components.json` exists and has correct paths
2. Check components were copied to `src/components/ui/`
3. Ensure `@` alias points to `./src/`

---

### Build Errors

**Issue:** Build fails with TypeScript errors

**Solution:**
1. Run `pnpm type-check` to see specific errors
2. Check for unused imports
3. Verify all types are properly imported
4. Run `pnpm lint:fix` to auto-fix some issues

---

## 💡 Tips for Issue Resolution

1. **Check the logs:** Always check browser console and server logs
2. **Read the error:** Error messages usually point to the exact problem
3. **Search documentation:** shadcn/ui and TanStack Query have excellent docs
4. **Ask for help:** Document the issue here and context for Claude

---

## 🆘 Getting Help

If stuck on an issue:

1. Document it in this file using the template above
2. Include all relevant error messages
3. List steps already attempted
4. Reference the issue when asking Claude for help:
   ```
   I'm encountering Issue #X in @.claude-web-tasks/ISSUES.md. Can you help?
   ```
