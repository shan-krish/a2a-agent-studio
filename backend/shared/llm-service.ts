import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = 'gpt-5.4-mini';

export class LLMService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: OPENAI_API_KEY
    });
  }

  async generateResponse(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<string> {
    try {
      const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ];

      const response = await this.openai.chat.completions.create({
        model: MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1000
      });

      return response.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
    } catch (error) {
      console.error('LLM Service Error:', error);
      throw new Error(`Failed to generate LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async analyzeIntent(
    userMessage: string,
    context?: string
  ): Promise<{
    intent: 'charge_verification' | 'card_replacement' | 'charge_dispute' | 'charge_confirmed' | 'charge_denied' | 'unknown';
    confidence: number;
    reasoning: string;
  }> {
    const systemPrompt = `You are an intent classifier for a customer service system. Analyze the user's message and determine their intent.

Possible intents:
- "charge_verification": User is asking about or reporting an unrecognized/suspicious charge
- "charge_dispute": User wants to dispute a charge they didn't make
- "charge_confirmed": User confirms they made a charge (it's legitimate)
- "charge_denied": User denies making a charge (it's fraudulent)
- "card_replacement": User wants to replace their card (lost, stolen, damaged, etc.)
- "unknown": Intent is unclear

${context ? `Context: ${context}` : ''}

Respond with a JSON object containing:
- intent: one of the above intents
- confidence: 0.0 to 1.0
- reasoning: brief explanation

Example response: {"intent": "charge_verification", "confidence": 0.95, "reasoning": "User mentions unrecognized charge"}`;

    try {
      const response = await this.generateResponse(systemPrompt, userMessage);
      const parsed = JSON.parse(response);
      return {
        intent: parsed.intent || 'unknown',
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || 'No reasoning provided'
      };
    } catch (error) {
      // Fallback to simple keyword matching if LLM fails
      return this.fallbackIntentAnalysis(userMessage);
    }
  }

  private fallbackIntentAnalysis(message: string): {
    intent: 'charge_verification' | 'card_replacement' | 'charge_dispute' | 'charge_confirmed' | 'charge_denied' | 'unknown';
    confidence: number;
    reasoning: string;
  } {
    const lower = message.toLowerCase();
    
    // Charge-related keywords
    const chargeKeywords = ['charge', 'unrecognized', 'suspicious', 'transaction', 'didn\'t make', 'never made'];
    const disputeKeywords = ['dispute', 'fraud', 'unauthorized', 'stolen'];
    const confirmKeywords = ['yes', 'confirm', 'legitimate', 'i made', 'i did'];
    const denyKeywords = ['no', 'didn\'t', 'never', 'fraud', 'unauthorized'];
    
    // Card replacement keywords
    const cardKeywords = ['lost', 'stolen', 'replacement', 'new card', 'damaged', 'broken'];
    
    const chargeScore = chargeKeywords.filter(k => lower.includes(k)).length;
    const disputeScore = disputeKeywords.filter(k => lower.includes(k)).length;
    const confirmScore = confirmKeywords.filter(k => lower.includes(k)).length;
    const denyScore = denyKeywords.filter(k => lower.includes(k)).length;
    const cardScore = cardKeywords.filter(k => lower.includes(k)).length;
    
    if (cardScore > 0) {
      return { intent: 'card_replacement', confidence: 0.8, reasoning: 'Card-related keywords detected' };
    }
    
    if (confirmScore > denyScore && chargeScore > 0) {
      return { intent: 'charge_confirmed', confidence: 0.7, reasoning: 'User appears to confirm charge' };
    }
    
    if (denyScore > confirmScore && (chargeScore > 0 || disputeScore > 0)) {
      return { intent: 'charge_denied', confidence: 0.7, reasoning: 'User appears to deny charge' };
    }
    
    if (disputeScore > chargeScore) {
      return { intent: 'charge_dispute', confidence: 0.8, reasoning: 'Dispute-related keywords detected' };
    }
    
    if (chargeScore > 0) {
      return { intent: 'charge_verification', confidence: 0.7, reasoning: 'Charge-related keywords detected' };
    }
    
    return { intent: 'unknown', confidence: 0.3, reasoning: 'No clear intent detected' };
  }

  async generateChargeVerificationResponse(
    chargeDetails: any,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<string> {
    const systemPrompt = `You are a customer service agent for a financial institution. You've found a charge that might be relevant to the customer's inquiry.

Charge Details:
- Amount: ${chargeDetails.amount}
- Merchant: ${chargeDetails.merchant}
- Date: ${chargeDetails.date}
- Transaction ID: ${chargeDetails.id}
- Card: ****${chargeDetails.cardLast4}

Your task:
1. Present the charge details clearly to the customer
2. Ask if they recognize this charge
3. If they confirm it's legitimate, confirm the transaction and end the conversation
4. If they deny making this charge, explain that you'll help them replace their card and escalate to the card replacement process

Be professional, empathetic, and clear in your communication.`;

    const lastUserMessage = conversationHistory.length > 0 
      ? conversationHistory[conversationHistory.length - 1].content 
      : 'Show me the charge details';

    return this.generateResponse(systemPrompt, lastUserMessage, conversationHistory.slice(0, -1));
  }

  async generateCardReplacementResponse(
    workflowStep: string,
    customerInfo: any,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    chargeDetails?: any
  ): Promise<string> {
    const systemPrompt = `You are a customer service agent helping a customer replace their card.

Customer: ${customerInfo.name}
Card ending in: ${customerInfo.card.lastFour}
${chargeDetails ? `Related charge: $${chargeDetails.amount} from ${chargeDetails.merchant}` : ''}

Current workflow step: ${workflowStep}

Your task is to guide the customer through the card replacement process:
1. Address confirmation
2. Delivery method selection (Standard - Free, Express - $15, Overnight - $25)
3. Replacement reason selection
4. Final submission

Be helpful, clear, and professional. Guide them through each step.`;

    const lastUserMessage = conversationHistory.length > 0 
      ? conversationHistory[conversationHistory.length - 1].content 
      : 'I need to replace my card';

    return this.generateResponse(systemPrompt, lastUserMessage, conversationHistory.slice(0, -1));
  }
}

// Singleton instance
let llmServiceInstance: LLMService | null = null;

export function getLLMService(): LLMService {
  if (!llmServiceInstance) {
    llmServiceInstance = new LLMService();
  }
  return llmServiceInstance;
}