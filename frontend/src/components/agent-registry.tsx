'use client';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, ChevronLeft, ChevronRight, Network } from 'lucide-react';
import { useAgentStore } from '@/stores';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AgentConnection } from '@/types';

export function AgentRegistry() {
  const { agents, connections, addAgent, activeAgent, setActiveAgent, delegationState } = useAgentStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAgentUrl, setNewAgentUrl] = useState('');

  const onlineCount = agents.filter((a) => a.status === 'online').length;
  const activeCount = agents.filter((a) => a.isActive).length;

  const handleRegisterAgent = () => {
    if (newAgentUrl.trim()) {
      // In a real app, this would fetch agent info from the URL
      addAgent({
        id: `agent-${Date.now()}`,
        name: 'New Agent',
        description: 'Agent registered from URL',
        status: 'online',
        color: '#00A3E0',
        skills: ['Custom Skills'],
        url: newAgentUrl,
        isActive: false,
        lastActivity: new Date(),
      });
      setNewAgentUrl('');
      setIsDialogOpen(false);
    }
  };

  // Calculate connection status for each connection
  const getConnectionStatus = (source: string, target: string): 'idle' | 'active' | 'completed' => {
    const connectionId = `${source}-${target}`;
    if (delegationState.activeConnections.includes(connectionId)) return 'active';
    if (delegationState.completedDelegations.includes(connectionId)) return 'completed';
    return 'idle';
  };

  return (
    <motion.div
      initial={false}
      animate={{ width: isCollapsed ? 60 : 320 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="h-full bg-navy-900 border-r border-navy-600 flex flex-col overflow-hidden"
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
            <Users className="w-5 h-5 text-amex-blue" />
            <div className="flex flex-col">
              <span className="font-semibold text-foreground text-sm">Agent Registry</span>
              <span className="text-[10px] text-muted-foreground">{onlineCount} online • {activeCount} active</span>
            </div>
          </motion.div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-navy-800"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Agent List */}
      {!isCollapsed && (
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            <AnimatePresence>
              {agents.map((agent, index) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card
                    className={`p-3 cursor-pointer transition-all duration-200 border ${
                      activeAgent === agent.id
                        ? 'border-amex-blue bg-navy-800 active'
                        : 'border-navy-600 bg-navy-800 hover:border-navy-500'
                    }`}
                    onClick={() => setActiveAgent(agent.id)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Status Indicator */}
                      <div className="relative mt-1">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${
                            agent.status === 'online' 
                              ? agent.isActive 
                                ? 'bg-amex-light animate-subtle-pulse' 
                                : 'bg-success'
                              : 'bg-muted'
                          }`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Agent Name & Color */}
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: agent.color }}
                          />
                          <span className="font-medium text-foreground text-sm truncate">
                            {agent.name}
                          </span>
                          {agent.isActive && (
                            <Badge 
                              variant="secondary" 
                              className="text-[9px] px-1.5 py-0 bg-amex-light/10 text-amex-light border-amex-light/20"
                            >
                              Active
                            </Badge>
                          )}
                        </div>

                        {/* Description */}
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                          {agent.description}
                        </p>

                        {/* Skills - Simplified */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {agent.skills.slice(0, 2).map((skill) => (
                            <Badge
                              key={skill}
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 border-navy-600 text-muted-foreground font-normal"
                            >
                              {skill}
                            </Badge>
                          ))}
                          {agent.skills.length > 2 && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 border-navy-600 text-muted-foreground font-normal"
                            >
                              +{agent.skills.length - 2}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Dynamic Delegation Routes Diagram */}
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 mb-3">
              <Network className="w-4 h-4 text-amex-blue" />
              <h4 className="label">Delegation Routes</h4>
            </div>
            
            {/* Status Legend */}
            <div className="space-y-2 mb-3">
              {/* Connection Line Legend */}
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Connections</div>
              <div className="flex gap-3 text-[10px]">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5" style={{ background: 'repeating-linear-gradient(90deg, #8B9DAF, #8B9DAF 2px, transparent 2px, transparent 4px)' }} />
                  <span className="text-muted-foreground">Not established</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-amex-light" />
                  <span className="text-muted-foreground">Active</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-success" />
                  <span className="text-muted-foreground">Established</span>
                </div>
              </div>
              {/* Agent Status Legend */}
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Agent Status</div>
              <div className="flex gap-3 text-[10px]">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  <span className="text-muted-foreground">Idle</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-amex-blue" />
                  <span className="text-muted-foreground">Active</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-success" />
                  <span className="text-muted-foreground">Completed</span>
                </div>
              </div>
            </div>

            <svg className="w-full h-40" viewBox="0 0 280 160">
              {/* Connection Lines - Dynamic based on status */}
              {connections.map((conn, i) => {
                const sourceAgent = agents.find((a) => a.id === conn.source);
                const targetAgent = agents.find((a) => a.id === conn.target);
                if (!sourceAgent || !targetAgent) return null;

                const sourceIndex = agents.findIndex((a) => a.id === conn.source);
                const targetIndex = agents.findIndex((a) => a.id === conn.target);
                
                // Calculate positions for a clean hierarchy
                const sourceX = 140; // Center for AVA
                const sourceY = 30;
                
                // Target positions spread evenly at bottom
                const targetX = targetIndex === 1 ? 80 : 200;
                const targetY = 130;

                const connectionStatus = getConnectionStatus(conn.source, conn.target);
                let strokeClass = 'connection-line-idle';
                let strokeColor = '#8B9DAF';
                
                if (connectionStatus === 'active') {
                  strokeClass = 'connection-line-active';
                  strokeColor = '#00A3E0';
                } else if (connectionStatus === 'completed') {
                  strokeClass = 'connection-line-completed';
                  strokeColor = '#00A86B';
                }

                // Calculate arrow position
                const midX = (sourceX + targetX) / 2;
                const midY = (sourceY + targetY) / 2;
                const angle = Math.atan2(targetY - sourceY, targetX - sourceX);

                return (
                  <g key={`conn-${i}`}>
                    {/* Connection line */}
                    <line
                      x1={sourceX}
                      y1={sourceY}
                      x2={targetX}
                      y2={targetY}
                      className={strokeClass}
                      stroke={strokeColor}
                      strokeWidth={connectionStatus === 'active' ? 2 : 1.5}
                    />
                    
                    {/* Direction arrow */}
                    <polygon
                      points="-6,-3 6,0 -6,3"
                      transform={`translate(${midX}, ${midY}) rotate(${angle * 180 / Math.PI})`}
                      fill={strokeColor}
                      opacity={0.8}
                    />
                    
                    {/* Target node indicator */}
                    <circle
                      cx={targetX}
                      cy={targetY}
                      r={6}
                      fill={targetAgent.color}
                      stroke={connectionStatus === 'active' ? '#00A3E0' : 'transparent'}
                      strokeWidth={2}
                      className={connectionStatus === 'active' ? 'animate-subtle-pulse' : ''}
                    />
                  </g>
                );
              })}

              {/* Agent Nodes */}
              {agents.map((agent, i) => {
                // Position AVA at top center, others at bottom
                const x = i === 0 ? 140 : i === 1 ? 80 : 200;
                const y = i === 0 ? 30 : 130;
                const isActiveNode = agent.isActive;

                return (
                  <g key={`agent-${agent.id}`}>
                    {/* Outer ring for active agents */}
                    {isActiveNode && (
                      <circle
                        cx={x}
                        cy={y}
                        r={14}
                        fill="none"
                        stroke={agent.color}
                        strokeWidth={2}
                        opacity={0.3}
                        className="animate-subtle-pulse"
                      />
                    )}
                    
                    {/* Main node */}
                    <circle
                      cx={x}
                      cy={y}
                      r={10}
                      fill={agent.color}
                      stroke={activeAgent === agent.id ? '#FFFFFF' : 'transparent'}
                      strokeWidth={2}
                      className="agent-node"
                    />
                    
                    {/* Node label */}
                    <text
                      x={x}
                      y={y + 24}
                      textAnchor="middle"
                      fill="#8B9DAF"
                      fontSize="10"
                      fontWeight="500"
                    >
                      {agent.name.length > 12 ? agent.name.substring(0, 10) + '...' : agent.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </ScrollArea>
      )}

      {/* Register Agent Button */}
      {!isCollapsed && (
        <div className="p-3 border-t border-navy-600">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-navy-600 bg-navy-800 hover:bg-navy-700 text-foreground h-10 px-4 py-2">
              <Plus className="w-4 h-4 mr-2" />
              Register Agent
            </DialogTrigger>
            <DialogContent className="bg-navy-800 border-navy-600">
              <DialogHeader>
                <DialogTitle className="text-foreground">Register New Agent</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Enter the agent URL to register it in the studio.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="agent-url" className="text-foreground">
                    Agent URL
                  </Label>
                  <Input
                    id="agent-url"
                    placeholder="http://localhost:4003"
                    value={newAgentUrl}
                    onChange={(e) => setNewAgentUrl(e.target.value)}
                    className="bg-navy-900 border-navy-600 text-foreground"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  className="border-navy-600"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRegisterAgent}
                  className="bg-amex-blue hover:bg-amex-light text-white"
                >
                  Register
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </motion.div>
  );
}
