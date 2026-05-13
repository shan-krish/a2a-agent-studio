import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import OpenAI from 'openai';
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

const PORT = 4002;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'gpt-4.1-mini';
const MCP_BASE = process.env.MCP_BASE_URL || 'http://localhost:4100';

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Call MCP tool
async function callMcpTool(port: number, toolName: string, args: Record<string, any>): Promise<any> {
  const response = await fetch(`http://localhost:${port}/call-tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: toolName, arguments: args }),
  });
  return response.json();
}

// Card Replacement Executor
class CardReplacementExecutor implements AgentExecutor {
  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const text = context.userMessage?.parts?.[0]?.kind === 'text'
      ? context.userMessage.parts[0].text
      : '';

    // Working status
    eventBus.publish({
      kind: 'status-update',
      taskId: context.taskId,
      contextId: context.contextId,
      status: {
        state: 'working' as TaskState,
        message: {
          kind: 'message',
          role: 'agent',
          parts: [{ kind: 'text', text: 'Initiating card replacement process...' }],
        },
      },
      final: false,
    } as TaskStatusUpdateEvent);

    let responseText: string;

    try {
      // Step 1: Get address
      eventBus.publish({
        kind: 'status-update',
        taskId: context.taskId,
        contextId: context.contextId,
        status: {
          state: 'working' as TaskState,
          message: {
            kind: 'message',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Confirming mailing address...' }],
          },
        },
        final: false,
      } as TaskStatusUpdateEvent);

      const addressResult: any = await callMcpTool(4100, 'get_mailing_address', { customerId: 'CUST-001' });

      // Step 2: Get delivery method
      const deliveryResult: any = await callMcpTool(4101, 'get_delivery_options', {});

      // Step 3: Get replacement reason
      const reasonResult: any = await callMcpTool(4102, 'get_replacement_reasons', {});

      // Step 4: Submit replacement
      const submitResult: any = await callMcpTool(4103, 'submit_replacement', {
        customerId: 'CUST-001',
        address: addressResult.content?.address || '123 Park Avenue, New York, NY 10001',
        delivery: 'express',
        reason: 'fraud',
        originalMessage: text,
      });

      // Generate response
      if (!OPENAI_API_KEY) {
        responseText = `**Card Replacement Initiated**

Your card replacement request has been processed:

**Mailing Address:** ${addressResult.content?.address?.street || '123 Park Avenue'}, ${addressResult.content?.address?.city || 'New York'}, ${addressResult.content?.address?.state || 'NY'} ${addressResult.content?.address?.zip || '10001'}

**Delivery:** Express (2-3 business days) - $15.00

**Reason:** Fraud / Unauthorized Transaction

**Confirmation:** ${submitResult.content?.confirmationNumber || 'CR-' + Date.now()}

**Estimated Arrival:** ${submitResult.content?.estimatedDelivery || '2-3 business days'}

Your current card has been deactivated. You will receive your new card at the address above. If you need to update the delivery address, please let me know.`;
      } else {
        const response = await openai.chat.completions.create({
          model: MODEL,
          messages: [
            {
              role: 'system',
              content: `You are a Card Replacement agent. The customer's card replacement has been processed.
              
Details:
- Address: ${JSON.stringify(addressResult.content?.address)}
- Delivery: Express (2-3 days)
- Reason: Fraud
- Confirmation: ${submitResult.content?.confirmationNumber}

Generate a professional confirmation message.`,
            },
            { role: 'user', content: text },
          ],
          temperature: 0.7,
          max_tokens: 500,
        });
        responseText = response.choices[0]?.message?.content || 'Card replacement processed.';
      }
    } catch (error) {
      responseText = `Error processing card replacement: ${error}`;
    }

    // Artifact
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

    // Complete
    eventBus.publish({
      kind: 'status-update',
      taskId: context.taskId,
      contextId: context.contextId,
      status: { state: 'completed' as TaskState },
      final: true,
    } as TaskStatusUpdateEvent);

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
}

// Agent Card
const agentCard: AgentCard = {
  name: 'Card Replacement',
  description: 'Handles card replacement workflow including fraud cases',
  url: `http://localhost:${PORT}`,
  version: '1.0.0',
  protocolVersion: '0.3',
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  capabilities: { streaming: true } as AgentCapabilities,
  skills: [
    {
      id: 'card-replacement',
      name: 'Card Replacement',
      description: 'Complete card replacement workflow',
      tags: ['replacement', 'fraud', 'card'],
      examples: ['I need to replace my card', 'My card was stolen', 'Replace my card due to fraud'],
    } as AgentSkill,
  ],
};

// Build & start
const executor = new CardReplacementExecutor();
const requestHandler = new DefaultRequestHandler(agentCard, new InMemoryTaskStore(), executor);
const app = express();
app.use(express.json());

const a2aApp = new A2AExpressApp(requestHandler, UserBuilder.noAuthentication);
a2aApp.setupRoutes(app);

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', agent: 'card-replacement', port: PORT });
});

app.listen(PORT, () => {
  console.log(`💳 Card Replacement Agent running on http://localhost:${PORT}`);
  console.log(`📋 Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
});
