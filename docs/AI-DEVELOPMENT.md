# AI Development Tools

This document describes AI-powered development tools configured for the Home Server Manager project.

## Context7 MCP Integration

Context7 provides up-to-date library documentation to AI coding assistants through the Model Context Protocol (MCP). This ensures Claude and other AI assistants have access to current documentation for all project dependencies.

### What is Context7?

Context7 is an MCP server that fetches real-time documentation from libraries' official sources. Instead of relying on potentially outdated training data, AI assistants can query current docs on-demand.

### Configured Libraries

The project tracks documentation for the following key libraries (see `.context7/config.json`):

#### Backend Stack

- **Fastify 5.6.2** - Fast and low overhead web framework
- **Zod 4.1.12** - TypeScript-first schema validation
- **Socket.IO 4.8.1** - Real-time bidirectional event-based communication
- **Better-sqlite3 12.4.1** - SQLite bindings for Node.js
- **Pino 10.1.0** - Super fast, low overhead logging

#### Frontend Stack

- **React 18.2.0** - UI library
- **React Router DOM 6.20.0** - Declarative routing for React
- **TanStack Query 5.12.0** - Powerful data synchronization for React
- **Vite 5.0.8** - Next generation frontend tooling
- **Tailwind CSS 3.3.0** - Utility-first CSS framework

#### Development Tools

- **TypeScript 5.9.3** - Typed superset of JavaScript
- **Biome 2.3.4** - Fast formatter and linter
- **Jest 30.2.0** - Delightful JavaScript testing framework
- **Playwright 1.56.1** - End-to-end testing framework
- **ESLint 9.39.1** - Pluggable linting utility
- **Prettier 3.6.2** - Opinionated code formatter

### Setting Up Context7 with Claude Desktop

#### macOS Setup

1. **Locate Claude Desktop configuration:**

   ```bash
   open ~/Library/Application\ Support/Claude/
   ```

2. **Edit or create `claude_desktop_config.json`:**

   ```json
   {
     "mcpServers": {
       "context7": {
         "command": "npx",
         "args": ["-y", "@upstash/context7-mcp"]
       }
     }
   }
   ```

3. **Restart Claude Desktop**

4. **Verify setup:**
   - Look for the Context7 icon in Claude Desktop
   - Ask: "What's the latest Fastify plugin syntax?"
   - Context7 should fetch current documentation

#### Linux Setup

1. **Locate configuration:**

   ```bash
   # Usually at:
   ~/.config/Claude/claude_desktop_config.json
   ```

2. **Follow same configuration as macOS**

#### Windows Setup

1. **Locate configuration:**

   ```
   %APPDATA%\Claude\claude_desktop_config.json
   ```

2. **Follow same configuration as macOS**

### Usage Examples

Simply mention libraries naturally when asking Claude for help:

#### Fastify Examples

```
"How do I create a Fastify plugin with dependency injection?"
"Show me the latest Fastify hook execution order"
"What's the best way to handle async errors in Fastify?"
```

#### React Examples

```
"How do I use useEffect with cleanup in React 18?"
"Show me React Router 6 nested routes syntax"
"What's the new React Query v5 mutation syntax?"
```

#### Zod Examples

```
"How do I create a discriminated union in Zod?"
"Show me Zod schema composition examples"
"How do I convert Zod schemas to TypeScript types?"
```

#### Socket.IO Examples

```
"What's the Socket.IO namespace syntax?"
"How do I handle Socket.IO reconnection?"
"Show me Socket.IO room broadcasting"
```

### Adding New Libraries

When adding new dependencies to the project:

1. **Update `.context7/config.json`:**

   ```json
   {
     "libraries": [
       "new-library@1.0.0",
       ...existing libraries
     ]
   }
   ```

2. **Commit the changes:**

   ```bash
   git add .context7/config.json
   git commit -m "docs: add new-library to Context7 tracking"
   ```

3. **Restart Claude Desktop** to pick up the changes

### Benefits

