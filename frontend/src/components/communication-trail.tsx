'use client';
import { useRef, useEffect, useState } from 'react';
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
  Clock,
} from 'lucide-react';
import { useTrailStore } from '@/stores';
import { TrailEvent, TrailEventType } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';

const eventTypeConfig: Record<
  TrailEventType,
  { icon: React.ElementType; color: string; label: string }
> = {
  'user-message': { icon: User, color: '#006FCF', label: 'User' },
  'agent-thinking': { icon: Brain, color: '#FFB300', label: 'Processing' },
  'agent-delegation': { icon: ArrowRightLeft, color: '#00A3E0', label: 'Delegation' },
  'tool-call': { icon: Wrench, color: '#8B9DAF', label: 'Tool' },
  'tool-result': { icon: CheckCircle, color: '#00A86B', label: 'Result' },
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

  // Calculate stats
  const delegationCount = events.filter((e) => e.type === 'agent-delegation').length;
  const toolCallCount = events.filter((e) => e.type === 'tool-call').length;
  const totalTime = events.reduce((acc, e) => acc + (e.duration || 0), 0);

  return (
    <motion.div
      initial={false}
      animate={{ width: isCollapsed ? 60 : 340 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="h-full bg-background border-l border-navy-600 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-navy-600 min-h-[64px]">
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3"
          >
            <Activity className="w-5 h-5 text-success" />
            <div className="flex flex-col">
              <span className="font-semibold text-foreground text-sm">Communication Trail</span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-subtle-pulse inline-block" />
                Live • {events.length} events
              </span>
            </div>
          </motion.div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-navy-800"
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
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <Activity className="w-8 h-8 text-muted-foreground mb-3 opacity-50" />
                <p className="caption">
                  Communication events will appear here
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 opacity-70">
                  Start a conversation to see the trail
                </p>
              </div>
            )}

            <div className="relative">
              {/* Timeline Line */}
              {events.length > 0 && (
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-navy-600" />
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
        <div className="p-3 border-t border-navy-600 bg-navy-800/50">
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-lg font-semibold text-amex-light tabular-nums">
                {delegationCount}
              </div>
              <div className="label">Delegations</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-muted-foreground tabular-nums">
                {toolCallCount}
              </div>
              <div className="label">Tools</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-success tabular-nums flex items-center justify-center gap-0.5">
                <Clock className="w-3 h-3" />
                {totalTime}ms
              </div>
              <div className="label">Duration</div>
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
        return <div className="w-2 h-2 rounded-full border border-warning" />;
      case 'in-progress':
        return (
          <motion.div
            className="w-2 h-2 rounded-full bg-warning"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        );
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-success" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-error" />;
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      className="relative pl-8 pb-5"
    >
      {/* Node Circle */}
      <div
        className="absolute left-[4px] top-0 w-[16px] h-[16px] rounded-full flex items-center justify-center z-10 border border-navy-600"
        style={{ backgroundColor: `${config.color}15`, borderColor: config.color }}
      >
        <Icon className="w-2.5 h-2.5" style={{ color: config.color }} />
      </div>

      {/* Content Card */}
      <div className="card-professional p-3 hover:border-navy-500 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span 
              className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: config.color }}
            >
              {config.label}
            </span>
            {getStatusIndicator()}
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums" suppressHydrationWarning>
            {formatDistanceToNow(event.timestamp, { addSuffix: true })}
          </span>
        </div>

        {/* Delegation Info */}
        {event.type === 'agent-delegation' && (
          <div className="flex items-center gap-1.5 mb-2 py-1.5 px-2 bg-navy-800 rounded">
            <div className="w-2 h-2 rounded-full bg-amex-blue" />
            <span className="text-[11px] text-foreground font-medium">{event.sourceAgent}</span>
            <ArrowRightLeft className="w-3 h-3 text-muted-foreground" />
            <span className="text-[11px] text-amex-light font-medium">{event.targetAgent}</span>
          </div>
        )}

        {/* Tool Call Info */}
        {event.type === 'tool-call' && event.toolName && (
          <div className="flex items-center gap-2 mb-2 py-1 px-2 bg-navy-800 rounded">
            <Wrench className="w-3 h-3 text-muted-foreground" />
            <span className="text-[11px] font-mono text-foreground">{event.toolName}</span>
            {(event.metadata?.server != null) && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-navy-600 ml-auto">
                {String(event.metadata.server)}
              </Badge>
            )}
          </div>
        )}

        {/* Content */}
        <p className="text-[11px] text-foreground/90 leading-relaxed">{event.content}</p>

        {/* Duration */}
        {event.duration && (
          <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
            <Clock className="w-2.5 h-2.5" />
            <span>{event.duration}ms</span>
          </div>
        )}

        {/* Metadata Preview */}
        {(event.metadata?.result != null) && (
          <details className="mt-2">
            <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              View Details
            </summary>
            <pre className="text-[10px] font-mono text-success bg-navy-900 p-2 rounded mt-1 overflow-x-auto border border-navy-600">
              {JSON.stringify(event.metadata.result, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </motion.div>
  );
}
