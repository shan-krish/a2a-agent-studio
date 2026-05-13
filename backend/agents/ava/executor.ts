import { 
  JsonRpcRequest, 
  JsonRpcResponse, 
  Message, 
  MessagePart,
  Task, 
  TaskState,
  TrailEvent,
  A2AAgent 
} from '../../shared/types';
import { getLLMService, LLMService } from '../../shared/llm-service';
import { v4 as uuidv4 } from 'uuid';

// Define types required by AgentExecutor interface
export interface RequestContext {
  taskId: string;
  contextId: string;
  userMessage: Message;
}

export interface IExecutionEventBus {
  publish(event: any): void;
}

export interface AgentExecutor {
  execute(requestContext: RequestContext, eventBus: IExecutionEventBus): Promise<void>;
  cancelTask(taskId: string, eventBus: IExecutionEventBus): Promise<void>;
}

// In-memory task storage
const tasks: Map<string, Task> = new Map();

// Agent URLs
const CHARGE_VERIFICATION_URL = 'http://localhost:4001';
const CARD_REPLACEMENT_URL = 'http://localhost:4002';

// Conversation history for LLM context
const conversationHistories: Map<string, Array<{ role: 'user' | 'assistant'; content: string }>> = new Map();

export class OrchestratorExecutor implements A2AAgent, AgentExecutor {
  private llmService: LLMService;
  
  constructor() {
    this.llmService = getLLMService();
  }
  
  private async classifyIntent(message: string, taskId?: string): Promise<'charge_verification' | 'card_replacement' | 'unknown'> {
    // Get conversation history for context
    const history = taskId ? (conversationHistories.get(taskId) || []) : [];
    const context = history.length > 0 
      ? `Previous conversation: ${history.slice(-3).map(h => `${h.role}: ${h.content}`).join('; ')}`
      : undefined;
    
    try {
      const analysis = await this.llmService.analyzeIntent(message, context);
      
      // Map LLM intent to our intents
      switch (analysis.intent) {
        case 'charge_verification':
        case 'charge_dispute':
        case 'charge_confirmed':
        case 'charge_denied':
          return 'charge_verification';
        case 'card_replacement':
          return 'card_replacement';
        default:
          return 'unknown';
      }
    } catch (error) {
      console.error('Intent classification failed, using fallback:', error);
      // Fallback to simple keyword matching
      return this.fallbackIntentClassification(message);
    }
  }
  
  private fallbackIntentClassification(message: string): 'charge_verification' | 'card_replacement' | 'unknown' {
    const lowerMessage = message.toLowerCase();
    
    // Charge-related keywords
    const chargeKeywords = [
      'charge', 'unrecognized', 'didn\'t make', 'unauthorized', 
      'suspicious', 'fraud', 'dispute', 'transaction'
    ];
    
    // Card-related keywords
    const cardKeywords = [
      'lost', 'stolen', 'replacement', 'new card', 'damaged', 'broken',
      'need card', 'replace card', 'card replacement'
    ];
    
    const chargeScore = chargeKeywords.filter(keyword => lowerMessage.includes(keyword)).length;
    const cardScore = cardKeywords.filter(keyword => lowerMessage.includes(keyword)).length;
    
    if (chargeScore > cardScore) {
      return 'charge_verification';
    } else if (cardScore > chargeScore) {
      return 'card_replacement';
    }
    
    // Default to charge verification for unrecognized charges with dollar amounts
    if (lowerMessage.includes('$') && (lowerMessage.includes('from') || lowerMessage.includes('at'))) {
      return 'charge_verification';
    }
    
    return 'unknown';
  }

