# A2A Agent Studio

A professional Agent-to-Agent (A2A) protocol demonstration showcasing how AI agents communicate, delegate tasks, and collaborate to solve complex workflows. Built with the official [A2A JavaScript SDK](https://github.com/a2aproject/a2a-js).

![A2A Agent Studio](screenshots/updated-ui.png)

## Architecture

```
backend/
  agents/                    # Self-contained A2A agents (each has own package.json)
    ava/                     # Advanced Virtual Assistant (port 4000)
      src/agent.ts
      package.json           # @a2a-js/sdk, express, openai
    charge-verification/     # Charge investigation (port 4001)
      src/agent.ts
      package.json
    card-replacement/        # Card replacement (port 4002)
      src/agent.ts
      package.json
  mcp-servers/               # MCP tool servers (mock data)
    server.ts                # Single MCP server (port 4100)
    tools/                   # Tool implementations
  agent-platform/            # Platform server
    agent.registry.yaml      # Agent URLs (configure here)
    server.ts                # Discovery via HTTP (port 3001)
  package.json               # Root: zero deps, just scripts
frontend/                    # Next.js UI (port 3000)
```

## Quick Start

```bash
# Install all dependencies
cd backend && npm run install:all

# Set OpenAI API key (optional - works without it using keyword matching)
export OPENAI_API_KEY="sk-..."

# Start everything
npm run start:all
```

Or start individually:

```bash
# Terminal 1: Agents
cd backend/agents/ava && npm start
cd backend/agents/charge-verification && npm start
cd backend/agents/card-replacement && npm start

# Terminal 2: MCP Server
cd backend/mcp-servers && npx tsx server.ts

# Terminal 3: Platform
cd backend/agent-platform && npm start

# Terminal 4: Frontend
cd frontend && npm run dev
```

## How It Works

### Agent Discovery
1. Platform reads `agent-platform/agent.registry.yaml`
2. For each agent URL, fetches `/.well-known/agent-card.json` via HTTP
3. Returns discovered agents with online/offline status

### A2A Communication
- Agents communicate via A2A JSON-RPC protocol
- AVA routes to Charge Verification or Card Replacement
- Charge Verification can escalate to Card Replacement for fraud
- Card Replacement calls MCP tools for address/delivery/reason/submission

### MCP Tools
Mock data served via MCP protocol:
- `get_mailing_address` → Customer address
- `get_delivery_options` → Standard/Express/Overnight
- `get_replacement_reasons` → Lost/Stolen/Damaged/Fraud
- `submit_replacement` → Confirmation & tracking

## Demo Flow

1. Customer: "I don't recognize a charge of $299.99 from TechStore Pro"
2. AVA → routes to Charge Verification
3. Charge Verification → presents charge details, asks for confirmation
4. Customer: "I never made this transaction, this is fraud"
5. Charge Verification → escalates to Card Replacement
6. Card Replacement → calls MCP tools → confirms replacement

![Full Flow](screenshots/full-flow.png)

## Key Design Decisions

- **Self-contained agents**: Each agent has its own `package.json` with all dependencies
- **HTTP-only discovery**: Platform discovers agents via HTTP, no filesystem scanning
- **YAML registry**: `agent.registry.yaml` configures agent URLs
- **A2A SDK**: Official `@a2a-js/sdk` with `AgentExecutor` pattern
- **MCP for tools**: Mock data served via MCP protocol
- **Real LLM**: OpenAI integration (optional, falls back to keyword matching)

## Tech Stack

- **Agents**: TypeScript, @a2a-js/sdk, Express, OpenAI
- **Platform**: TypeScript, Express, js-yaml
- **MCP**: TypeScript, Express
- **Frontend**: Next.js 15, React, Tailwind CSS, shadcn/ui, Framer Motion
- **Protocol**: A2A (Agent-to-Agent), MCP (Model Context Protocol)

## License

MIT
