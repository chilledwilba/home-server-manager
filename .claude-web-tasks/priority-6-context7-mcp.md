# Priority 6: Context7 MCP Integration 🤖

**Status**: 🔴 Not Started
**Estimated Time**: 1-2 hours
**Why**: Get up-to-date documentation for AI coding assistance (Fastify, React, Zod, etc.)
**Impact**: LOW - Improves AI development experience

---

## Task Checklist

### Step 1: Install Context7
- [ ] Install Context7 MCP: `pnpm add -D @upstash/context7-mcp`
- [ ] Verify installation

### Step 2: Create Configuration

#### Create `.context7/config.json`
- [ ] Define tracked libraries:
  ```json
  {
    "libraries": [
      "fastify@5.6.2",
      "react@18.2.0",
      "zod@4.1.12",
      "socket.io@4.8.1",
      "@biomejs/biome@2.3.4",
      "better-sqlite3@12.4.1",
      "pino@10.1.0",
      "@tanstack/react-query@5.12.0",
      "tailwindcss@3.3.0",
      "typescript@5.9.3",
      "vite@5.0.8"
    ],
    "exclude": [
      "node_modules",
      "dist",
      "coverage"
    ]
  }
  ```

### Step 3: Configure Claude Desktop

#### Update Claude Desktop config
- [ ] Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):
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

- [ ] Restart Claude Desktop

### Step 4: Documentation

#### Create `docs/AI-DEVELOPMENT.md`
- [ ] Document Context7 usage:
  ```markdown
  # AI Development Tools

  ## Context7 MCP Integration

  Context7 provides up-to-date library documentation to AI coding assistants.

  ### Configured Libraries
  - Fastify 5.6.2
  - React 18.2.0
  - Zod 4.1.12
  - Socket.IO 4.8.1
  - Biome 2.3.4
  - And more...

  ### Usage
  Simply mention libraries naturally in your requests:
  - "How do I create a Fastify plugin?"
  - "Show me Zod schema examples"
  - "What's the latest React Router syntax?"

  Context7 automatically fetches current documentation.

  ### Adding Libraries
  Edit `.context7/config.json` to add more libraries.
  ```

### Step 5: Test Context7

- [ ] Test with Claude Desktop by asking: "Show me the latest Fastify hook syntax"
- [ ] Verify up-to-date documentation is returned
- [ ] Test with React, Zod, Socket.IO queries

### Step 6: Team Documentation

- [ ] Add Context7 setup to onboarding docs
- [ ] Document benefits for team

## Acceptance Criteria

- ✅ Context7 MCP installed
- ✅ Configuration file created with project libraries
- ✅ Claude Desktop configured
- ✅ AI gets current docs when coding
- ✅ Team documentation complete
- ✅ Tested with multiple libraries

## Verification

```bash
# Check Claude Desktop config
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Verify Context7 works
# Ask Claude Desktop: "What's the latest Fastify plugin syntax?"
```

## Commit Strategy

```bash
git commit -m "feat: integrate Context7 MCP for up-to-date AI docs

- Install @upstash/context7-mcp
- Configure tracked libraries (Fastify, React, Zod, etc.)
- Add Claude Desktop MCP server configuration
- Document usage and benefits
- Add AI development guide

Ensures AI assistants have current library documentation

🤖 Generated with Claude Code"
```