  private async delegateToAgent(
    agentUrl: string, 
    request: JsonRpcRequest,
    emitTrail: (event: TrailEvent) => void
  ): Promise<JsonRpcResponse> {
    emitTrail({
      type: 'delegation',
      agent: 'ava',
      timestamp: new Date().toISOString(),
      data: {
        targetAgent: agentUrl,
        method: request.method,
        taskId: request.params?.taskId
      }
    });

    try {
      const response = await fetch(`${agentUrl}/a2a`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = (await response.json()) as JsonRpcResponse;
      
      emitTrail({
        type: 'agent_action',
        agent: 'ava',
        timestamp: new Date().toISOString(),
        data: {
          action: 'delegation_complete',
          targetAgent: agentUrl,
          success: !result.error
        }
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      emitTrail({
        type: 'agent_action',
        agent: 'ava',
        timestamp: new Date().toISOString(),
        data: {
          action: 'delegation_failed',
          targetAgent: agentUrl,
          error: errorMessage
        }
      });

      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32000,
          message: `Failed to delegate to ${agentUrl}: ${errorMessage}`
        }
      };
    }
  }

  // AgentExecutor interface implementation
  async execute(requestContext: RequestContext, eventBus: IExecutionEventBus): Promise<void> {
    const { taskId, userMessage } = requestContext;
    const userText = userMessage.parts.find(p => p.kind === 'text')?.text || '';

    // Publish agent-thinking event
    eventBus.publish({
      type: 'agent_action',
      agent: 'ava',
      timestamp: new Date().toISOString(),
      data: {
        action: 'agent-thinking',
        userMessage: userText
      }
    });

    // Update conversation history
    let history = conversationHistories.get(taskId) || [];
    history.push({ role: 'user', content: userText });
    conversationHistories.set(taskId, history);

    // Classify intent using LLM
    const intent = await this.classifyIntent(userText, taskId);

    eventBus.publish({
      type: 'agent_action',
      agent: 'ava',
      timestamp: new Date().toISOString(),
      data: {
        action: 'intent_classified',
        intent,
        userMessage: userText,
        method: 'llm_analysis'
      }
    });

    let targetAgentUrl: string;
    switch (intent) {
      case 'charge_verification':
        targetAgentUrl = CHARGE_VERIFICATION_URL;
        break;
      case 'card_replacement':
        targetAgentUrl = CARD_REPLACEMENT_URL;
        break;
      default:
        // Generate natural response using LLM
        const helpResponse = await this.llmService.generateResponse(
          `You are AVA, a customer service assistant. The user's request is unclear. 
          Help them understand you can assist with charge disputes or card replacements.
          Be friendly and clear.`,
          userText,
          history.slice(-5)
        );
        
        eventBus.publish({
          type: 'agent_response',
          agent: 'ava',
          timestamp: new Date().toISOString(),
          data: {
            action: 'agent-response',
            response: helpResponse
          }
        });
        
        // Update history
        history.push({ role: 'assistant', content: helpResponse });
        conversationHistories.set(taskId, history);
        return;
    }

    // Delegate to sub-agent via A2A JSON-RPC tasks/send
    const jsonRpcRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'tasks/send',
      params: {
        message: userMessage,
        taskId
      }
    };

    eventBus.publish({
      type: 'agent_delegation',
      agent: 'ava',
      timestamp: new Date().toISOString(),
      data: {
        action: 'agent-delegation',
        targetAgent: targetAgentUrl,
        method: 'tasks/send',
        taskId
      }
    });

    // Use delegateToAgent helper (adapt to eventBus)
    const emitTrail = (event: TrailEvent) => eventBus.publish(event);
    const response = await this.delegateToAgent(targetAgentUrl, jsonRpcRequest, emitTrail);

    // Publish delegation result
    eventBus.publish({
      type: 'agent_response',
      agent: 'ava',
      timestamp: new Date().toISOString(),
      data: {
        action: 'agent-response',
        delegationResult: response.result || response.error
      }
    });
  }

