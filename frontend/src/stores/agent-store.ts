import { create } from 'zustand';
import { Agent, AgentConnection, DelegationState, TrailEvent } from '../types';

interface AgentState {
  agents: Agent[];
  activeAgent: string | null;
  connections: AgentConnection[];
  delegationState: DelegationState;
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
  // New delegation tracking methods
  activateConnection: (source: string, target: string) => void;
  completeConnection: (source: string, target: string) => void;
  updateAgentActivity: (agentId: string) => void;
  processTrailEvent: (event: TrailEvent) => void;
}

// Default agents for the demo - renamed Orchestrator to AVA
const defaultAgents: Agent[] = [
  {
    id: 'ava',
    name: 'AVA',
    description: 'Advanced Virtual Assistant - Coordinates all agent interactions and manages task routing',
    status: 'online',
    color: '#006FCF',
    skills: ['Task Routing', 'Agent Coordination', 'Response Synthesis'],
    url: 'http://localhost:4000',
    isActive: true,
    lastActivity: new Date(),
  },
  {
    id: 'charge-verification',
    name: 'Charge Verification',
    description: 'Handles charge inquiries, disputes, and transaction verification',
    status: 'online',
    color: '#00A3E0',
    skills: ['Transaction Lookup', 'Charge Dispute', 'Refund Processing'],
    url: 'http://localhost:4001',
    isActive: false,
    lastActivity: new Date(),
  },
  {
    id: 'card-replacement',
    name: 'Card Replacement',
    description: 'Manages card replacement requests and activation',
    status: 'online',
    color: '#00A86B',
    skills: ['Card Replacement', 'Expiry Management', 'Activation'],
    url: 'http://localhost:4002',
    isActive: false,
    lastActivity: new Date(),
  },
];

const defaultConnections: AgentConnection[] = [
  { source: 'ava', target: 'charge-verification', label: 'delegates', status: 'idle', direction: 'source-to-target' },
  { source: 'ava', target: 'card-replacement', label: 'delegates', status: 'idle', direction: 'source-to-target' },
];

const initialDelegationState: DelegationState = {
  currentDelegations: [],
  activeConnections: [],
  completedDelegations: [],
};

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: defaultAgents,
  activeAgent: 'ava',
  connections: defaultConnections,
  delegationState: initialDelegationState,
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

  // New delegation tracking methods
  activateConnection: (source, target) =>
    set((state) => {
      const connectionId = `${source}-${target}`;
      const updatedConnections = state.connections.map((conn) =>
        conn.source === source && conn.target === target
          ? { ...conn, status: 'active' as const, lastActivity: new Date() }
          : conn
      );
      
      const updatedAgents = state.agents.map((agent) =>
        agent.id === source || agent.id === target
          ? { ...agent, isActive: true, lastActivity: new Date() }
          : agent
      );

      return {
        connections: updatedConnections,
        agents: updatedAgents,
        delegationState: {
          ...state.delegationState,
          currentDelegations: [
            ...state.delegationState.currentDelegations,
            { source, target, status: 'active', lastActivity: new Date() },
          ],
          activeConnections: [...state.delegationState.activeConnections, connectionId],
        },
      };
    }),

  completeConnection: (source, target) =>
    set((state) => {
      const connectionId = `${source}-${target}`;
      const updatedConnections = state.connections.map((conn) =>
        conn.source === source && conn.target === target
          ? { ...conn, status: 'completed' as const, lastActivity: new Date() }
          : conn
      );
      
      const updatedAgents = state.agents.map((agent) =>
        agent.id === source || agent.id === target
          ? { ...agent, isActive: false, lastActivity: new Date() }
          : agent
      );

      return {
        connections: updatedConnections,
        agents: updatedAgents,
        delegationState: {
          ...state.delegationState,
          activeConnections: state.delegationState.activeConnections.filter(
            (id) => id !== connectionId
          ),
          completedDelegations: [...state.delegationState.completedDelegations, connectionId],
        },
      };
    }),

  updateAgentActivity: (agentId) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === agentId
          ? { ...agent, lastActivity: new Date() }
          : agent
      ),
    })),

  processTrailEvent: (event) => {
    const state = get();
    
    // Update connections based on trail events
    if (event.type === 'agent-delegation' && event.targetAgent) {
      state.activateConnection(event.sourceAgent, event.targetAgent);
    }
    
    if (event.type === 'agent-response' || event.type === 'tool-result') {
      // Find the most recent delegation and complete it
      const recentDelegation = state.delegationState.currentDelegations.slice(-1)[0];
      if (recentDelegation && recentDelegation.status === 'active') {
        state.completeConnection(recentDelegation.source, recentDelegation.target);
      }
    }
    
    // Update agent activity
    if (event.sourceAgent !== 'user') {
      state.updateAgentActivity(event.sourceAgent);
    }
    if (event.targetAgent) {
      state.updateAgentActivity(event.targetAgent);
    }
  },
}));
