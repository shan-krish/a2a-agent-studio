import { create } from 'zustand';
import { Agent, AgentConnection } from '@/types';

interface AgentState {
  agents: Agent[];
  activeAgent: string | null;
  connections: AgentConnection[];
  isLoading: boolean;
  error: string | null;
  setAgents: (agents: Agent[]) => void;
  addAgent: (agent: Agent) => void;
  removeAgent: (id: string) => void;
  setActiveAgent: (id: string | null) => void;
  setConnections: (connections: AgentConnection[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  fetchAgents: () => Promise<void>;
}

// Default agents for the demo
const defaultAgents: Agent[] = [
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    description: 'Coordinates all agent interactions and manages task routing',
    status: 'online',
    color: '#006FCF',
    skills: ['Task Routing', 'Agent Coordination', 'Response Synthesis'],
    url: 'http://localhost:4000',
  },
  {
    id: 'charge-verification',
    name: 'Charge Verification',
    description: 'Handles charge inquiries, disputes, and transaction verification',
    status: 'online',
    color: '#00D4FF',
    skills: ['Transaction Lookup', 'Charge Dispute', 'Refund Processing'],
    url: 'http://localhost:4001',
  },
  {
    id: 'card-replacement',
    name: 'Card Replacement',
    description: 'Manages card replacement requests and activation',
    status: 'online',
    color: '#00C853',
    skills: ['Card Replacement', 'Expiry Management', 'Activation'],
    url: 'http://localhost:4002',
  },
];

const defaultConnections: AgentConnection[] = [
  { source: 'orchestrator', target: 'charge-verification', label: 'delegates' },
  { source: 'orchestrator', target: 'card-replacement', label: 'delegates' },
];

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: defaultAgents,
  activeAgent: 'orchestrator',
  connections: defaultConnections,
  isLoading: false,
  error: null,

  setAgents: (agents) => set({ agents }),
  
  addAgent: (agent) =>
    set((state) => ({
      agents: [...state.agents, agent],
    })),

  removeAgent: (id) =>
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
      connections: state.connections.filter(
        (c) => c.source !== id && c.target !== id
      ),
    })),

  setActiveAgent: (id) => set({ activeAgent: id }),
  
  setConnections: (connections) => set({ connections }),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error: null }),

  fetchAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/agents');
      if (response.ok) {
        const data = await response.json();
        set({ agents: data.agents || defaultAgents });
      } else {
        // Use default agents if API fails
        set({ agents: defaultAgents });
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      set({ agents: defaultAgents });
    } finally {
      set({ isLoading: false });
    }
  },
}));
