import { create } from 'zustand';
import { Message, ToolCall } from '@/types';

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  currentAgentId: string | null;
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  addToolCallToMessage: (messageId: string, toolCall: ToolCall) => void;
  updateToolCall: (messageId: string, toolCallId: string, updates: Partial<ToolCall>) => void;
  setStreaming: (streaming: boolean) => void;
  setCurrentAgent: (agentId: string | null) => void;
  clearMessages: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  currentAgentId: null,

  addMessage: (message) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...message,
          id: generateId(),
          timestamp: new Date(),
        },
      ],
    })),

  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg
      ),
    })),

  addToolCallToMessage: (messageId, toolCall) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, toolCalls: [...(msg.toolCalls || []), toolCall] }
          : msg
      ),
    })),

  updateToolCall: (messageId, toolCallId, updates) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              toolCalls: msg.toolCalls?.map((tc) =>
                tc.id === toolCallId ? { ...tc, ...updates } : tc
              ),
            }
          : msg
      ),
    })),

  setStreaming: (streaming) => set({ isStreaming: streaming }),
  setCurrentAgent: (agentId) => set({ currentAgentId: agentId }),
  clearMessages: () => set({ messages: [] }),
}));
