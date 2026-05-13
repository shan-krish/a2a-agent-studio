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

// Default connections between agents
const defaultConnections: AgentConnection[] = [
  { source: 'ava', target: 'charge-verification', status: 'idle' },
  { source: 'ava', target: 'card-replacement', status: 'idle' },
  { source: 'charge-verification', target: 'card-replacement', status: 'idle' },
];

const initialDelegationState: DelegationState = {
  activeConnections: [],
  completedDelegations: [],
};

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  activeAgent: null,
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
  
  setError: (error) => set({ error }),

  fetchAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch('/api/agents');
      if (response.ok) {
        const data = await response.json();
        if (data.error) {
          // Platform returned an error
          set({ 
            agents: [], 
            error: data.message || data.error,
            isLoading: false 
          });
        } else {
          set({ 
            agents: data.agents || [], 
            activeAgent: data.agents?.[0]?.id || null,
            isLoading: false 
          });
        }
      } else {
        // API returned error status
        const data = await response.json().catch(() => ({}));
        set({ 
          agents: [], 
          error: data.message || 'Failed to fetch agents',
          isLoading: false 
        });
      }
    } catch (error) {
      console.error('Failed to fetch agents:', error);
      set({ 
        agents: [], 
        error: 'Agent platform is not running. Please start the backend: cd backend && npm run dev',
        isLoading: false 
      });
    }
  },

  activateConnection: (source: string, target: string) => {
    set((state) => ({
      connections: state.connections.map((c) =>
        c.source === source && c.target === target
          ? { ...c, status: 'active' as const }
          : c
      ),
      delegationState: {
        ...state.delegationState,
        activeConnections: [
          ...state.delegationState.activeConnections,
          { source, target, timestamp: new Date() },
        ],
      },
    }));
  },

  completeConnection: (source: string, target: string) => {
    set((state) => ({
      connections: state.connections.map((c) =>
        c.source === source && c.target === target
          ? { ...c, status: 'completed' as const }
          : c
      ),
      delegationState: {
        ...state.delegationState,
        activeConnections: state.delegationState.activeConnections.filter(
          (c) => !(c.source === source && c.target === target)
        ),
        completedDelegations: [
          ...state.delegationState.completedDelegations,
          { source, target, timestamp: new Date() },
        ],
      },
    }));
  },

  updateAgentActivity: (agentId: string) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId
          ? { ...a, isActive: true, lastActivity: new Date() }
          : a
      ),
    }));
  },

  processTrailEvent: (event: TrailEvent) => {
    const state = get();
    
    // Update agent activity based on trail events
    if (event.sourceAgent) {
      state.updateAgentActivity(event.sourceAgent);
    }
    if (event.targetAgent) {
      state.updateAgentActivity(event.targetAgent);
    }

    // Handle delegation events
    if (event.type === 'agent-delegation' && event.sourceAgent && event.targetAgent) {
      state.activateConnection(event.sourceAgent, event.targetAgent);
    }

    // Handle response events (delegation complete)
    if (event.type === 'agent-response' && event.sourceAgent) {
      // Find any active connections from this agent and mark as completed
      const activeConns = state.delegationState.activeConnections.filter(
        (c) => c.source === event.sourceAgent
      );
      activeConns.forEach((conn) => {
        state.completeConnection(conn.source, conn.target);
      });
    }
  },
}));
