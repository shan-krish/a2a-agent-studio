'use client';

import { useEffect } from 'react';
import { AgentRegistry } from '@/components/agent-registry';
import { ChatInterface } from '@/components/chat-interface';
import { CommunicationTrail } from '@/components/communication-trail';
import { ClientOnly } from '@/components/client-only';
import { useAgentStore } from '@/stores';

export default function Home() {
  const { fetchAgents } = useAgentStore();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return (
    <ClientOnly>
      <main className="h-screen w-screen overflow-hidden flex bg-background">
        {/* Left Panel - Agent Registry */}
        <AgentRegistry />

        {/* Center Panel - Chat Interface */}
        <ChatInterface />

        {/* Right Panel - Communication Trail */}
        <CommunicationTrail />
      </main>
    </ClientOnly>
  );
}
