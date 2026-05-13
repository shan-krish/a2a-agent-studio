import { 
  JsonRpcRequest, 
  JsonRpcResponse, 
  Message, 
  MessagePart,
  Task, 
  TrailEvent,
  A2AAgent,
  McpToolCall 
} from '../../shared/types';
import { McpClient } from '../../shared/mcp-client';
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

// Mock charge data as per requirement
const mockCharge = {
  id: 'TXN-8827193',
  amount: '$299.99',
  merchant: 'TechStore Pro',
  date: '2026-04-28',
  cardLast4: '4821'
};

// Card replacement agent URL
const CARD_REPLACEMENT_URL = 'http://localhost:4002';

// Conversation state tracking
interface ChargeVerificationState {
  step: 'initial' | 'presented' | 'awaiting_response' | 'confirmed' | 'disputed' | 'escalated';
  chargeShown: boolean;
  userResponse?: string;
}

const verificationStates: Map<string, ChargeVerificationState> = new Map();

export class ChargeVerificationExecutor implements A2AAgent, AgentExecutor {
  private llmService: LLMService;
  
  constructor() {
    this.llmService = getLLMService();
  }
  
  private getOrCreateState(taskId: string): ChargeVerificationState {
    let state = verificationStates.get(taskId);
    if (!state) {
      state = { step: 'initial', chargeShown: false };
      verificationStates.set(taskId, state);
    }
    return state;
  }

  // AgentExecutor interface implementation
  async execute(requestContext: RequestContext, eventBus: IExecutionEventBus): Promise<void> {
    const { taskId, userMessage } = requestContext;
    const userText = userMessage.parts.find(p => p.kind === 'text')?.text || '';

    // Emit agent-thinking event
    eventBus.publish({
      type: 'agent_action',
      agent: 'charge-verification',
      timestamp: new Date().toISOString(),
      data: {
        action: 'agent-thinking',
        userMessage: userText
      }
    });

    const state = this.getOrCreateState(taskId);
    
    // Use LLM to analyze intent
    let intentAnalysis;
    try {
      intentAnalysis = await this.llmService.analyzeIntent(userText, `Current step: ${state.step}, Charge shown: ${state.chargeShown}`);
    } catch (error) {
      console.error('LLM analysis failed, using fallback:', error);
      intentAnalysis = this.fallbackIntentAnalysis(userText, state);
    }

    eventBus.publish({
      type: 'agent_action',
      agent: 'charge-verification',
      timestamp: new Date().toISOString(),
      data: {
        action: 'intent_analyzed',
        analysis: intentAnalysis,
        currentStep: state.step
      }
    });

    // Handle different flow states
    if (state.step === 'initial' || !state.chargeShown) {
      // First interaction - present charge details
      await this.presentChargeDetails(taskId, eventBus);
      state.step = 'presented';
      state.chargeShown = true;
      verificationStates.set(taskId, state);
      return;
    }

    // Handle user response based on intent
    switch (intentAnalysis.intent) {
      case 'charge_confirmed':
        // Customer says YES - charge is legitimate
        await this.handleChargeConfirmed(taskId, userText, eventBus);
        break;
        
      case 'charge_denied':
      case 'charge_dispute':
        // Customer says NO - charge is fraudulent, escalate to card replacement
        await this.handleChargeDenied(taskId, userText, eventBus);
        break;
        
      default:
        // Ambiguous response - use LLM to generate clarification
        await this.handleAmbiguousResponse(taskId, userText, eventBus);
        break;
    }
  }

  private async presentChargeDetails(
    taskId: string,
    eventBus: IExecutionEventBus
  ): Promise<void> {
    // Emit tool-call event for charge lookup
    eventBus.publish({
      type: 'tool_call',
      agent: 'charge-verification',
      timestamp: new Date().toISOString(),
      data: {
        action: 'charge_lookup',
        tool: 'mock_charge_lookup',
        chargeId: mockCharge.id
      }
    });

    // Generate natural response using LLM
    const response = await this.llmService.generateChargeVerificationResponse(mockCharge);
    
    eventBus.publish({
      type: 'agent_response',
      agent: 'charge-verification',
      timestamp: new Date().toISOString(),
      data: {
        action: 'agent-response',
        response,
        chargeDetails: mockCharge,
        step: 'present_charge'
      }
    });
  }

