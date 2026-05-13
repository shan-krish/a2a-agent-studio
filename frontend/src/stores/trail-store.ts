import { create } from 'zustand';
import { TrailEvent } from '../types';
import { useAgentStore } from './agent-store';

interface TrailState {
  events: TrailEvent[];
  addEvent: (event: Omit<TrailEvent, 'id' | 'timestamp'>) => void;
  updateEvent: (id: string, updates: Partial<TrailEvent>) => void;
  clearEvents: () => void;
  getEventsByType: (type: TrailEvent['type']) => TrailEvent[];
}

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useTrailStore = create<TrailState>((set, get) => ({
  events: [],

  addEvent: (event) => {
    const newEvent: TrailEvent = {
      ...event,
      id: generateId(),
      timestamp: new Date(),
    };
    
    // Update agent store with delegation state
    const agentStore = useAgentStore.getState();
    agentStore.processTrailEvent(newEvent);
    
    set((state) => ({
      events: [...state.events, newEvent],
    }));
  },

  updateEvent: (id, updates) =>
    set((state) => ({
      events: state.events.map((evt) =>
        evt.id === id ? { ...evt, ...updates } : evt
      ),
    })),

  clearEvents: () => set({ events: [] }),

  getEventsByType: (type) => get().events.filter((evt) => evt.type === type),
}));
