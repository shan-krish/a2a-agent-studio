// A2A Agent Studio Types

export interface Agent {
  id: string;
  name: string;
  description: string;
  status: 'online' | 'offline';
  color: string;
  skills: string[];
  url: string;
  isActive?: boolean;
  lastActivity?: Date;
}

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'agent';
  agentId?: string;
  agentName?: string;
  agentColor?: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  serverName: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'error';
  duration?: number;
  timestamp: Date;
}

export type TrailEventType = 
  | 'user-message'
  | 'agent-thinking'
  | 'agent-delegation'
  | 'tool-call'
  | 'tool-result'
  | 'agent-response'
  | 'error';

export interface TrailEvent {
  id: string;
  timestamp: Date;
  type: TrailEventType;
  sourceAgent: string;
  targetAgent?: string;
  toolName?: string;
  content: string;
  metadata?: Record<string, unknown>;
  duration?: number;
  status?: 'pending' | 'in-progress' | 'completed' | 'error';
}

export interface AgentConnection {
  source: string;
  target: string;
  label?: string;
  status?: 'idle' | 'active' | 'completed';
  lastActivity?: Date;
  direction?: 'source-to-target' | 'target-to-source' | 'bidirectional';
}

export interface DelegationState {
  currentDelegations: AgentConnection[];
  activeConnections: string[]; // Connection IDs that are currently active
  completedDelegations: string[]; // Connection IDs that have completed
}

// JSON-RPC types for A2A protocol
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface TasksSendParams {
  id: string;
  message: {
    role: 'user' | 'agent';
    content: string;
  };
}

// API Response types
export interface AgentDiscoveryResponse {
  agents: Agent[];
}

export interface ChatResponse {
  id: string;
  content: string;
  agentId: string;
  toolCalls?: ToolCall[];
}
