import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as yaml from 'js-yaml';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Load registry from YAML
interface RegistryAgent {
  id: string;
  name: string;
  url: string;
  description: string;
}

interface AgentWithStatus extends RegistryAgent {
  status: 'online' | 'offline';
  agentCard?: any;
  error?: string;
}

function loadRegistry(): RegistryAgent[] {
  const registryPath = resolve(__dirname, 'agent.registry.yaml');
  const content = readFileSync(registryPath, 'utf-8');
  const data = yaml.load(content) as { agents: RegistryAgent[] };
  return data.agents || [];
}

// Discover agent via HTTP by fetching its Agent Card
async function discoverAgent(agent: RegistryAgent): Promise<AgentWithStatus> {
  try {
    const cardUrl = `${agent.url}/.well-known/agent-card.json`;
    const response = await fetch(cardUrl, { signal: AbortSignal.timeout(5000) });

    if (response.ok) {
      const card = await response.json();
      return { ...agent, status: 'online', agentCard: card };
    }

    return { ...agent, status: 'offline', error: `Agent card not found` };
  } catch (error) {
    return { ...agent, status: 'offline', error: `Connection failed` };
  }
}

// GET /api/agents - Discover all agents via HTTP
app.get('/api/agents', async (_req, res) => {
  try {
    const registry = loadRegistry();
    const agents = await Promise.all(registry.map(discoverAgent));

    res.json({
      agents,
      timestamp: new Date().toISOString(),
      total: agents.length,
      online: agents.filter(a => a.status === 'online').length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to discover agents' });
  }
});

// GET /api/agents/:id - Get specific agent
app.get('/api/agents/:id', async (req, res) => {
  try {
    const registry = loadRegistry();
    const agent = registry.find(a => a.id === req.params.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found in registry' });
    }

    const discovered = await discoverAgent(agent);
    res.json(discovered);
  } catch (error) {
    res.status(500).json({ error: 'Failed to discover agent' });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'agent-platform', port: PORT });
});

// Start
app.listen(PORT, () => {
  const registry = loadRegistry();
  console.log(`🚀 Agent Platform running on http://localhost:${PORT}`);
  console.log(`📡 Discovery API: http://localhost:${PORT}/api/agents`);
  console.log(`📋 Registered agents: ${registry.length}`);
  registry.forEach(a => console.log(`   - ${a.name} (${a.url})`));
});
