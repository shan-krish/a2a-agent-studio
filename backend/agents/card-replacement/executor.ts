import { 
  JsonRpcRequest, 
  JsonRpcResponse, 
  Message, 
  Task, 
  TrailEvent,
  A2AAgent,
  McpToolCall 
} from '../../shared/types';
import { createMcpClients, McpClient } from '../../shared/mcp-client';
import { getLLMService, LLMService } from '../../shared/llm-service';
import { v4 as uuidv4 } from 'uuid';

// In-memory task storage
const tasks: Map<string, Task> = new Map();

// State tracking for multi-step workflow
interface ReplacementWorkflowState {
  step: 'address' | 'delivery' | 'reason' | 'submission' | 'complete';
  addressConfirmed: boolean;
  addressData?: any;
  deliveryMethodId?: string;
  deliveryData?: any;
  replacementReason?: string;
  reasonData?: any;
  chargeDetails?: any;
  fraudFlag?: boolean;
}

const workflowStates: Map<string, ReplacementWorkflowState> = new Map();

// Mocked customer data
const mockCustomer = {
  id: 'CUST-001',
  name: 'John Smith',
  address: {
    street: '123 Park Avenue',
    city: 'New York',
    state: 'NY',
    zip: '10001'
  },
  card: {
    lastFour: '4821',
    expiration: '08/27'
  }
};

export class CardReplacementExecutor implements A2AAgent {
  private mcpClients: Record<string, McpClient>;
  private llmService: LLMService;
  
  constructor() {
    this.mcpClients = createMcpClients('card-replacement');
    this.llmService = getLLMService();
  }
  
  private initializeWorkflow(taskId: string, metadata?: any): ReplacementWorkflowState {
    const state: ReplacementWorkflowState = {
      step: 'address',
      addressConfirmed: false,
      chargeDetails: metadata?.chargeDetails,
      fraudFlag: metadata?.fraudFlag || false
    };
    
    workflowStates.set(taskId, state);
    return state;
  }

  private getWorkflowState(taskId: string): ReplacementWorkflowState | null {
    return workflowStates.get(taskId) || null;
  }

  private updateWorkflowState(taskId: string, updates: Partial<ReplacementWorkflowState>): ReplacementWorkflowState {
    const current = this.getWorkflowState(taskId) || this.initializeWorkflow(taskId);
    const updated = { ...current, ...updates };
    workflowStates.set(taskId, updated);
    return updated;
  }

  private async executeAddressStep(
    taskId: string,
    emitTrail: (event: TrailEvent) => void
  ): Promise<string> {
    emitTrail({
      type: 'agent_action',
      agent: 'card-replacement',
      timestamp: new Date().toISOString(),
      data: {
        action: 'starting_address_step',
        step: 'address_confirmation'
      }
    });

    // Call address-confirmation MCP to get current address
    const toolCall: McpToolCall = {
      name: 'get_mailing_address',
      arguments: {
        customerId: mockCustomer.id
      }
    };

    const result = await this.mcpClients.addressConfirmation.callTool(toolCall, emitTrail);
    
    if (result.isError) {
      return `I apologize, but I'm having trouble retrieving your address. Error: ${result.content.error}`;
    }

    const addressData = result.content;
    this.updateWorkflowState(taskId, { 
      addressData,
      step: 'address' 
    });

    // Generate natural response using LLM
    const state = this.getWorkflowState(taskId);
    const isFraudCase = state?.fraudFlag || false;
    
    const response = await this.llmService.generateCardReplacementResponse(
      'address_confirmation',
      mockCustomer,
      [{ role: 'user', content: 'Please confirm my address' }],
      state?.chargeDetails
    );

    return response;
  }

  private async confirmAddress(
    taskId: string,
    address: any,
    emitTrail: (event: TrailEvent) => void
  ): Promise<string> {
    emitTrail({
      type: 'tool_call',
      agent: 'card-replacement',
      timestamp: new Date().toISOString(),
      data: {
        action: 'confirming_address',
        address
      }
    });

    const toolCall: McpToolCall = {
      name: 'confirm_address',
      arguments: {
        customerId: mockCustomer.id,
        address
      }
    };

    const result = await this.mcpClients.addressConfirmation.callTool(toolCall, emitTrail);
    
    if (result.isError) {
      return `There was an error confirming your address: ${result.content.error}`;
    }

    this.updateWorkflowState(taskId, { 
      addressConfirmed: true,
      step: 'delivery' 
    });

    // Generate natural response using LLM
    const response = await this.llmService.generateCardReplacementResponse(
      'delivery_method_selection',
      mockCustomer,
      [{ role: 'user', content: 'Address confirmed, show delivery options' }],
      this.getWorkflowState(taskId)?.chargeDetails
    );

    return response;
  }

