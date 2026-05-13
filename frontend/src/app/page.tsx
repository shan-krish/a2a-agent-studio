'use client';

import { useEffect } from 'react';
import { AgentRegistry } from '@/components/agent-registry';
import { ChatInterface } from '@/components/chat-interface';
import { CommunicationTrail } from '@/components/communication-trail';
import { useAgentStore } from '@/stores';

export default function Home() {
  const { fetchAgents } = useAgentStore();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return (
    <main className="h-screen w-screen overflow-hidden flex bg-navy-900">
      {/* Left Panel - Agent Registry */}
      <AgentRegistry />

      {/* Center Panel - Chat Interface */}
      <ChatInterface />

      {/* Right Panel - Communication Trail */}
      <CommunicationTrail />
    </main>
  );
}
