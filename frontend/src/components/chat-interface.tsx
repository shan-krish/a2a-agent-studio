'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, ChevronDown, ChevronUp, Loader2, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';
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

    // Build the A2A JSON-RPC request
    const rpcRequest = {
      jsonrpc: '2.0',
      id: `req-${Date.now()}`,
      method: 'tasks/send',
      params: {
        message: {
          role: 'user',
          parts: [{ kind: 'text', text: userMessage }],
        },
      },
    };

    // Add agent thinking event with input JSON
    addEvent({
      type: 'agent-thinking',
      sourceAgent: 'ava',
      content: 'Processing your request...',
      status: 'in-progress',
      metadata: {
        input: rpcRequest,
      },
    });

    const startTime = Date.now();

    try {
      // Make actual API call to AVA agent
      const response = await fetch('http://localhost:4000/a2a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rpcRequest),
      });

      const rpcResponse = await response.json();
      const duration = Date.now() - startTime;

      // Determine which agent responded
      const responseText = rpcResponse.result?.status?.message?.parts?.[0]?.text 
        || rpcResponse.result?.artifacts?.[0]?.parts?.[0]?.text
        || 'No response received';
      
      const respondingAgent = rpcResponse.result?.metadata?.delegatedTo || 'ava';

      // Add delegation event if response came from a different agent
      if (respondingAgent !== 'ava') {
        addEvent({
          type: 'agent-delegation',
          sourceAgent: 'ava',
          targetAgent: respondingAgent,
          content: `Delegated to ${respondingAgent}`,
          status: 'completed',
          duration: Math.round(duration * 0.3),
          metadata: {
            input: {
              method: 'tasks/send',
              target: `http://localhost:4001/a2a`,
              params: rpcRequest.params,
            },
            output: {
              delegatedTo: respondingAgent,
              status: 'delegated',
            },
          },
        });
      }

      // Add tool call event (simulated for MCP tools)
      addEvent({
        type: 'tool-call',
        sourceAgent: respondingAgent,
        toolName: 'lookup_transaction',
        content: 'Looking up transaction in database...',
        status: 'completed',
        duration: Math.round(duration * 0.4),
        metadata: {
          server: 'transaction-service',
          input: {
            tool: 'lookup_transaction',
            arguments: {
              amount: '$299.99',
              merchant: 'TechStore Pro',
              customerId: 'CUST-001',
            },
          },
          output: {
            found: true,
            transaction: {
              id: 'TXN-8827193',
              amount: '$299.99',
              merchant: 'TechStore Pro',
              date: '2026-04-28',
              status: 'Pending',
              cardLast4: '4821',
            },
          },
        },
      });

      // Add agent response event with full output JSON
      addEvent({
        type: 'agent-response',
        sourceAgent: respondingAgent,
        content: 'Response generated',
        status: 'completed',
        duration,
        metadata: {
          input: rpcRequest,
          output: rpcResponse,
        },
      });

      setStreaming(false);
      return responseText;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Add error event
      addEvent({
        type: 'agent-response',
        sourceAgent: 'ava',
        content: `Error: ${error}`,
        status: 'error',
        duration,
        metadata: {
          input: rpcRequest,
          output: { error: String(error) },
        },
      });

      setStreaming(false);
      return `Error connecting to agent: ${error}. Make sure the backend is running.`;
    }
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
      agentColor: '#00A3E0',
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
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-navy-600 min-h-[64px] bg-navy-800/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-amex-blue to-amex-light bg-clip-text text-transparent">
              A2A
            </span>
            <span className="text-lg font-medium text-foreground">Agent Studio</span>
          </div>
          <div className="h-5 w-px bg-navy-600" />
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amex-light" />
            <span className="caption">Powered by Agent-to-Agent Protocol</span>
          </div>
        </div>

        {/* Agent Selector */}
        <div className="relative">
          <Button
            variant="outline"
            className="border-navy-600 bg-navy-800 hover:bg-navy-700 text-foreground"
            onClick={() => setIsAgentSelectorOpen(!isAgentSelectorOpen)}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: currentAgent?.color || '#006FCF' }}
              />
              <span className="font-medium">{currentAgent?.name || 'Select Agent'}</span>
            </div>
            {isAgentSelectorOpen ? (
              <ChevronUp className="w-4 h-4 ml-2 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-2 text-muted-foreground" />
            )}
          </Button>

          <AnimatePresence>
            {isAgentSelectorOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-56 bg-navy-800 border border-navy-600 rounded-lg shadow-xl z-50 overflow-hidden"
              >
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-navy-700 transition-colors ${
                      activeAgent === agent.id ? 'bg-navy-700' : ''
                    }`}
                    onClick={() => {
                      setActiveAgent(agent.id);
                      setIsAgentSelectorOpen(false);
                    }}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: agent.color }}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">
                        {agent.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {agent.description.split(' ').slice(0, 4).join(' ')}...
                      </span>
                    </div>
                    {agent.isActive && (
                      <Badge 
                        variant="secondary" 
                        className="text-[8px] px-1.5 py-0 ml-auto bg-amex-light/10 text-amex-light"
                      >
                        Active
                      </Badge>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-5">
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amex-blue/10 flex items-center justify-center mb-5">
                <Bot className="w-8 h-8 text-amex-blue" />
              </div>
              <h3 className="heading-3 text-foreground mb-2">
                Welcome to A2A Agent Studio
              </h3>
              <p className="caption mb-6 max-w-md">
                Ask a question about your account, charges, or cards. AVA will delegate to the appropriate specialist agent.
              </p>
              <Button
                variant="outline"
                className="border-navy-600 text-muted-foreground hover:text-foreground hover:bg-navy-800"
                onClick={handleUseStarter}
              >
                Try: "{STARTER_MESSAGE}"
              </Button>
            </div>
          )}

          <AnimatePresence>
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl p-4 ${
                    message.role === 'user'
                      ? 'bg-navy-700 rounded-br-sm'
                      : 'bg-navy-800 border border-navy-600 rounded-bl-sm'
                  }`}
                >
                  {/* Agent Badge */}
                  {message.role === 'agent' && message.agentName && (
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-navy-600/50">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: message.agentColor }}
                      />
                      <span className="text-[11px] font-medium text-foreground">
                        {message.agentName}
                      </span>
                    </div>
                  )}

                  {/* Message Content */}
                  <div className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content.split('\n').map((line, i) => {
                      // Handle bold
                      const processedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>');
                      
                      // Handle bullet points
                      if (line.startsWith('•')) {
                        return (
                          <div key={i} className="ml-3 flex items-start gap-2 my-1">
                            <span className="text-amex-blue mt-0.5">•</span>
                            <span dangerouslySetInnerHTML={{ __html: processedLine.substring(1) }} />
                          </div>
                        );
                      }
                      // Handle numbered items
                      if (/^\d+\./.test(line)) {
                        const match = line.match(/^(\d+\.)\s*(.*)/);
                        if (match) {
                          return (
                            <div key={i} className="ml-3 flex items-start gap-2 my-1">
                              <span className="text-amex-blue font-medium">{match[1]}</span>
                              <span dangerouslySetInnerHTML={{ __html: match[2] }} />
                            </div>
                          );
                        }
                      }
                      return (
                        <div key={i} dangerouslySetInnerHTML={{ __html: processedLine || '&nbsp;' }} className="my-1" />
                      );
                    })}
                  </div>

                  {/* Tool Calls */}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-navy-600/50 space-y-2">
                      {message.toolCalls.map((tc) => (
                        <ToolCallCard key={tc.id} toolCall={tc} />
                      ))}
                    </div>
                  )}

                  {/* Timestamp */}
                  <div className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-navy-600/30" suppressHydrationWarning>
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
              className="flex items-center gap-3 text-muted-foreground py-2"
            >
              <Loader2 className="w-4 h-4 animate-spin text-amex-blue" />
              <span className="caption">AVA is coordinating response...</span>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Bar */}
      <div className="p-4 border-t border-navy-600 bg-navy-800/30">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about charges, disputes, or card services..."
            className="flex-1 bg-navy-800 border-navy-600 text-foreground placeholder:text-muted-foreground focus:border-amex-blue"
            disabled={isStreaming}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="bg-amex-blue hover:bg-amex-light text-white px-4"
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
        return <div className="w-3 h-3 rounded-full border-2 border-warning" />;
      case 'running':
        return <Loader2 className="w-3 h-3 text-warning animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-success" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-error" />;
    }
  };

  return (
    <Card className="bg-navy-900/50 border-navy-600">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-navy-800/50 transition-colors"
      >
        {getStatusIcon()}
        <span className="text-xs font-mono text-foreground">{toolCall.name}</span>
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-navy-600 text-muted-foreground ml-auto">
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
            <div className="px-3 pb-3 space-y-2 border-t border-navy-600/50 pt-2">
              <div>
                <span className="label">Arguments</span>
                <pre className="text-[11px] font-mono text-amex-light bg-navy-900 p-2 rounded mt-1 overflow-x-auto border border-navy-600/50">
                  {JSON.stringify(toolCall.arguments, null, 2)}
                </pre>
              </div>
              {toolCall.result != null && (
                <div>
                  <span className="label">Result</span>
                  <pre className="text-[11px] font-mono text-success bg-navy-900 p-2 rounded mt-1 overflow-x-auto border border-navy-600/50">
                    {JSON.stringify(toolCall.result ?? '', null, 2)}
                  </pre>
                </div>
              )}
              {toolCall.duration && (
                <div className="caption">
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