1. **Always Current** - Get documentation for exact versions used in the project
2. **Context Aware** - AI knows what libraries you're using
3. **Fewer Hallucinations** - AI references real docs instead of training data
4. **Better Suggestions** - Code examples match current APIs
5. **Faster Development** - Less time searching docs manually

### Troubleshooting

#### Context7 not appearing in Claude Desktop

1. **Check configuration file syntax:**

   ```bash
   # Validate JSON
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .
   ```

2. **Restart Claude Desktop completely:**
   - Quit Claude Desktop (Cmd+Q)
   - Wait 5 seconds
   - Relaunch

3. **Check package availability:**
   ```bash
   npx -y @upstash/context7-mcp --help
   ```

#### Claude not using Context7 docs

1. **Explicitly mention the library:**
   - ❌ "How do I create a plugin?"
   - ✅ "How do I create a Fastify plugin?"

2. **Verify library is in config:**

   ```bash
   cat .context7/config.json | jq '.libraries'
   ```

3. **Check version matches:**
   - Ensure version in config matches `package.json`

#### Outdated documentation being returned

1. **Update library version in config:**

   ```json
   {
     "libraries": [
       "fastify@5.6.2" // Match package.json version
     ]
   }
   ```

2. **Restart Claude Desktop**

### Alternative: Manual Context

If Context7 is not available, you can provide context manually:

```
I'm using Fastify 5.6.2. Show me how to...
```

This helps Claude provide more accurate answers for your specific versions.

### Team Onboarding

When onboarding new developers:

1. **Point them to this document:**
   - Send link to `docs/AI-DEVELOPMENT.md`

2. **Help them set up Context7:**
   - Walk through Claude Desktop configuration
   - Verify it's working with a test query

3. **Share best practices:**
   - Always mention specific library names
   - Specify version if debugging version-specific issues
   - Check `.context7/config.json` for tracked libraries

### Maintenance

#### Monthly Review

1. **Check for outdated versions:**

   ```bash
   pnpm outdated
   ```

2. **Update `.context7/config.json` accordingly:**

   ```json
   {
     "libraries": [
       "fastify@5.7.0" // Updated version
     ]
   }
   ```

3. **Commit and push:**
   ```bash
   git add .context7/config.json
   git commit -m "docs: update Context7 library versions"
   git push
   ```

#### When Upgrading Dependencies

After running `pnpm update`:

1. **Check `package.json` for new versions**
2. **Update `.context7/config.json` to match**
3. **Commit together:**
   ```bash
   git add package.json pnpm-lock.yaml .context7/config.json
   git commit -m "chore: upgrade dependencies and update Context7 config"
   ```

### Security Considerations

Context7 MCP runs locally and only fetches public documentation:

- ✅ No project code is sent to external services
- ✅ Only library names and versions are used
- ✅ Documentation is fetched from official sources
- ✅ Runs in Claude Desktop's sandbox

### Further Reading

- [Context7 Documentation](https://github.com/upstash/context7)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Claude Desktop MCP Setup](https://docs.anthropic.com/claude/docs/model-context-protocol)

## Other AI Development Tools

### GitHub Copilot

If using GitHub Copilot, ensure it has access to:

- `tsconfig.json` for TypeScript context
- `package.json` for dependency information
- `.eslintrc.json` for code style

### Cursor

If using Cursor IDE:

- Project context is automatically indexed
- Reference `.context7/config.json` for library versions
- Use `Cmd+K` for inline AI assistance

### Claude Code (Web)

This project is optimized for Claude Code for Web:

- Clear project structure in `src/` directory
- Comprehensive documentation in `docs/` directory
- Task tracking in `.claude-web-tasks/`
- Feature flags for safe experimentation

## Conclusion

Context7 MCP significantly improves AI-assisted development by ensuring accurate, up-to-date library documentation. Setting it up takes 5 minutes and provides ongoing benefits throughout development.

For questions or issues, refer to the troubleshooting section or ask in the team chat.
