import { useCallback, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "reactflow";
import dagre from "dagre";
import type { TaskNode, Workflow } from "../../domain/types";
import { StatusDot } from "../../components/StatusDot";
import "reactflow/dist/style.css";

const NODE_W = 180;
const NODE_H = 64;

interface DagNodeData {
  task: TaskNode;
  isActive: boolean;
  onFocus: (taskId: string) => void;
}

function TaskFlowNode({ data }: NodeProps<DagNodeData>): JSX.Element {
  const { task, isActive, onFocus } = data;
  return (
    <div
      onClick={() => onFocus(task.id)}
      className={`px-3 py-2 rounded border text-left cursor-pointer transition-colors ${
        isActive
          ? "border-accent bg-accent/10"
          : "border-border bg-bg-elev hover:border-accent/50"
      }`}
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className="flex items-center gap-1.5 mb-1">
        <StatusDot status={task.executionStatus} size="sm" />
        <span className="text-[10px] text-fg-subtle font-mono">{task.executionStatus}</span>
      </div>
      <div className="text-xs text-fg font-medium truncate">{task.title || task.id}</div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

const NODE_TYPES = { taskNode: TaskFlowNode };

function layoutGraph(
  workflow: Workflow,
  activeTaskId: string | undefined,
  onFocus: (taskId: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 60, nodesep: 30 });

  const tasks = Object.values(workflow.graph);
  for (const task of tasks) {
    g.setNode(task.id, { width: NODE_W, height: NODE_H });
  }
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      g.setEdge(dep, task.id);
    }
  }

  dagre.layout(g);

  const nodes: Node[] = tasks.map((task) => {
    const pos = g.node(task.id);
    return {
      id: task.id,
      type: "taskNode",
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: {
        task,
        isActive: task.id === activeTaskId,
        onFocus,
      } as DagNodeData,
    };
  });

  const edges: Edge[] = [];
  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      edges.push({
        id: `${dep}->${task.id}`,
        source: dep,
        target: task.id,
        type: "smoothstep",
        style: { stroke: "var(--color-border)", strokeWidth: 1.5 },
      });
    }
  }

  return { nodes, edges };
}

interface Props {
  workflow: Workflow;
  activeTaskId?: string;
  onTaskFocus: (taskId: string) => void;
}

export function DagCanvas({ workflow, activeTaskId, onTaskFocus }: Props): JSX.Element {
  const handleFocus = useCallback(
    (taskId: string) => {
      onTaskFocus(taskId);
    },
    [onTaskFocus],
  );

  const { nodes, edges } = useMemo(
    () => layoutGraph(workflow, activeTaskId, handleFocus),
    [workflow, activeTaskId, handleFocus],
  );

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="var(--color-border)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