  private async executeDeliveryStep(
    taskId: string,
    emitTrail: (event: TrailEvent) => void
  ): Promise<string> {
    emitTrail({
      type: 'agent_action',
      agent: 'card-replacement',
      timestamp: new Date().toISOString(),
      data: {
        action: 'starting_delivery_step',
        step: 'delivery_method'
      }
    });

    // Get delivery options
    const toolCall: McpToolCall = {
      name: 'get_delivery_options',
      arguments: {
        customerId: mockCustomer.id
      }
    };

    const result = await this.mcpClients.deliveryMethod.callTool(toolCall, emitTrail);
    
    if (result.isError) {
      return `I apologize, but I'm having trouble retrieving delivery options. Error: ${result.content.error}`;
    }

    const deliveryData = result.content;
    this.updateWorkflowState(taskId, { 
      deliveryData,
      step: 'delivery' 
    });

    // Generate natural response using LLM
    const state = this.getWorkflowState(taskId);
    const response = await this.llmService.generateCardReplacementResponse(
      'delivery_method_selection',
      mockCustomer,
      [{ role: 'user', content: 'Show delivery options' }],
      state?.chargeDetails
    );

    return response;
  }

  private async selectDeliveryMethod(
    taskId: string,
    methodId: string,
    emitTrail: (event: TrailEvent) => void
  ): Promise<string> {
    emitTrail({
      type: 'tool_call',
      agent: 'card-replacement',
      timestamp: new Date().toISOString(),
      data: {
        action: 'selecting_delivery_method',
        methodId
      }
    });

    const toolCall: McpToolCall = {
      name: 'select_delivery_method',
      arguments: {
        customerId: mockCustomer.id,
        deliveryMethodId: methodId
      }
    };

    const result = await this.mcpClients.deliveryMethod.callTool(toolCall, emitTrail);
    
    if (result.isError) {
      return `There was an error selecting the delivery method: ${result.content.error}`;
    }

    this.updateWorkflowState(taskId, { 
      deliveryMethodId: methodId,
      step: 'reason' 
    });

    // Generate natural response using LLM
    const state = this.getWorkflowState(taskId);
    const response = await this.llmService.generateCardReplacementResponse(
      'replacement_reason_selection',
      mockCustomer,
      [{ role: 'user', content: 'Delivery method selected, show replacement reasons' }],
      state?.chargeDetails
    );

    return response;
  }

  private async executeReasonStep(
    taskId: string,
    emitTrail: (event: TrailEvent) => void
  ): Promise<string> {
    emitTrail({
      type: 'agent_action',
      agent: 'card-replacement',
      timestamp: new Date().toISOString(),
      data: {
        action: 'starting_reason_step',
        step: 'replacement_reason'
      }
    });

    // Get replacement reasons
    const toolCall: McpToolCall = {
      name: 'get_replacement_reasons',
      arguments: {}
    };

    const result = await this.mcpClients.replacementReason.callTool(toolCall, emitTrail);
    
    if (result.isError) {
      return `I apologize, but I'm having trouble retrieving replacement reasons. Error: ${result.content.error}`;
    }

    this.updateWorkflowState(taskId, { step: 'reason' });

    // Generate natural response using LLM
    const state = this.getWorkflowState(taskId);
    const response = await this.llmService.generateCardReplacementResponse(
      'replacement_reason_selection',
      mockCustomer,
      [{ role: 'user', content: 'Show replacement reasons' }],
      state?.chargeDetails
    );

    return response;
  }