  async cancelTask(taskId: string, eventBus: IExecutionEventBus): Promise<void> {
    const task = tasks.get(taskId);
    if (!task) {
      eventBus.publish({
        type: 'agent_action',
        agent: 'ava',
        timestamp: new Date().toISOString(),
        data: {
          action: 'cancel_failed',
          error: `Task not found: ${taskId}`
        }
      });
      return;
    }

    task.status = { state: 'cancelled' };
    tasks.set(taskId, task);

    eventBus.publish({
      type: 'status_change',
      agent: 'ava',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        state: 'cancelled'
      }
    });
  }

  // A2AAgent interface implementation (kept for backward compatibility)
  async handleTask(request: JsonRpcRequest, emitTrail: (event: TrailEvent) => void): Promise<JsonRpcResponse> {
    const { method, params, id } = request;

    emitTrail({
      type: 'agent_action',
      agent: 'ava',
      timestamp: new Date().toISOString(),
      data: {
        action: 'request_received',
        method,
        params
      }
    });

    switch (method) {
      case 'tasks/send':
        return this.handleTasksSend(params, id, emitTrail);
      
      case 'tasks/sendSubscribe':
        return this.handleTasksSendSubscribe(params, id, emitTrail);
      
      case 'tasks/get':
        return this.handleTasksGet(params, id);
      
      case 'tasks/cancel':
        return this.handleTasksCancel(params, id, emitTrail);
      
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        };
    }
  }

  private async handleTasksSend(
    params: any, 
    id: string | number,
    emitTrail: (event: TrailEvent) => void
  ): Promise<JsonRpcResponse> {
    const message: Message = params.message;
    const userMessage = message.parts.find(p => p.kind === 'text')?.text || '';
    
    // Create or update task
    const taskId = params.taskId || uuidv4();
    const task: Task = {
      id: taskId,
      status: {
        state: 'working',
        message: {
          role: 'agent',
          parts: [{ kind: 'text', text: 'Processing your request...' }]
        }
      },
      history: [message],
      metadata: {}
    };
    
    tasks.set(taskId, task);

    emitTrail({
      type: 'status_change',
      agent: 'ava',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        state: 'working',
        message: 'Classifying intent...'
      }
    });

    // Update conversation history
    let history = conversationHistories.get(taskId) || [];
    history.push({ role: 'user', content: userMessage });
    conversationHistories.set(taskId, history);

    // Classify the intent using LLM
    const intent = await this.classifyIntent(userMessage, taskId);
    
    emitTrail({
      type: 'agent_action',
      agent: 'ava',
      timestamp: new Date().toISOString(),
      data: {
        action: 'intent_classified',
        intent,
        userMessage,
        method: 'llm_analysis'
      }
    });

    // Update task with classification
    task.metadata!.intent = intent;
    tasks.set(taskId, task);

    let targetAgent: string;
    let agentResponse: JsonRpcResponse;

    switch (intent) {
      case 'charge_verification':
        targetAgent = CHARGE_VERIFICATION_URL;
        agentResponse = await this.delegateToAgent(
          targetAgent,
          {
            jsonrpc: '2.0',
            id: uuidv4(),
            method: 'tasks/send',
            params: { message, taskId }
          },
          emitTrail
        );
        break;

      case 'card_replacement':
        targetAgent = CARD_REPLACEMENT_URL;
        agentResponse = await this.delegateToAgent(
          targetAgent,
          {
            jsonrpc: '2.0',
            id: uuidv4(),
            method: 'tasks/send',
            params: { message, taskId }
          },
          emitTrail
        );
        break;

      default:
        // Unknown intent - generate natural response using LLM
        const clarificationResponse = await this.llmService.generateResponse(
          `You are AVA, a customer service assistant. The user's request is unclear.
          Help them understand you can assist with:
          1. Charge disputes and verification
          2. Card replacements
          Ask them to clarify what they need help with.`,
          userMessage,
          history.slice(-5)
        );
        
        task.status = {
          state: 'working',
          message: {
            role: 'agent',
            parts: [{ 
              kind: 'text', 
              text: clarificationResponse
            }]
          }
        };
        tasks.set(taskId, task);
        
        // Update history
        history.push({ role: 'assistant', content: clarificationResponse });
        conversationHistories.set(taskId, history);
        
        return {
          jsonrpc: '2.0',
          id,
          result: task
        };
    }

    // Update task with agent response
    if (agentResponse.result) {
      task.status = agentResponse.result.status || { state: 'completed' };
      task.history = [...(task.history || []), ...(agentResponse.result.history || [])];
      task.metadata!.delegatedTo = targetAgent;
      tasks.set(taskId, task);
    }

    return {
      jsonrpc: '2.0',
      id,
      result: task
    };
  }

  private async handleTasksSendSubscribe(
    params: any,
    id: string | number,
    emitTrail: (event: TrailEvent) => void
  ): Promise<JsonRpcResponse> {
    // For simplicity, this implementation delegates the streaming to the target agent
    // In a real implementation, you would set up SSE streaming
    return this.handleTasksSend(params, id, emitTrail);
  }

  private handleTasksGet(params: any, id: string | number): JsonRpcResponse {
    const taskId = params.taskId;
    const task = tasks.get(taskId);

    if (!task) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: `Task not found: ${taskId}`
        }
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: task
    };
  }

  private handleTasksCancel(
    params: any, 
    id: string | number,
    emitTrail: (event: TrailEvent) => void
  ): JsonRpcResponse {
    const taskId = params.taskId;
    const task = tasks.get(taskId);

    if (!task) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: `Task not found: ${taskId}`
        }
      };
    }

    task.status = { state: 'cancelled' };
    tasks.set(taskId, task);

    emitTrail({
      type: 'status_change',
      agent: 'ava',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        state: 'cancelled'
      }
    });

    return {
      jsonrpc: '2.0',
      id,
      result: task
    };
  }
}