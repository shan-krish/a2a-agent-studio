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

// Mock charge data
const mockCharge = {
  id: 'TXN-8827193',
  amount: '$299.99',
  merchant: 'TechStore Pro',
  date: '2026-04-28',
  cardLast4: '4821'
};

// Customer data
const mockCustomer = {
  name: 'John Smith',
  id: 'CUST-12345'
};

// Charge Verification Agent Executor
class ChargeVerificationExecutor implements AgentExecutor {
  private llm: LLMService;

  constructor() {
    this.llm = new LLMService();
  }

  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const userMessage = context.userMessage;
    const text = userMessage?.parts?.[0]?.kind === 'text' ? userMessage.parts[0].text : '';

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
          parts: [{ kind: 'text', text: 'Looking up charge details...' }],
        },
      },
      final: false,
    } as TaskStatusUpdateEvent);

    // Analyze user intent
    const intentPrompt = `You are a charge verification agent. Analyze this customer message to determine intent:
Message: "${text}"
Possible intents:
- confirm: Customer recognizes the charge
- dispute: Customer does NOT recognize the charge
- fraud: Customer reports fraud
- general: Other inquiry

Respond with only the intent category.`;
    
    const intent = (await this.llm.generateResponse(intentPrompt, 'system', [])).trim().toLowerCase();
    
    let responseText: string;

    if (intent.includes('confirm') || intent.includes('yes') || text.toLowerCase().includes('yes')) {
      // Customer confirms charge is legitimate
      responseText = await this.llm.generateResponse(
        `Customer John Smith has confirmed a charge of $299.99 at TechStore Pro on 2026-04-28 (TXN-8827193).
        Thank them for confirming and let them know the transaction has been verified. Be professional and friendly.`,
        'charge_verification',
        []
      );

      // Complete the task
      eventBus.publish({
        kind: 'status-update',
        taskId: context.taskId,
        contextId: context.contextId,
        status: { state: 'completed' as TaskState },
        final: true,
      } as TaskStatusUpdateEvent);
    } 
    else if (intent.includes('dispute') || intent.includes('fraud') || intent.includes('no') || text.toLowerCase().includes('no')) {
      // Customer denies charge - delegate to card replacement agent
      responseText = await this.llm.generateResponse(
        `Customer John Smith has disputed a charge of $299.99 at TechStore Pro (TXN-8827193).
        Explain that you will escalate this to the Card Replacement team to issue a new card immediately.
        Be empathetic and reassuring. Let them know you're taking this seriously.`,
        'charge_verification',
        []
      );

      // Delegate to card replacement agent
      const delegationResponse = await this.delegateToCardReplacement(text);
      responseText += `\n\n${delegationResponse}`;

      // Complete the task
      eventBus.publish({
        kind: 'status-update',
        taskId: context.taskId,
        contextId: context.contextId,
        status: { state: 'completed' as TaskState },
        final: true,
      } as TaskStatusUpdateEvent);
    } 
    else {
      // Present charge details (initial interaction)
      responseText = await this.llm.generateResponse(
        `Present this charge detail to the customer and ask if they recognize it:
        
        Transaction ID: TXN-8827193
        Amount: $299.99
        Merchant: TechStore Pro
        Date: 2026-04-28
        Card: ****4821
        Customer: John Smith
        
        Ask clearly: Did you make this charge or not? We need to know to proceed.`,
        'charge_verification',
        []
      );

      // Still working - waiting for customer response
      eventBus.publish({
        kind: 'status-update',
        taskId: context.taskId,
        contextId: context.contextId,
        status: {
          state: 'working' as TaskState,
          message: {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Awaiting customer response...' }],
          },
        },
        final: false,
      } as TaskStatusUpdateEvent);
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

  private async delegateToCardReplacement(userMessage: string): Promise<string> {
    try {
      const response = await fetch('http://localhost:4002/a2a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: uuidv4(),
          method: 'tasks/send',
          params: {
            message: {
              role: 'user',
              parts: [{ kind: 'text', text: `URGENT FRAUD CASE: Customer did not authorize charge of $299.99 from TechStore Pro. Need immediate card replacement. Transaction ID: TXN-8827193. Original message: "${userMessage}"` }],
            },
            metadata: {
              delegationSource: 'charge-verification',
              reason: 'unrecognized-charge-fraud',
              chargeDetails: mockCharge,
              fraudFlag: true,
              originalUserMessage: userMessage
            }
          },
        }),
      });
      const data: any = await response.json();
      return data.result?.status?.message?.parts?.[0]?.text || 'Your case has been escalated to our Card Replacement team.';
    } catch (error) {
      return `Error delegating to Card Replacement agent: ${error}. Please call our fraud hotline at 1-800-FRAUD-HOTLINE.`;
    }
  }
}

// Agent Card
const skills: AgentSkill[] = [
  {
    id: 'charge-lookup',
    name: 'Charge Lookup',
    description: 'Look up charge details from transaction history',
    tags: ['lookup', 'transaction', 'history'],
    examples: [
      'Look up the charge for $299.99',
      'What charges do I have from TechStore Pro?',
      'Find recent transactions'
    ]
  },
  {
    id: 'charge-dispute',
    name: 'Charge Dispute',
    description: 'Handle dispute process for unrecognized charges',
    tags: ['dispute', 'unrecognized', 'chargeback'],
    examples: [
      'I want to dispute this charge',
      "I didn't make this purchase",
      'This charge is unauthorized'
    ]
  },
  {
    id: 'fraud-detection',
    name: 'Fraud Detection',
    description: 'Identify and handle potential fraudulent transactions',
    tags: ['fraud', 'security', 'unauthorized'],
    examples: [
      'This looks like fraud',
      'Someone stole my card',
      'Unauthorized transaction'
    ]
  }
];

const agentCard: AgentCard = {
  name: 'Charge Verification Agent',
  description: 'Investigates unrecognized or suspicious charges on customer accounts and handles disputes',
  url: 'http://localhost:4001',
  version: '1.0.0',
  protocolVersion: '0.3',
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  capabilities: { streaming: true } as AgentCapabilities,
  skills,
};

// Build app using official SDK
const executor = new ChargeVerificationExecutor();
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
  res.json({ status: 'healthy', agent: 'charge-verification', port: 4001 });
});

// Start
const PORT = 4001;
app.listen(PORT, () => {
  console.log(`🔍 Charge Verification Agent running on http://localhost:${PORT}`);
  console.log(`📋 Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
});

export { app, ChargeVerificationExecutor, agentCard };