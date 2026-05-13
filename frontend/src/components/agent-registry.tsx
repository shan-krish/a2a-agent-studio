'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, ChevronLeft, ChevronRight, Wifi, WifiOff } from 'lucide-react';
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
  const { agents, connections, addAgent, activeAgent, setActiveAgent } = useAgentStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAgentUrl, setNewAgentUrl] = useState('');

  const onlineCount = agents.filter((a) => a.status === 'online').length;

  const handleRegisterAgent = () => {
    if (newAgentUrl.trim()) {
      // In a real app, this would fetch agent info from the URL
      addAgent({
        id: `agent-${Date.now()}`,
        name: 'New Agent',
        description: 'Agent registered from URL',
        status: 'online',
        color: '#9D4EDD',
        skills: ['Custom Skills'],
        url: newAgentUrl,
      });
      setNewAgentUrl('');
      setIsDialogOpen(false);
    }
  };

  return (
    <motion.div
      initial={false}
      animate={{ width: isCollapsed ? 60 : 280 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="h-full bg-navy-900 border-r border-navy-600 flex flex-col overflow-hidden"
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
            <Users className="w-5 h-5 text-blue-500" />
            <span className="font-semibold text-foreground">Agent Registry</span>
            <Badge variant="secondary" className="bg-navy-600 text-blue-300">
              {onlineCount}/{agents.length}
            </Badge>
          </motion.div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>

      {/* Agent List */}
      {!isCollapsed && (
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-2">
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
                        ? 'border-blue-500 bg-navy-700'
                        : 'border-navy-600 bg-navy-800 hover:bg-navy-700'
                    }`}
                    onClick={() => setActiveAgent(agent.id)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Status Indicator */}
                      <div className="relative mt-1">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            agent.status === 'online' ? 'bg-green-400' : 'bg-gray-500'
                          } ${agent.status === 'online' ? 'status-online' : ''}`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Agent Name & Color */}
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: agent.color }}
                          />
                          <span className="font-medium text-foreground truncate">
                            {agent.name}
                          </span>
                        </div>

                        {/* Description */}
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {agent.description}
                        </p>

                        {/* Skills */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {agent.skills.slice(0, 3).map((skill) => (
                            <Badge
                              key={skill}
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-navy-600 text-muted-foreground"
                            >
                              {skill}
                            </Badge>
                          ))}
                          {agent.skills.length > 3 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-navy-600 text-muted-foreground"
                            >
                              +{agent.skills.length - 3}
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

          {/* Connection Graph */}
          <div className="mt-6">
            <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">
              Delegation Routes
            </h4>
            <svg className="w-full h-32" viewBox="0 0 200 100">
              {/* Connection Lines */}
              {connections.map((conn, i) => {
                const sourceAgent = agents.find((a) => a.id === conn.source);
                const targetAgent = agents.find((a) => a.id === conn.target);
                if (!sourceAgent || !targetAgent) return null;

                const sourceIndex = agents.findIndex((a) => a.id === conn.source);
                const targetIndex = agents.findIndex((a) => a.id === conn.target);
                const sourceX = 100;
                const sourceY = 10 + sourceIndex * 30;
                const targetX = targetIndex === 1 ? 30 : 170;
                const targetY = 10 + targetIndex * 30;

                return (
                  <g key={i}>
                    <line
                      x1={sourceX}
                      y1={sourceY}
                      x2={targetX}
                      y2={targetY}
                      stroke={sourceAgent.color}
                      strokeWidth="1.5"
                      strokeOpacity="0.5"
                      className="connection-line"
                    />
                    <circle
                      cx={targetX}
                      cy={targetY}
                      r="4"
                      fill={targetAgent.color}
                    />
                  </g>
                );
              })}

              {/* Agent Nodes */}
              {agents.map((agent, i) => {
                const x = i === 0 ? 100 : i === 1 ? 30 : 170;
                const y = 10 + i * 30;

                return (
                  <g key={agent.id}>
                    <circle
                      cx={x}
                      cy={y}
                      r="8"
                      fill={agent.color}
                      stroke={activeAgent === agent.id ? '#fff' : 'transparent'}
                      strokeWidth="2"
                    />
                    <text
                      x={x}
                      y={y + 20}
                      textAnchor="middle"
                      fill="#8FA3BF"
                      fontSize="8"
                    >
                      {agent.name.split(' ')[0]}
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
            <DialogTrigger>
              <Button
                variant="outline"
                className="w-full border-navy-600 text-muted-foreground hover:text-foreground hover:bg-navy-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Register Agent
              </Button>
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
                  className="bg-blue-500 hover:bg-blue-400 text-white"
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
