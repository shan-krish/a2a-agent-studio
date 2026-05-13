'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Brain,
  ArrowRightLeft,
  Wrench,
  CheckCircle,
  MessageSquare,
  AlertCircle,
  Activity,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useTrailStore } from '@/stores';
import { TrailEvent, TrailEventType } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';

const eventTypeConfig: Record<
  TrailEventType,
  { icon: React.ElementType; color: string; label: string }
> = {
  'user-message': { icon: User, color: '#006FCF', label: 'User Message' },
  'agent-thinking': { icon: Brain, color: '#FFB300', label: 'Thinking' },
  'agent-delegation': { icon: ArrowRightLeft, color: '#00D4FF', label: 'Delegation' },
  'tool-call': { icon: Wrench, color: '#9D4EDD', label: 'Tool Call' },
  'tool-result': { icon: CheckCircle, color: '#00C853', label: 'Tool Result' },
  'agent-response': { icon: MessageSquare, color: '#006FCF', label: 'Response' },
  error: { icon: AlertCircle, color: '#FF3D00', label: 'Error' },
};

export function CommunicationTrail() {
  const { events } = useTrailStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // Auto-scroll to latest event
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <motion.div
      initial={false}
      animate={{ width: isCollapsed ? 60 : 360 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="h-full bg-navy-900 border-l border-navy-600 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-navy-600 min-h-[60px]">
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2"
          >
            <Activity className="w-5 h-5 text-green-400" />
            <span className="font-semibold text-foreground">Communication Trail</span>
            <div className="flex items-center gap-1 ml-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          </motion.div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Timeline */}
      {!isCollapsed && (
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="p-4">
            {events.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <Activity className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Communication events will appear here
                </p>
              </div>
            )}

            <div className="relative">
              {/* Timeline Line */}
              {events.length > 0 && (
                <div className="absolute left-[15px] top-0 bottom-0 w-0.5 bg-navy-600" />
              )}

              <AnimatePresence>
                {events.map((event, index) => (
                  <TimelineNode
                    key={event.id}
                    event={event}
                    index={index}
                    isLast={index === events.length - 1}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        </ScrollArea>
      )}

      {/* Summary Stats */}
      {!isCollapsed && events.length > 0 && (
        <div className="p-3 border-t border-navy-600">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-navy-800 rounded-lg p-2">
              <div className="text-lg font-semibold text-blue-400">
                {events.filter((e) => e.type === 'agent-delegation').length}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">Delegations</div>
            </div>
            <div className="bg-navy-800 rounded-lg p-2">
              <div className="text-lg font-semibold text-purple-400">
                {events.filter((e) => e.type === 'tool-call').length}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">Tool Calls</div>
            </div>
            <div className="bg-navy-800 rounded-lg p-2">
              <div className="text-lg font-semibold text-green-400">
                {events.reduce((acc, e) => acc + (e.duration || 0), 0)}ms
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">Total Time</div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function TimelineNode({
  event,
  index,
  isLast,
}: {
  event: TrailEvent;
  index: number;
  isLast: boolean;
}) {
  const config = eventTypeConfig[event.type];
  const Icon = config.icon;

  const getStatusIndicator = () => {
    switch (event.status) {
      case 'pending':
        return <div className="w-2 h-2 rounded-full border border-amber-400" />;
      case 'in-progress':
        return (
          <motion.div
            className="w-2 h-2 rounded-full bg-amber-400"
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        );
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-400" />;
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative pl-10 pb-6"
    >
      {/* Node Circle */}
      <div
        className="absolute left-[8px] top-0 w-[16px] h-[16px] rounded-full flex items-center justify-center z-10"
        style={{ backgroundColor: config.color }}
      >
        <Icon className="w-2.5 h-2.5 text-white" />
      </div>

      {/* Content Card */}
      <div className="bg-navy-800 rounded-lg p-3 border border-navy-600 hover:border-navy-500 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0"
              style={{ backgroundColor: `${config.color}20`, color: config.color }}
            >
              {config.label}
            </Badge>
            {getStatusIndicator()}
          </div>
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(event.timestamp, { addSuffix: true })}
          </span>
        </div>

        {/* Delegation Info */}
        {event.type === 'agent-delegation' && (
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1 text-xs">
              <span className="text-blue-300">{event.sourceAgent}</span>
              <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
              <span className="text-cyan-400">{event.targetAgent}</span>
            </div>
          </div>
        )}

        {/* Tool Call Info */}
        {event.type === 'tool-call' && event.toolName && (
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="w-3 h-3 text-purple-400" />
            <span className="text-xs font-mono text-purple-300">{event.toolName}</span>
            {(event.metadata?.server != null) && (
              <Badge variant="outline" className="text-[10px] border-navy-600">
                {String(event.metadata.server)}
              </Badge>
            )}
          </div>
        )}

        {/* Content */}
        <p className="text-xs text-foreground">{event.content}</p>

        {/* Duration */}
        {event.duration && (
          <div className="text-[10px] text-muted-foreground mt-2">
            Duration: {event.duration}ms
          </div>
        )}

        {/* Metadata Preview */}
        {(event.metadata?.result != null) && (
          <details className="mt-2">
            <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
              View Result
            </summary>
            <pre className="text-[10px] font-mono text-green-300 bg-navy-900/50 p-2 rounded mt-1 overflow-x-auto">
              {JSON.stringify(event.metadata.result, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </motion.div>
  );
}
