import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming?: boolean;
  };
  skills: Array<{
    id: string;
    name: string;
    description: string;
    tags: string[];
  }>;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  // Platform metadata
  path: string;
  port: number;
  status: 'discovered' | 'running' | 'stopped';
  pid?: number;
}

export interface DiscoveryResult {
  agents: AgentInfo[];
  timestamp: string;
  totalFound: number;
}

const AGENTS_DIR = resolve(__dirname, 'agents');
const BASE_PORT = 4000;
const PORT_INCREMENT = 1;

export async function discoverAgents(): Promise<DiscoveryResult> {
  const agents: AgentInfo[] = [];
  
  try {
    const entries = await readdir(AGENTS_DIR, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const agentDir = join(AGENTS_DIR, entry.name);
      const agentCardPath = join(agentDir, 'agent-card.json');
      
      try {
        // Check if agent-card.json exists
        await stat(agentCardPath);
        
        // Read and parse agent card
        const cardContent = await readFile(agentCardPath, 'utf-8');
        const card = JSON.parse(cardContent);
        
        // Calculate port based on agent index
        const agentIndex = agents.length;
        const port = BASE_PORT + (agentIndex * PORT_INCREMENT);
        
        agents.push({
          id: entry.name,
          name: card.name || entry.name,
          description: card.description || '',
          url: card.url || `http://localhost:${port}`,
          version: card.version || '1.0.0',
          capabilities: card.capabilities || {},
          skills: card.skills || [],
          defaultInputModes: card.defaultInputModes || ['text/plain'],
          defaultOutputModes: card.defaultOutputModes || ['text/plain'],
          path: agentDir,
          port,
          status: 'discovered',
        });
      } catch (error) {
        // Skip directories without valid agent-card.json
        console.warn(`Skipping ${entry.name}: missing or invalid agent-card.json`);
      }
    }
  } catch (error) {
    console.error('Error discovering agents:', error);
  }
  
  return {
    agents,
    timestamp: new Date().toISOString(),
    totalFound: agents.length,
  };
}

export async function getAgentById(id: string): Promise<AgentInfo | null> {
  const result = await discoverAgents();
  return result.agents.find(a => a.id === id) || null;
}
