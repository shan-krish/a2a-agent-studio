// A2A Protocol Types
export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
  };
  skills: AgentSkill[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
}

// A2A Message Types
export interface Message {
  role: 'user' | 'agent';
  parts: MessagePart[];
}

export interface MessagePart {
  kind: 'text';
  text: string;
}

// A2A Task Types
export type TaskState = 'submitted' | 'working' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  status: TaskStatus;
  history?: Message[];
  artifacts?: TaskArtifact[];
  metadata?: Record<string, any>;
}

export interface TaskStatus {
  state: TaskState;
  message?: Message;
}

export interface TaskArtifact {
  name: string;
  parts: MessagePart[];
}

// A2A JSON-RPC Types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

// Trail Event for UI visualization
export interface TrailEvent {
  type: 'agent_action' | 'tool_call' | 'tool_result' | 'message' | 'delegation' | 'status_change';
  agent: string;
  timestamp: string;
  data: any;
}

// MCP Protocol Types
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema?: Record<string, any>;
}

export interface McpToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface McpToolResult {
  content: any;
  isError?: boolean;
}

// Mocked Data Types
export interface Customer {
  id: string;
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  card: {
    lastFour: string;
    expiration: string;
  };
}

export interface Charge {
  id: string;
  amount: number;
  merchant: string;
  date: string;
  transactionId: string;
}

export interface DeliveryOption {
  id: string;
  name: string;
  timeframe: string;
  cost: number;
}

export type ReplacementReason = 'lost' | 'stolen' | 'damaged' | 'fraud' | 'unrecognized-charge';

export interface ReplacementOrder {
  id: string;
  customer: Customer;
  reason: ReplacementReason;
  deliveryMethod: DeliveryOption;
  status: 'pending' | 'processing' | 'shipped';
  estimatedDelivery: string;
}

// A2A Agent Interface
export interface A2AAgent {
  handleTask(request: JsonRpcRequest, emitTrail: (event: TrailEvent) => void): Promise<JsonRpcResponse>;
}
