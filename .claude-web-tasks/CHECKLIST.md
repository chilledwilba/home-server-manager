# Code Review Checklist

Use this checklist before marking any phase as complete.

## ✅ General Code Quality

- [ ] No TypeScript errors (`pnpm type-check`)
- [ ] No linting errors (`pnpm lint`)
- [ ] All files properly formatted
- [ ] No unused imports or variables
- [ ] No `console.log` in production code
- [ ] No `@ts-ignore` or `@ts-expect-error` (unless documented)
- [ ] All functions have return types
- [ ] Proper error handling with try/catch

## ✅ React/Frontend

- [ ] Components are properly typed
- [ ] Use TanStack Query for server state
- [ ] Loading states for all async operations
- [ ] Error states for all data fetching
- [ ] Toast notifications for user actions
- [ ] Confirmation dialogs for destructive actions
- [ ] Responsive design (test mobile viewport)
- [ ] Dark mode works correctly
- [ ] Keyboard navigation works
- [ ] No key prop warnings

## ✅ Backend/API

- [ ] API endpoints have proper schemas
- [ ] Input validation with Zod
- [ ] Proper error responses
- [ ] Logging for important operations
- [ ] Database transactions where needed
- [ ] Proper HTTP status codes
- [ ] OpenAPI documentation updated

## ✅ UI/UX

- [ ] Consistent spacing and alignment
- [ ] Loading skeletons for content
- [ ] Empty states for no data
- [ ] Error messages are user-friendly
- [ ] Buttons show loading state
- [ ] Forms validate input
- [ ] Tooltips for icons/unclear UI
- [ ] Proper contrast ratios

## ✅ Accessibility

- [ ] Proper heading hierarchy (h1, h2, h3)
- [ ] Labels for all form inputs
- [ ] Alt text for images
- [ ] Keyboard accessible
- [ ] Focus indicators visible
- [ ] ARIA labels where needed
- [ ] Color is not the only indicator

## ✅ Performance

- [ ] No unnecessary re-renders
- [ ] Images optimized
- [ ] Bundle size reasonable
- [ ] No memory leaks
- [ ] Efficient database queries
- [ ] Proper memoization where needed

## ✅ Testing

- [ ] Manual testing completed
- [ ] All pages load correctly
- [ ] All features work as expected
- [ ] No console errors
- [ ] Test in Chrome, Firefox, Safari
- [ ] Test on mobile viewport
- [ ] Test dark mode

## ✅ Documentation

- [ ] Complex logic is commented
- [ ] README updated if needed
- [ ] API changes documented
- [ ] Breaking changes noted
- [ ] PROGRESS.md updated
- [ ] ISSUES.md updated if needed

## 📝 Pre-Commit Checklist

Before committing changes:

- [ ] Run `pnpm type-check`
- [ ] Run `pnpm lint`
- [ ] Test in browser
- [ ] Check dark mode
- [ ] No TODO comments left
- [ ] Git diff reviewed
- [ ] Commit message is clear

## 🚀 Pre-Phase Complete Checklist

Before marking a phase as complete:

- [ ] All tasks in phase completed
- [ ] All tests pass
- [ ] Documentation updated
- [ ] PROGRESS.md updated
- [ ] No known blockers
- [ ] Manually tested all changes
- [ ] Ready for next phase
