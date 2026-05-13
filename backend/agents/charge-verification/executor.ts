import { 
  JsonRpcRequest, 
  JsonRpcResponse, 
  Message, 
  MessagePart,
  Task, 
  TrailEvent,
  A2AAgent 
} from '../../shared/types';
import { McpClient } from '../../shared/mcp-client';
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

export class ChargeVerificationExecutor implements A2AAgent, AgentExecutor {
  
  // Helper to parse charge-related keywords
  private containsChargeKeywords(message: string): boolean {
    const lower = message.toLowerCase();
    const keywords = ['charge', 'unrecognized', 'fraud', 'dispute', 'transaction', 'unauthorized', 'suspicious'];
    return keywords.some(k => lower.includes(k));
  }

  // Helper to check if user confirms dispute
  private isConfirmation(message: string): boolean {
    const lower = message.toLowerCase();
    return lower.includes('yes') || lower.includes('confirm') || lower.includes('dispute') || lower.includes('proceed');
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

    // Check if this is a first interaction (no previous history)
    // For simplicity, we assume first interaction if message contains charge keywords
    if (this.containsChargeKeywords(userText) && !this.isConfirmation(userText)) {
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

      // Present charge details to user
      const responseMessage = `I found a charge that might be relevant:\n\n` +
        `Amount: ${mockCharge.amount}\n` +
        `Merchant: ${mockCharge.merchant}\n` +
        `Date: ${mockCharge.date}\n` +
        `Transaction ID: ${mockCharge.id}\n` +
        `Card: ****${mockCharge.cardLast4}\n\n` +
        `Is this the charge you're referring to? If this charge is unrecognized and you want to dispute it, ` +
        `I can escalate this to our Card Replacement team to issue a new card. ` +
        `Would you like me to proceed with the dispute and card replacement?`;

      eventBus.publish({
        type: 'agent_response',
        agent: 'charge-verification',
        timestamp: new Date().toISOString(),
        data: {
          action: 'agent-response',
          response: responseMessage
        }
      });
      return;
    }

    // If user confirms, delegate to card-replacement agent
    if (this.isConfirmation(userText)) {
      // Emit delegation event
      eventBus.publish({
        type: 'agent_delegation',
        agent: 'charge-verification',
        timestamp: new Date().toISOString(),
        data: {
          action: 'agent-delegation',
          targetAgent: CARD_REPLACEMENT_URL,
          reason: 'unrecognized-charge',
          chargeDetails: mockCharge
        }
      });

      // Create JSON-RPC request for delegation
      const jsonRpcRequest: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: uuidv4(),
        method: 'tasks/send',
        params: {
          message: {
            role: 'user',
            parts: [{ 
              kind: 'text', 
              text: `I need to replace my card due to unrecognized charge. Amount: ${mockCharge.amount} from ${mockCharge.merchant}, Transaction ID: ${mockCharge.id}` 
            }]
          },
          metadata: {
            delegationSource: 'charge-verification',
            reason: 'unrecognized-charge',
            chargeDetails: mockCharge
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
            delegationResult: result
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
            error: errorMessage
          }
        });
      }
      return;
    }

    // Default response
    eventBus.publish({
      type: 'agent_response',
      agent: 'charge-verification',
      timestamp: new Date().toISOString(),
      data: {
        action: 'agent-response',
        response: 'I can help you verify charges on your account. Please describe the charge you are concerned about.'
      }
    });
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
    
    // Check if this is a confirmation or escalation
    const lowerMessage = userMessage.toLowerCase();
    const isConfirmation = lowerMessage.includes('yes') || 
                          lowerMessage.includes('confirm') || 
                          lowerMessage.includes('proceed') ||
                          lowerMessage.includes('dispute');
    
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

    // Check if we have a previous context (confirmation flow)
    const previousHistory = task.history || [];
    const hasPreviousChargeContext = previousHistory.some(m => 
      m.parts.some(p => p.kind === 'text' && p.text.includes('TechStore Pro'))
    );

    // If confirming and we have previous charge context, delegate to card replacement
    if (isConfirmation && hasPreviousChargeContext) {
      const chargeDetails = {
        amount: mockCharge.amount,
        merchant: mockCharge.merchant,
        transactionId: mockCharge.id,
        date: mockCharge.date
      };

      emitTrail({
        type: 'agent_action',
        agent: 'charge-verification',
        timestamp: new Date().toISOString(),
        data: {
          action: 'charge_confirmed_dispute',
          chargeDetails,
          nextStep: 'delegating_to_card_replacement'
        }
      });

      try {
        const delegationResponse = await this.delegateToCardReplacement(
          'unrecognized-charge',
          chargeDetails,
          emitTrail
        );

        task.status = {
          state: 'working',
          message: {
            role: 'agent',
            parts: [{ 
              kind: 'text', 
              text: 'I\'ve escalated this to our Card Replacement team. They will help you with the replacement process.' 
            }]
          }
        };
        task.metadata!.delegatedTo = CARD_REPLACEMENT_URL;
        task.metadata!.delegationResponse = delegationResponse.result;
        tasks.set(taskId, task);

        return {
          jsonrpc: '2.0',
          id,
          result: task
        };
      } catch (error) {
        task.status = {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ 
              kind: 'text', 
              text: 'Failed to escalate to Card Replacement team. Please try again.' 
            }]
          }
        };
        tasks.set(taskId, task);

        return {
          jsonrpc: '2.0',
          id,
          result: task
        };
      }
    }

    // If first interaction and message mentions charge, present mock charge details
    if (this.containsChargeKeywords(userMessage) && !isConfirmation) {
      // Emit tool-call event for charge lookup
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

      // Found the charge - ask for confirmation
      task.status = {
        state: 'working',
        message: {
          role: 'agent',
          parts: [{ 
            kind: 'text', 
            text: `I found the charge you're referring to:\n\n` +
                  `Amount: ${mockCharge.amount}\n` +
                  `Merchant: ${mockCharge.merchant}\n` +
                  `Date: ${mockCharge.date}\n` +
                  `Transaction ID: ${mockCharge.id}\n` +
                  `Card: ****${mockCharge.cardLast4}\n\n` +
                  `If this charge is unrecognized and you want to dispute it, ` +
                  `I can escalate this to our Card Replacement team to issue a new card. ` +
                  `Would you like me to proceed with the dispute and card replacement?`
          }]
        }
      };
      task.metadata!.foundCharge = mockCharge;
      tasks.set(taskId, task);

      return {
        jsonrpc: '2.0',
        id,
        result: task
      };
    } else {
      // No matching charge found or ambiguous
      task.status = {
        state: 'working',
        message: {
          role: 'agent',
          parts: [{ 
            kind: 'text', 
            text: `I couldn't find a matching charge with the details you provided.\n\n` +
                  `Could you please provide more specific information about the charge? ` +
                  `For example:\n` +
                  `- The exact amount\n` +
                  `- The merchant name\n` +
                  `- The approximate date\n\n` +
                  `Or I can show you your recent charges if that helps.`
          }]
        }
      };
      tasks.set(taskId, task);

      return {
        jsonrpc: '2.0',
        id,
        result: task
      };
    }
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
        chargeDetails
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
            text: `I need to replace my card due to unrecognized charge. Amount: ${chargeDetails.amount} from ${chargeDetails.merchant}, Transaction ID: ${chargeDetails.transactionId}` 
          }]
        },
        metadata: {
          delegationSource: 'charge-verification',
          reason: 'unrecognized-charge',
          chargeDetails
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
          success: !result.error
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