  private async handleChargeConfirmed(
    taskId: string,
    userText: string,
    eventBus: IExecutionEventBus
  ): Promise<void> {
    const state = this.getOrCreateState(taskId);
    state.step = 'confirmed';
    state.userResponse = userText;
    verificationStates.set(taskId, state);

    // Generate confirmation response using LLM
    const response = await this.llmService.generateResponse(
      `You are a customer service agent. The customer has confirmed they made the charge for ${mockCharge.amount} at ${mockCharge.merchant}.
      Thank them for confirming and let them know the transaction is verified. Be professional and friendly.`,
      userText
    );

    eventBus.publish({
      type: 'agent_response',
      agent: 'charge-verification',
      timestamp: new Date().toISOString(),
      data: {
        action: 'agent-response',
        response,
        status: 'charge_confirmed',
        chargeDetails: mockCharge
      }
    });

    // Emit completion event
    eventBus.publish({
      type: 'status_change',
      agent: 'charge-verification',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        state: 'completed',
        message: 'Charge verified - customer confirmed transaction'
      }
    });
  }

  private async handleChargeDenied(
    taskId: string,
    userText: string,
    eventBus: IExecutionEventBus
  ): Promise<void> {
    const state = this.getOrCreateState(taskId);
    state.step = 'disputed';
    state.userResponse = userText;
    verificationStates.set(taskId, state);

    // Emit delegation event - this is now a fraud case
    eventBus.publish({
      type: 'agent_delegation',
      agent: 'charge-verification',
      timestamp: new Date().toISOString(),
      data: {
        action: 'agent-delegation',
        targetAgent: CARD_REPLACEMENT_URL,
        reason: 'unrecognized-charge-fraud',
        chargeDetails: mockCharge,
        fraudFlag: true
      }
    });

    // Generate response explaining escalation
    const escalationMessage = await this.llmService.generateResponse(
      `You are a customer service agent. The customer has stated they did NOT make the charge for ${mockCharge.amount} at ${mockCharge.merchant}.
      This is a potential fraud case. Explain that you will escalate this to the Card Replacement team to issue a new card immediately.
      Be empathetic and reassuring. Let them know you're taking this seriously.`,
      userText
    );

    // Create JSON-RPC request for delegation to card replacement
    const jsonRpcRequest: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'tasks/send',
      params: {
        message: {
          role: 'user',
          parts: [{ 
            kind: 'text', 
            text: `URGENT FRAUD CASE: Customer did not authorize charge of ${mockCharge.amount} from ${mockCharge.merchant}. Need immediate card replacement. Transaction ID: ${mockCharge.id}` 
          }]
        },
        metadata: {
          delegationSource: 'charge-verification',
          reason: 'unrecognized-charge-fraud',
          chargeDetails: mockCharge,
          fraudFlag: true,
          originalUserMessage: userText
        }
      }
    };

    try {
      const response = await fetch(`${CARD_REPLACEMENT_URL}/a2a`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonRpcRequest),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      eventBus.publish({
        type: 'agent_response',
        agent: 'charge-verification',
        timestamp: new Date().toISOString(),
        data: {
          action: 'agent-response',
          response: escalationMessage,
          delegationResult: result,
          status: 'escalated_to_card_replacement',
          fraudFlag: true
        }
      });

      // Update state
      state.step = 'escalated';
      verificationStates.set(taskId, state);

      // Emit completion event for charge verification
      eventBus.publish({
        type: 'status_change',
        agent: 'charge-verification',
        timestamp: new Date().toISOString(),
        data: {
          taskId,
          state: 'completed',
          message: 'Charge disputed - escalated to card replacement for fraud handling'
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      eventBus.publish({
        type: 'agent_response',
        agent: 'charge-verification',
        timestamp: new Date().toISOString(),
        data: {
          action: 'agent-response',
          response: `${escalationMessage}\n\nI apologize, but I'm having trouble connecting to our Card Replacement team. Please call our fraud hotline immediately at 1-800-FRAUD-HOTLINE.`,
          error: errorMessage,
          status: 'escalation_failed'
        }
      });
    }
  }

  private async handleAmbiguousResponse(
    taskId: string,
    userText: string,
    eventBus: IExecutionEventBus
  ): Promise<void> {
    // Generate clarification using LLM
    const response = await this.llmService.generateResponse(
      `You are a customer service agent. The customer's response is unclear about whether they made the charge or not.
      The charge in question is ${mockCharge.amount} at ${mockCharge.merchant}.
      Ask them clearly: Did you make this charge or not? We need to know to proceed with the right action.`,
      userText
    );

    eventBus.publish({
      type: 'agent_response',
      agent: 'charge-verification',
      timestamp: new Date().toISOString(),
      data: {
        action: 'agent-response',
        response,
        step: 'clarification_needed'
      }
    });
  }

  private fallbackIntentAnalysis(message: string, state: ChargeVerificationState): {
    intent: 'charge_verification' | 'card_replacement' | 'charge_dispute' | 'charge_confirmed' | 'charge_denied' | 'unknown';
    confidence: number;
    reasoning: string;
  } {
    const lower = message.toLowerCase();
    
    // If charge hasn't been shown yet, it's initial verification
    if (!state.chargeShown) {
      return { intent: 'charge_verification', confidence: 0.9, reasoning: 'Initial charge inquiry' };
    }
    
    // Check for confirmation
    const confirmKeywords = ['yes', 'confirm', 'i made', 'i did', 'legitimate', 'that\'s mine'];
    const denyKeywords = ['no', 'didn\'t', 'never', 'fraud', 'unauthorized', 'stolen', 'not mine'];
    
    const confirmScore = confirmKeywords.filter(k => lower.includes(k)).length;
    const denyScore = denyKeywords.filter(k => lower.includes(k)).length;
    
    if (confirmScore > denyScore) {
      return { intent: 'charge_confirmed', confidence: 0.8, reasoning: 'User confirmed charge' };
    }
    
    if (denyScore > confirmScore) {
      return { intent: 'charge_denied', confidence: 0.8, reasoning: 'User denied charge' };
    }
    
    return { intent: 'unknown', confidence: 0.4, reasoning: 'Unclear response' };
  }

  async cancelTask(taskId: string, eventBus: IExecutionEventBus): Promise<void> {
    const task = tasks.get(taskId);
    if (!task) {
      eventBus.publish({
        type: 'agent_action',
        agent: 'charge-verification',
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
    verificationStates.delete(taskId);

    eventBus.publish({
      type: 'status_change',
      agent: 'charge-verification',
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
      agent: 'charge-verification',
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
    const taskId = params.taskId || uuidv4();
    const metadata = params.metadata || {};
    
    // Get or create verification state
    let state = this.getOrCreateState(taskId);
    
    // Check if this is a delegated request from AVA
    if (metadata.delegationSource === 'ava') {
      // Fresh start from orchestrator
      state = { step: 'initial', chargeShown: false };
      verificationStates.set(taskId, state);
    }

    const task: Task = {
      id: taskId,
      status: {
        state: 'working',
        message: {
          role: 'agent',
          parts: [{ kind: 'text', text: 'Looking up charge information...' }]
        }
      },
      history: [message],
      metadata: {}
    };
    
    tasks.set(taskId, task);

    emitTrail({
      type: 'status_change',
      agent: 'charge-verification',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        state: 'working',
        message: 'Processing charge verification request...'
      }
    });

    // Use LLM to analyze intent
    let intentAnalysis;
    try {
      intentAnalysis = await this.llmService.analyzeIntent(userMessage, `Current step: ${state.step}, Charge shown: ${state.chargeShown}`);
    } catch (error) {
      console.error('LLM analysis failed, using fallback:', error);
      intentAnalysis = this.fallbackIntentAnalysis(userMessage, state);
    }

    // Handle different flow states
    if (state.step === 'initial' || !state.chargeShown) {
      // First interaction - present charge details
      emitTrail({
        type: 'tool_call',
        agent: 'charge-verification',
        timestamp: new Date().toISOString(),
        data: {
          action: 'charge_lookup',
          tool: 'mock_charge_lookup',
          chargeId: mockCharge.id
        }
      });

      // Generate natural response using LLM
      const response = await this.llmService.generateChargeVerificationResponse(mockCharge);
      
      task.status = {
        state: 'working',
        message: {
          role: 'agent',
          parts: [{ kind: 'text', text: response }]
        }
      };
      task.metadata!.chargeDetails = mockCharge;
      task.metadata!.step = 'present_charge';
      tasks.set(taskId, task);

      state.step = 'presented';
      state.chargeShown = true;
      verificationStates.set(taskId, state);

      return {
        jsonrpc: '2.0',
        id,
        result: task
      };
    }

    // Handle user response based on intent
    let responseMessage: string;
    
    switch (intentAnalysis.intent) {
      case 'charge_confirmed':
        // Customer says YES - charge is legitimate
        responseMessage = await this.llmService.generateResponse(
          `You are a customer service agent. The customer has confirmed they made the charge for ${mockCharge.amount} at ${mockCharge.merchant}.
          Thank them for confirming and let them know the transaction is verified. Be professional and friendly.`,
          userMessage
        );
        
        state.step = 'confirmed';
        verificationStates.set(taskId, state);
        
        task.status = {
          state: 'completed',
          message: {
            role: 'agent',
            parts: [{ kind: 'text', text: responseMessage }]
          }
        };
        task.metadata!.verificationResult = 'confirmed';
        tasks.set(taskId, task);
        
        emitTrail({
          type: 'agent_action',
          agent: 'charge-verification',
          timestamp: new Date().toISOString(),
          data: {
            action: 'charge_confirmed',
            chargeDetails: mockCharge,
            userResponse: userMessage
          }
        });
        break;

      case 'charge_denied':
      case 'charge_dispute':
        // Customer says NO - charge is fraudulent, escalate to card replacement
        responseMessage = await this.llmService.generateResponse(
          `You are a customer service agent. The customer has stated they did NOT make the charge for ${mockCharge.amount} at ${mockCharge.merchant}.
          This is a potential fraud case. Explain that you will escalate this to the Card Replacement team to issue a new card immediately.
          Be empathetic and reassuring. Let them know you're taking this seriously.`,
          userMessage
        );

        // Delegate to card replacement
        const delegationResponse = await this.delegateToCardReplacement(
          'unrecognized-charge-fraud',
          { ...mockCharge, fraudFlag: true },
          emitTrail
        );

        state.step = 'escalated';
        verificationStates.set(taskId, state);

        task.status = {
          state: 'working',
          message: {
            role: 'agent',
            parts: [{ kind: 'text', text: `${responseMessage}\n\nI've escalated this to our Card Replacement team. They will help you with the immediate replacement process.` }]
          }
        };
        task.metadata!.verificationResult = 'disputed';
        task.metadata!.escalatedTo = CARD_REPLACEMENT_URL;
        task.metadata!.delegationResponse = delegationResponse.result;
        tasks.set(taskId, task);
        
        emitTrail({
          type: 'agent_action',
          agent: 'charge-verification',
          timestamp: new Date().toISOString(),
          data: {
            action: 'charge_disputed_fraud',
            chargeDetails: mockCharge,
            userResponse: userMessage,
            escalatedTo: CARD_REPLACEMENT_URL
          }
        });
        break;

      default:
        // Ambiguous response - use LLM to generate clarification
        responseMessage = await this.llmService.generateResponse(
          `You are a customer service agent. The customer's response is unclear about whether they made the charge or not.
          The charge in question is ${mockCharge.amount} at ${mockCharge.merchant}.
          Ask them clearly: Did you make this charge or not? We need to know to proceed with the right action.`,
          userMessage
        );
        
        task.status = {
          state: 'working',
          message: {
            role: 'agent',
            parts: [{ kind: 'text', text: responseMessage }]
          }
        };
        tasks.set(taskId, task);
        break;
    }

    return {
      jsonrpc: '2.0',
      id,
      result: task
    };
  }

  private async delegateToCardReplacement(
    reason: string,
    chargeDetails: any,
    emitTrail: (event: TrailEvent) => void
  ): Promise<JsonRpcResponse> {
    emitTrail({
      type: 'delegation',
      agent: 'charge-verification',
      timestamp: new Date().toISOString(),
      data: {
        targetAgent: CARD_REPLACEMENT_URL,
        reason,
        chargeDetails,
        fraudFlag: true
      }
    });

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: uuidv4(),
      method: 'tasks/send',
      params: {
        message: {
          role: 'user',
          parts: [{ 
            kind: 'text', 
            text: `URGENT FRAUD CASE: Customer did not authorize charge of ${chargeDetails.amount} from ${chargeDetails.merchant}. Need immediate card replacement. Transaction ID: ${chargeDetails.id}` 
          }]
        },
        metadata: {
          delegationSource: 'charge-verification',
          reason: 'unrecognized-charge-fraud',
          chargeDetails,
          fraudFlag: true
        }
      }
    };

    try {
      const response = await fetch(`${CARD_REPLACEMENT_URL}/a2a`, {
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
        agent: 'charge-verification',
        timestamp: new Date().toISOString(),
        data: {
          action: 'delegation_complete',
          targetAgent: CARD_REPLACEMENT_URL,
          success: !result.error,
          fraudFlag: true
        }
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      emitTrail({
        type: 'agent_action',
        agent: 'charge-verification',
        timestamp: new Date().toISOString(),
        data: {
          action: 'delegation_failed',
          targetAgent: CARD_REPLACEMENT_URL,
          error: errorMessage
        }
      });

      throw error;
    }
  }

  private async handleTasksSendSubscribe(
    params: any,
    id: string | number,
    emitTrail: (event: TrailEvent) => void
  ): Promise<JsonRpcResponse> {
    // For simplicity, return the same as tasks/send
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
    verificationStates.delete(taskId);

    emitTrail({
      type: 'status_change',
      agent: 'charge-verification',
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