  private async selectReplacementReason(
    taskId: string,
    reasonId: string,
    emitTrail: (event: TrailEvent) => void
  ): Promise<string> {
    emitTrail({
      type: 'tool_call',
      agent: 'card-replacement',
      timestamp: new Date().toISOString(),
      data: {
        action: 'selecting_replacement_reason',
        reasonId
      }
    });

    const toolCall: McpToolCall = {
      name: 'select_replacement_reason',
      arguments: {
        customerId: mockCustomer.id,
        reason: reasonId,
        description: `Selected via automated card replacement workflow`
      }
    };

    const result = await this.mcpClients.replacementReason.callTool(toolCall, emitTrail);
    
    if (result.isError) {
      return `There was an error selecting the replacement reason: ${result.content.error}`;
    }

    this.updateWorkflowState(taskId, { 
      replacementReason: reasonId,
      step: 'submission' 
    });

    const state = this.getWorkflowState(taskId);
    const isUnrecognizedCharge = reasonId === 'unrecognized-charge' && state?.chargeDetails;
    const isFraudCase = state?.fraudFlag || false;

    // Generate natural response using LLM
    const response = await this.llmService.generateCardReplacementResponse(
      'order_summary_and_confirmation',
      mockCustomer,
      [{ role: 'user', content: `Reason selected: ${reasonId}. Show order summary.` }],
      state?.chargeDetails
    );

    return response;
  }

  private async executeSubmission(
    taskId: string,
    emitTrail: (event: TrailEvent) => void
  ): Promise<string> {
    emitTrail({
      type: 'agent_action',
      agent: 'card-replacement',
      timestamp: new Date().toISOString(),
      data: {
        action: 'submitting_replacement_order',
        step: 'final_submission'
      }
    });

    const state = this.getWorkflowState(taskId);
    if (!state) {
      return 'An error occurred: No workflow state found. Please start over.';
    }

    const toolCall: McpToolCall = {
      name: 'submit_replacement_order',
      arguments: {
        customerId: mockCustomer.id,
        reason: state.replacementReason,
        deliveryMethodId: state.deliveryMethodId,
        addressConfirmed: state.addressConfirmed,
        chargeDetails: state.chargeDetails
      }
    };

    const result = await this.mcpClients.finalSubmission.callTool(toolCall, emitTrail);
    
    if (result.isError) {
      return `There was an error submitting your order: ${result.content.error}`;
    }

    this.updateWorkflowState(taskId, { step: 'complete' });

    // Generate natural response using LLM
    const response = await this.llmService.generateCardReplacementResponse(
      'order_confirmation',
      mockCustomer,
      [{ role: 'user', content: 'Order submitted successfully' }],
      state.chargeDetails
    );

    return response;
  }

