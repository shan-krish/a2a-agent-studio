import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import {
  AgentCard,
  AgentCapabilities,
  AgentSkill,
  TaskState,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from '@a2a-js/sdk';
import {
  AgentExecutor,
  DefaultRequestHandler,
  InMemoryTaskStore,
  RequestContext,
  ExecutionEventBus,
} from '@a2a-js/sdk/server';
import { A2AExpressApp, UserBuilder } from '@a2a-js/sdk/server/express';
import { LLMService } from '../../shared/llm-service';
import { McpClient, createMcpClients } from '../../shared/mcp-client';

// Mock data
const mockCustomer = {
  id: 'CUST-12345',
  name: 'John Smith',
  address: {
    street: '123 Park Avenue',
    city: 'New York',
    state: 'NY',
    zip: '10001'
  },
  card: {
    lastFour: '4821',
    expiration: '12/28'
  }
};

const deliveryOptions = [
  { id: 'standard', name: 'Standard', timeframe: '5-7 business days', cost: 0 },
  { id: 'express', name: 'Express', timeframe: '2-3 business days', cost: 15 },
  { id: 'overnight', name: 'Overnight', timeframe: 'Next business day', cost: 25 }
];

// Card Replacement Agent Executor
class CardReplacementExecutor implements AgentExecutor {
  private llm: LLMService;
  private mcpClients: ReturnType<typeof createMcpClients>;
  private workflowStates: Map<string, {
    step: 'address' | 'delivery' | 'reason' | 'submission' | 'complete';
    addressConfirmed?: boolean;
    deliveryMethod?: string;
    replacementReason?: string;
  }> = new Map();

  constructor() {
    this.llm = new LLMService();
    this.mcpClients = createMcpClients('card-replacement');
  }

  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const userMessage = context.userMessage;
    const text = userMessage?.parts?.[0]?.kind === 'text' ? userMessage.parts[0].text : '';
    
    // Get or initialize workflow state
    let state = this.workflowStates.get(context.taskId);
    if (!state) {
      state = { step: 'address' };
      this.workflowStates.set(context.taskId, state);
    }

    // Publish working status
    eventBus.publish({
      kind: 'status-update',
      taskId: context.taskId,
      contextId: context.contextId,
      status: {
        state: 'working' as TaskState,
        message: {
          kind: 'message',
          role: 'agent',
          parts: [{ kind: 'text', text: 'Processing card replacement request...' }],
        },
      },
      final: false,
    } as TaskStatusUpdateEvent);

    let responseText: string;

    switch (state.step) {
      case 'address':
        responseText = await this.handleAddressStep(context.taskId, text, eventBus);
        break;
      case 'delivery':
        responseText = await this.handleDeliveryStep(context.taskId, text, eventBus);
        break;
      case 'reason':
        responseText = await this.handleReasonStep(context.taskId, text, eventBus);
        break;
      case 'submission':
        responseText = await this.handleSubmissionStep(context.taskId, text, eventBus);
        break;
      default:
        responseText = 'Card replacement process has already been completed. Is there anything else I can help you with?';
    }

    // Publish artifact with response
    eventBus.publish({
      kind: 'artifact-update',
      taskId: context.taskId,
      contextId: context.contextId,
      artifact: {
        artifactId: uuidv4(),
        name: 'result',
        parts: [{ kind: 'text', text: responseText }],
      },
    } as TaskArtifactUpdateEvent);

    // If workflow is complete, mark task as completed
    if (state.step === 'complete') {
      eventBus.publish({
        kind: 'status-update',
        taskId: context.taskId,
        contextId: context.contextId,
        status: { state: 'completed' as TaskState },
        final: true,
      } as TaskStatusUpdateEvent);
    }

    eventBus.finished();
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    eventBus.publish({
      kind: 'status-update',
      taskId,
      status: { state: 'canceled' as TaskState },
      final: true,
    } as TaskStatusUpdateEvent);
    eventBus.finished();
  }

  private async handleAddressStep(taskId: string, text: string, eventBus: ExecutionEventBus): Promise<string> {
    // Call MCP server to get/confirm address
    try {
      const addressResult = await this.mcpClients.addressConfirmation.callTool('get-address', {
        customerId: mockCustomer.id
      });

      if (text.toLowerCase().includes('confirm') || text.toLowerCase().includes('yes') || text.toLowerCase().includes('correct')) {
        // Address confirmed
        const state = this.workflowStates.get(taskId)!;
        state.step = 'delivery';
        state.addressConfirmed = true;
        this.workflowStates.set(taskId, state);

        // Show delivery options
        const deliveryResult = await this.mcpClients.deliveryMethod.callTool('list-options', {});
        
        return await this.llm.generateResponse(
          `Customer has confirmed their address:
          ${mockCustomer.address.street}
          ${mockCustomer.address.city}, ${mockCustomer.address.state} ${mockCustomer.address.zip}
          
          Now present delivery options:
          1. Standard - Free (5-7 business days)
          2. Express - $15 (2-3 business days)
          3. Overnight - $25 (Next business day)
          
          Ask them to choose a delivery method.`,
          'card_replacement',
          []
        );
      } else {
        // Show address for confirmation
        return await this.llm.generateResponse(
          `Present the customer's current address and ask them to confirm it's correct for card delivery:
          
          Current address on file:
          ${mockCustomer.address.street}
          ${mockCustomer.address.city}, ${mockCustomer.address.state} ${mockCustomer.address.zip}
          
          Ask: Is this address correct for delivery?`,
          'card_replacement',
          []
        );
      }
    } catch (error) {
      return `I'm having trouble accessing the address verification system. Let me proceed with the address we have on file: ${mockCustomer.address.street}, ${mockCustomer.address.city}, ${mockCustomer.address.state} ${mockCustomer.address.zip}. Is this correct?`;
    }
  }

  private async handleDeliveryStep(taskId: string, text: string, eventBus: ExecutionEventBus): Promise<string> {
    // Parse delivery method selection
    let selectedMethod: string | undefined;
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('overnight') || lowerText.includes('next day') || lowerText.includes('urgent')) {
      selectedMethod = 'overnight';
    } else if (lowerText.includes('express') || lowerText.includes('fast') || lowerText.includes('quick')) {
      selectedMethod = 'express';
    } else if (lowerText.includes('standard') || lowerText.includes('normal') || lowerText.includes('free')) {
      selectedMethod = 'standard';
    } else if (lowerText.includes('1') || lowerText.includes('option 1')) {
      selectedMethod = 'standard';
    } else if (lowerText.includes('2') || lowerText.includes('option 2')) {
      selectedMethod = 'express';
    } else if (lowerText.includes('3') || lowerText.includes('option 3')) {
      selectedMethod = 'overnight';
    }

    if (selectedMethod) {
      const state = this.workflowStates.get(taskId)!;
      state.step = 'reason';
      state.deliveryMethod = selectedMethod;
      this.workflowStates.set(taskId, state);

      // Call MCP to record delivery selection
      try {
        await this.mcpClients.deliveryMethod.callTool('select-delivery', {
          customerId: mockCustomer.id,
          method: selectedMethod
        });
      } catch (error) {
        console.error('MCP delivery selection failed:', error);
      }

      const selectedOption = deliveryOptions.find(o => o.id === selectedMethod)!;
      
      return await this.llm.generateResponse(
        `Customer selected ${selectedOption.name} delivery (${selectedOption.timeframe} - $${selectedOption.cost}).
        
        Now ask for the replacement reason. Options:
        - Lost card
        - Stolen card
        - Damaged card
        - Fraud
        - Unrecognized charge
        
        Ask: What is the reason for needing a replacement card?`,
        'card_replacement',
        []
      );
    } else {
      // Re-present delivery options
      return await this.llm.generateResponse(
        `Customer hasn't selected a delivery method yet. Re-present the options:
        1. Standard - Free (5-7 business days)
        2. Express - $15 (2-3 business days)
        3. Overnight - $25 (Next business day)
        
        Ask them to choose.`,
        'card_replacement',
        []
      );
    }
  }

  private async handleReasonStep(taskId: string, text: string, eventBus: ExecutionEventBus): Promise<string> {
    // Parse replacement reason
    let reason: string | undefined;
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('lost')) {
      reason = 'lost';
    } else if (lowerText.includes('stolen')) {
      reason = 'stolen';
    } else if (lowerText.includes('damaged') || lowerText.includes('broken')) {
      reason = 'damaged';
    } else if (lowerText.includes('fraud')) {
      reason = 'fraud';
    } else if (lowerText.includes('unrecognized') || lowerText.includes('charge')) {
      reason = 'unrecognized-charge';
    }

    if (reason) {
      const state = this.workflowStates.get(taskId)!;
      state.step = 'submission';
      state.replacementReason = reason;
      this.workflowStates.set(taskId, state);

      // Call MCP to record reason
      try {
        await this.mcpClients.replacementReason.callTool('set-reason', {
          customerId: mockCustomer.id,
          reason
        });
      } catch (error) {
        console.error('MCP reason selection failed:', error);
      }

      const selectedDelivery = deliveryOptions.find(o => o.id === state.deliveryMethod)!;
      
      return await this.llm.generateResponse(
        `Customer provided reason: ${reason}
        
        Present order summary for confirmation:
        - Customer: John Smith
        - Card ending: 4821
        - Delivery: ${selectedDelivery.name} (${selectedDelivery.timeframe})
        - Cost: $${selectedDelivery.cost}
        - Reason: ${reason}
        
        Ask: Does everything look correct? Should I proceed with the replacement?`,
        'card_replacement',
        []
      );
    } else {
      // Ask for reason again
      return await this.llm.generateResponse(
        `Customer hasn't specified a replacement reason. Ask again:
        What is the reason for needing a replacement card?
        - Lost card
        - Stolen card
        - Damaged card
        - Fraud
        - Unrecognized charge`,
        'card_replacement',
        []
      );
    }
  }

  private async handleSubmissionStep(taskId: string, text: string, eventBus: ExecutionEventBus): Promise<string> {
    if (text.toLowerCase().includes('confirm') || text.toLowerCase().includes('yes') || text.toLowerCase().includes('proceed')) {
      const state = this.workflowStates.get(taskId)!;
      
      // Call MCP to submit order
      try {
        const submissionResult = await this.mcpClients.finalSubmission.callTool('submit-order', {
          customerId: mockCustomer.id,
          deliveryMethod: state.deliveryMethod,
          reason: state.replacementReason,
          address: mockCustomer.address
        });

        // Mark as complete
        state.step = 'complete';
        this.workflowStates.set(taskId, state);

        return await this.llm.generateResponse(
          `The card replacement order has been submitted successfully.
          
          Order details:
          - Order ID: ORD-${Date.now()}
          - Card ending: 4821 (will be cancelled)
          - New card will arrive in ${deliveryOptions.find(o => o.id === state.deliveryMethod)!.timeframe}
          - Cost: $${deliveryOptions.find(o => o.id === state.deliveryMethod)!.cost}
          
          Let them know their current card has been cancelled and they should destroy it when they receive the new one.
          Provide a friendly closing message.`,
          'card_replacement',
          []
        );
      } catch (error) {
        return `I apologize, but there was an error processing your card replacement order. Please call our customer service line at 1-800-555-HELP to complete your replacement. Your case has been documented and flagged as urgent.`;
      }
    } else {
      // User wants to go back or change something
      const state = this.workflowStates.get(taskId)!;
      state.step = 'address'; // Go back to beginning
      this.workflowStates.set(taskId, state);
      
      return await this.llm.generateResponse(
        `Customer wants to review or change something. Go back to address confirmation.
        
        Current address on file:
        ${mockCustomer.address.street}
        ${mockCustomer.address.city}, ${mockCustomer.address.state} ${mockCustomer.address.zip}
        
        Ask: Let's start over. Is this address correct for delivery?`,
        'card_replacement',
        []
      );
    }
  }
}

