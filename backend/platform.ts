import express from 'express';
import cors from 'cors';
import { discoverAgents, getAgentById, AgentInfo } from './discovery';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Store running agents
const runningAgents = new Map<string, { pid: number; port: number }>();

// GET /api/agents - Discover all available agents
app.get('/api/agents', async (req, res) => {
  try {
    const result = await discoverAgents();
    
    // Update status for running agents
    result.agents.forEach(agent => {
      const running = runningAgents.get(agent.id);
      if (running) {
        agent.status = 'running';
        agent.pid = running.pid;
        agent.port = running.port;
      }
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to discover agents' });
  }
});

// GET /api/agents/:id - Get specific agent info
app.get('/api/agents/:id', async (req, res) => {
  try {
    const agent = await getAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const running = runningAgents.get(agent.id);
    if (running) {
      agent.status = 'running';
      agent.pid = running.pid;
      agent.port = running.port;
    }
    
    res.json(agent);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get agent info' });
  }
});

// GET /api/agents/:id/card - Get agent card (A2A discovery)
app.get('/api/agents/:id/card', async (req, res) => {
  try {
    const agent = await getAgentById(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Return A2A agent card
    res.json({
      name: agent.name,
      description: agent.description,
      url: agent.url,
      version: agent.version,
      capabilities: agent.capabilities,
      skills: agent.skills,
      defaultInputModes: agent.defaultInputModes,
      defaultOutputModes: agent.defaultOutputModes,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get agent card' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'agent-platform',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

// Start platform
app.listen(PORT, () => {
  console.log(`🚀 Agent Platform running on http://localhost:${PORT}`);
  console.log(`📡 Agent discovery: http://localhost:${PORT}/api/agents`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});