  async handleTask(request: JsonRpcRequest, emitTrail: (event: TrailEvent) => void): Promise<JsonRpcResponse> {
    const { method, params, id } = request;

    emitTrail({
      type: 'agent_action',
      agent: 'card-replacement',
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
    
    // Check if this is a fraud case from charge verification
    const isFraudCase = metadata.fraudFlag === true;
    const chargeDetails = metadata.chargeDetails;
    
    // Get or create workflow state
    let workflowState = this.getWorkflowState(taskId);
    if (!workflowState) {
      workflowState = this.initializeWorkflow(taskId, metadata);
    } else if (chargeDetails && !workflowState.chargeDetails) {
      // Update with charge details if this is a fraud escalation
      workflowState.chargeDetails = chargeDetails;
      workflowState.fraudFlag = isFraudCase;
      workflowStates.set(taskId, workflowState);
    }

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
      metadata: { workflowState }
    };
    
    tasks.set(taskId, task);

    emitTrail({
      type: 'status_change',
      agent: 'card-replacement',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        state: 'working',
        workflowStep: workflowState.step,
        message: isFraudCase ? 'Processing URGENT fraud case - card replacement...' : 'Processing card replacement request...'
      }
    });

    let responseMessage: string;
    const lowerMessage = userMessage.toLowerCase();

    // Handle fraud case specially - fast track
    if (isFraudCase && workflowState.step === 'address' && !workflowState.addressConfirmed) {
      // Fraud case - fast track to address confirmation
      emitTrail({
        type: 'agent_action',
        agent: 'card-replacement',
        timestamp: new Date().toISOString(),
        data: {
          action: 'fraud_case_detected',
          fastTrack: true,
          chargeDetails
        }
      });
      
      responseMessage = await this.executeAddressStep(taskId, emitTrail);
      responseMessage = `🚨 FRAUD CASE DETECTED - PRIORITY REPLACEMENT 🚨\n\n${responseMessage}`;
    } else {
      // Determine current step and process accordingly
      switch (workflowState.step) {
        case 'address':
          if (lowerMessage === 'yes' || lowerMessage === 'confirm' || lowerMessage === 'y') {
            responseMessage = await this.confirmAddress(
              taskId, 
              workflowState.addressData?.address || mockCustomer.address,
              emitTrail
            );
          } else if (lowerMessage === 'no' || lowerMessage === 'update' || lowerMessage === 'change') {
            responseMessage = `Please provide your new mailing address in the format:\n` +
                            `Street Address, City, State ZIP\n\n` +
                            `For example: 456 Oak Lane, Los Angeles, CA 90001`;
          } else if (workflowState.addressData) {
            // Assume they're providing a new address
            responseMessage = await this.confirmAddress(
              taskId,
              this.parseAddress(userMessage),
              emitTrail
            );
          } else {
            responseMessage = await this.executeAddressStep(taskId, emitTrail);
          }
          break;

        case 'delivery':
          // Handle delivery method selection
          let deliveryMethodId: string;
          if (lowerMessage === '1' || lowerMessage === 'standard') {
            deliveryMethodId = 'standard';
          } else if (lowerMessage === '2' || lowerMessage === 'express') {
            deliveryMethodId = 'express';
          } else if (lowerMessage === '3' || lowerMessage === 'overnight') {
            deliveryMethodId = 'overnight';
          } else if (workflowState.deliveryData) {
            // Already have delivery data, assume they're selecting
            responseMessage = await this.executeDeliveryStep(taskId, emitTrail);
            break;
          } else {
            responseMessage = await this.executeDeliveryStep(taskId, emitTrail);
            break;
          }
          
          responseMessage = await this.selectDeliveryMethod(taskId, deliveryMethodId, emitTrail);
          break;

        case 'reason':
          // Handle replacement reason selection
          let reasonId: string;
          if (lowerMessage === '1' || lowerMessage === 'lost') {
            reasonId = 'lost';
          } else if (lowerMessage === '2' || lowerMessage === 'stolen') {
            reasonId = 'stolen';
          } else if (lowerMessage === '3' || lowerMessage === 'damaged') {
            reasonId = 'damaged';
          } else if (lowerMessage === '4' || lowerMessage === 'fraud') {
            reasonId = 'fraud';
          } else if (lowerMessage === '5' || lowerMessage.includes('unrecognized')) {
            reasonId = 'unrecognized-charge';
          } else {
            responseMessage = await this.executeReasonStep(taskId, emitTrail);
            break;
          }
          
          responseMessage = await this.selectReplacementReason(taskId, reasonId, emitTrail);
          break;

        case 'submission':
          // Handle final confirmation
          if (lowerMessage === 'yes' || lowerMessage === 'y' || lowerMessage === 'confirm' || lowerMessage === 'submit') {
            responseMessage = await this.executeSubmission(taskId, emitTrail);
          } else {
            responseMessage = `Order cancelled. If you'd like to start over, please let me know.`;
            this.updateWorkflowState(taskId, { step: 'address' });
          }
          break;

        case 'complete':
          responseMessage = `Your card replacement order has already been submitted. If you need to make changes, please contact customer service.`;
          break;

        default:
          // Start from the beginning
          responseMessage = await this.executeAddressStep(taskId, emitTrail);
      }
    }

    // Update task with response
    task.status = {
      state: workflowState.step === 'complete' ? 'completed' : 'working',
      message: {
        role: 'agent',
        parts: [{ kind: 'text', text: responseMessage }]
      }
    };
    task.metadata!.workflowState = workflowState;
    tasks.set(taskId, task);

    emitTrail({
      type: 'message',
      agent: 'card-replacement',
      timestamp: new Date().toISOString(),
      data: {
        direction: 'agent_to_user',
        message: responseMessage,
        workflowStep: workflowState.step,
        fraudFlag: isFraudCase
      }
    });

    return {
      jsonrpc: '2.0',
      id,
      result: task
    };
  }

  private parseAddress(addressString: string): any {
    // Simple address parser - expects "Street, City, State ZIP"
    const parts = addressString.split(',').map(s => s.trim());
    
    if (parts.length >= 3) {
      const street = parts[0];
      const city = parts[1];
      const stateZip = parts[2].split(' ');
      const state = stateZip[0];
      const zip = stateZip[1] || '';
      
      return { street, city, state, zip };
    }
    
    return mockCustomer.address;
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
    workflowStates.delete(taskId);
    tasks.set(taskId, task);

    emitTrail({
      type: 'status_change',
      agent: 'card-replacement',
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