// Agent Card
const skills: AgentSkill[] = [
  {
    id: 'address-confirmation',
    name: 'Address Confirmation',
    description: 'Confirm customer delivery address',
    tags: ['address', 'delivery', 'location'],
    examples: [
      'My address is correct',
      'I need to update my address',
      'Where will the card be sent?'
    ]
  },
  {
    id: 'delivery-method',
    name: 'Delivery Method',
    description: 'Select card delivery method and timeframe',
    tags: ['delivery', 'shipping', 'express'],
    examples: [
      'I need it overnight',
      'Standard shipping is fine',
      'How fast can I get it?'
    ]
  },
  {
    id: 'replacement-reason',
    name: 'Replacement Reason',
    description: 'Determine reason for card replacement',
    tags: ['lost', 'stolen', 'damaged', 'fraud'],
    examples: [
      'My card was stolen',
      'The card is damaged',
      'I lost my card',
      'There was fraud on my account'
    ]
  },
  {
    id: 'final-submission',
    name: 'Final Submission',
    description: 'Submit card replacement order',
    tags: ['submit', 'order', 'confirmation'],
    examples: [
      'Yes, proceed with the replacement',
      'Submit the order',
      'Confirm the replacement'
    ]
  }
];

const agentCard: AgentCard = {
  name: 'Card Replacement Agent',
  description: 'Handles card replacement orders including address confirmation, delivery method selection, and final submission',
  url: 'http://localhost:4002',
  version: '1.0.0',
  protocolVersion: '0.3',
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  capabilities: { streaming: true } as AgentCapabilities,
  skills,
};

// Build app using official SDK
const executor = new CardReplacementExecutor();
const requestHandler = new DefaultRequestHandler(
  agentCard,
  new InMemoryTaskStore(),
  executor
);

const app = express();
app.use(express.json());

// A2A routes via SDK
const a2aApp = new A2AExpressApp(requestHandler, UserBuilder.noAuthentication);
a2aApp.setupRoutes(app);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', agent: 'card-replacement', port: 4002 });
});

// Start
const PORT = 4002;
app.listen(PORT, () => {
  console.log(`💳 Card Replacement Agent running on http://localhost:${PORT}`);
  console.log(`📋 Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
});

export { app, CardReplacementExecutor, agentCard };