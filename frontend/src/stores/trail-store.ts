import { create } from 'zustand';
import { TrailEvent } from '@/types';

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

  addEvent: (event) =>
    set((state) => ({
      events: [
        ...state.events,
        {
          ...event,
          id: generateId(),
          timestamp: new Date(),
        },
      ],
    })),

  updateEvent: (id, updates) =>
    set((state) => ({
      events: state.events.map((evt) =>
        evt.id === id ? { ...evt, ...updates } : evt
      ),
    })),

  clearEvents: () => set({ events: [] }),

  getEventsByType: (type) => get().events.filter((evt) => evt.type === type),
}));
