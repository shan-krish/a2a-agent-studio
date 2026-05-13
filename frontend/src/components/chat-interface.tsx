'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, ChevronDown, ChevronUp, Loader2, Wrench } from 'lucide-react';
import { useChatStore, useAgentStore, useTrailStore } from '@/stores';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ToolCall } from '@/types';

const STARTER_MESSAGE = "I don't recognize a charge of $299.99 from TechStore Pro";

export function ChatInterface() {
  const {
    messages,
    isStreaming,
    addMessage,
    setStreaming,
    addToolCallToMessage,
    updateToolCall,
  } = useChatStore();
  const { agents, activeAgent, setActiveAgent } = useAgentStore();
  const { addEvent } = useTrailStore();

  const [input, setInput] = useState('');
  const [isAgentSelectorOpen, setIsAgentSelectorOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentAgent = agents.find((a) => a.id === activeAgent);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Pre-populate with starter message
  useEffect(() => {
    if (messages.length === 0) {
      // Don't auto-add, let user send it
    }
  }, []);

  const simulateAgentResponse = async (userMessage: string) => {
    setStreaming(true);

    // Add agent thinking event
    addEvent({
      type: 'agent-thinking',
      sourceAgent: 'orchestrator',
      content: 'Processing your request...',
      status: 'in-progress',
    });

    // Simulate orchestration delegation
    await new Promise((r) => setTimeout(r, 500));
    addEvent({
      type: 'agent-delegation',
      sourceAgent: 'orchestrator',
      targetAgent: 'charge-verification',
      content: 'Delegating charge verification task',
      status: 'completed',
      duration: 120,
    });

    // Simulate tool call
    await new Promise((r) => setTimeout(r, 300));
    const toolCallId = `tool-${Date.now()}`;
    const toolCall: ToolCall = {
      id: toolCallId,
      name: 'lookup_transaction',
      serverName: 'transaction-service',
      arguments: { amount: 299.99, merchant: 'TechStore Pro' },
      status: 'running',
      timestamp: new Date(),
    };

    // Add tool call event
    addEvent({
      type: 'tool-call',
      sourceAgent: 'charge-verification',
      toolName: 'lookup_transaction',
      content: 'Looking up transaction in database...',
      status: 'in-progress',
      metadata: { server: 'transaction-service' },
    });

    // Simulate tool execution
    await new Promise((r) => setTimeout(r, 1200));

    const toolResult = {
      found: true,
      transaction: {
        id: 'TXN-2024-001234',
        amount: 299.99,
        merchant: 'TechStore Pro',
        date: '2024-01-15',
        status: 'pending',
      },
    };

    // Add tool result event
    addEvent({
      type: 'tool-result',
      sourceAgent: 'charge-verification',
      toolName: 'lookup_transaction',
      content: 'Transaction found',
      status: 'completed',
      duration: 1247,
      metadata: { result: toolResult },
    });

    // Agent response
    await new Promise((r) => setTimeout(r, 400));

    addEvent({
      type: 'agent-response',
      sourceAgent: 'charge-verification',
      content: 'Preparing response with transaction details',
      status: 'completed',
    });

    setStreaming(false);

    return `I found the charge you're asking about:

**Transaction Details:**
• Amount: **$299.99**
• Merchant: **TechStore Pro**
• Date: **January 15, 2024**
• Status: **Pending**

This transaction is currently in pending status. Would you like me to:
1. **Dispute this charge** - Start a formal dispute process
2. **Get more details** - View additional transaction information
3. **Request a refund** - Contact the merchant for a refund

What would you prefer?`;
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');

    // Add user message
    addMessage({
      content: userMessage,
      role: 'user',
    });

    // Add trail event
    addEvent({
      type: 'user-message',
      sourceAgent: 'user',
      content: userMessage,
      status: 'completed',
    });

    // Get agent response
    const response = await simulateAgentResponse(userMessage);

    // Add agent message
    addMessage({
      content: response,
      role: 'agent',
      agentId: 'charge-verification',
      agentName: 'Charge Verification',
      agentColor: '#00D4FF',
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUseStarter = () => {
    setInput(STARTER_MESSAGE);
    inputRef.current?.focus();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-navy-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-navy-600 min-h-[60px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold amex-gradient">A2A</span>
            <span className="text-xl font-semibold text-foreground">Agent Studio</span>
          </div>
          <div className="h-6 w-px bg-navy-600" />
          <span className="text-sm text-muted-foreground">Powered by Agent-to-Agent Protocol</span>
        </div>

        {/* Agent Selector */}
        <div className="relative">
          <Button
            variant="outline"
            className="border-navy-600 bg-navy-800 hover:bg-navy-700"
            onClick={() => setIsAgentSelectorOpen(!isAgentSelectorOpen)}
          >
            <div
              className="w-2 h-2 rounded-full mr-2"
              style={{ backgroundColor: currentAgent?.color || '#006FCF' }}
            />
            {currentAgent?.name || 'Select Agent'}
            {isAgentSelectorOpen ? (
              <ChevronUp className="w-4 h-4 ml-2" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-2" />
            )}
          </Button>

          <AnimatePresence>
            {isAgentSelectorOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 top-full mt-2 w-48 bg-navy-800 border border-navy-600 rounded-lg shadow-lg z-50"
              >
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-navy-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      activeAgent === agent.id ? 'bg-navy-700' : ''
                    }`}
                    onClick={() => {
                      setActiveAgent(agent.id);
                      setIsAgentSelectorOpen(false);
                    }}
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: agent.color }}
                    />
                    <span className="text-sm text-foreground">{agent.name}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Bot className="w-16 h-16 text-blue-500 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Welcome to A2A Agent Studio
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                Ask a question about your account, charges, or cards. The orchestrator will delegate to the appropriate specialist agent.
              </p>
              <Button
                variant="outline"
                className="border-navy-600 text-muted-foreground hover:text-foreground"
                onClick={handleUseStarter}
              >
                Try: &quot;{STARTER_MESSAGE}&quot;
              </Button>
            </div>
          )}

          <AnimatePresence>
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl p-4 ${
                    message.role === 'user'
                      ? 'bg-navy-700 rounded-br-md'
                      : 'bg-navy-800 rounded-bl-md border border-navy-600'
                  }`}
                >
                  {/* Agent Badge */}
                  {message.role === 'agent' && message.agentName && (
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: message.agentColor }}
                      />
                      <Badge
                        variant="secondary"
                        className="text-xs bg-navy-700 text-foreground"
                      >
                        {message.agentName}
                      </Badge>
                    </div>
                  )}

                  {/* Message Content */}
                  <div className="text-foreground text-sm whitespace-pre-wrap">
                    {message.content.split('\n').map((line, i) => {
                      // Handle bold
                      line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                      // Handle bullet points
                      if (line.startsWith('•')) {
                        return (
                          <div key={i} className="ml-2" dangerouslySetInnerHTML={{ __html: line }} />
                        );
                      }
                      // Handle numbered items
                      if (/^\d+\./.test(line)) {
                        return (
                          <div key={i} className="ml-2" dangerouslySetInnerHTML={{ __html: line }} />
                        );
                      }
                      return (
                        <div key={i} dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }} />
                      );
                    })}
                  </div>

                  {/* Tool Calls */}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.toolCalls.map((tc) => (
                        <ToolCallCard key={tc.id} toolCall={tc} />
                      ))}
                    </div>
                  )}

                  {/* Timestamp */}
                  <div className="text-[10px] text-muted-foreground mt-2">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing Indicator */}
          {isStreaming && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Agent is thinking...</span>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Bar */}
      <div className="p-4 border-t border-navy-600">
        <div className="max-w-4xl mx-auto flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about charges, disputes, or card services..."
            className="flex-1 bg-navy-800 border-navy-600 text-foreground placeholder:text-muted-foreground"
            disabled={isStreaming}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="bg-blue-500 hover:bg-blue-400 text-white"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'pending':
        return <div className="w-4 h-4 rounded-full border-2 border-amber-400" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />;
      case 'completed':
        return <div className="w-4 h-4 rounded-full bg-green-400" />;
      case 'error':
        return <div className="w-4 h-4 rounded-full bg-red-400" />;
    }
  };

  const getStatusColor = () => {
    switch (toolCall.status) {
      case 'pending':
        return 'border-amber-400/30';
      case 'running':
        return 'border-amber-400/50';
      case 'completed':
        return 'border-green-400/30';
      case 'error':
        return 'border-red-400/30';
    }
  };

  return (
    <Card className={`bg-navy-900/50 ${getStatusColor()} border`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 p-2 text-left"
      >
        {getStatusIcon()}
        <Wrench className="w-3 h-3 text-purple-400" />
        <span className="text-xs font-mono text-foreground">{toolCall.name}</span>
        <Badge variant="outline" className="text-[10px] ml-auto border-navy-600">
          {toolCall.serverName}
        </Badge>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase">Arguments</span>
                <pre className="text-xs font-mono text-blue-300 bg-navy-900/50 p-2 rounded mt-1 overflow-x-auto">
                  {JSON.stringify(toolCall.arguments, null, 2)}
                </pre>
              </div>
              {(toolCall.result != null) && (
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase">Result</span>
                  <pre className="text-xs font-mono text-green-300 bg-navy-900/50 p-2 rounded mt-1 overflow-x-auto">
                    {JSON.stringify(toolCall.result ?? '', null, 2)}
                  </pre>
                </div>
              )}
              {toolCall.duration && (
                <div className="text-[10px] text-muted-foreground">
                  Duration: {toolCall.duration}ms
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
