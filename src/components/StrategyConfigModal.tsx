import React from 'react';
import { Check, SlidersHorizontal } from 'lucide-react';
import { PriorityStrategyType, AssignmentStrategyType } from '../types/itsm';
import { Modal, OverlayHeader } from './ui';

interface StrategyConfigModalProps {
  priorityStrategy: PriorityStrategyType;
  setPriorityStrategy: (s: PriorityStrategyType) => void;
  assignmentStrategy: AssignmentStrategyType;
  setAssignmentStrategy: (s: AssignmentStrategyType) => void;
  onClose: () => void;
}

const PRIORITY_OPTIONS: { id: PriorityStrategyType; title: string; body: React.ReactNode }[] = [
  {
    id: 'WEIGHTED_SCORING',
    title: 'Weighted scoring',
    body: (
      <>
        <code className="font-mono text-[11.5px]">Impact×40% + Urgency×35% + Criticality×25%</code>, scaled by a logarithmic
        affected-users factor.
      </>
    ),
  },
  {
    id: 'RULE_BASED',
    title: 'Rule-based (ITIL)',
    body: 'Deterministic lookup: Critical + Critical = P1, high combinations = P2, medium = P3, low = P4.',
  },
];

const ASSIGNMENT_OPTIONS: { id: AssignmentStrategyType; title: string; body: string }[] = [
  { id: 'SKILL_BASED', title: 'Skill-based', body: 'Matches technician skills to the affected service and category keywords.' },
  { id: 'LOAD_BASED', title: 'Load-based', body: 'Sends work to the available technician with the lowest workload ratio.' },
  { id: 'ROUND_ROBIN', title: 'Round-robin', body: 'Distributes incidents evenly across all rostered technicians.' },
  { id: 'EXPERIENCE_BASED', title: 'Experience-based', body: 'Routes P1/P2 incidents to the most senior technicians first.' },
];

function OptionCard<T extends string>({
  name,
  option,
  selected,
  onSelect,
}: {
  name: string;
  option: { id: T; title: string; body: React.ReactNode };
  selected: boolean;
  onSelect: (id: T) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      name={name}
      onClick={() => onSelect(option.id)}
      className={`relative rounded-xl border p-4 text-left transition-all ${
        selected
          ? 'border-ink/70 bg-surface ring-1 ring-ink/70'
          : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{option.title}</span>
        <span
          className={`grid h-5 w-5 place-items-center rounded-full border transition-colors ${
            selected ? 'border-ink bg-ink text-canvas' : 'border-line-strong'
          }`}
          aria-hidden="true"
        >
          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      </span>
      <span className="mt-1.5 block text-[13px] leading-relaxed text-muted">{option.body}</span>
    </button>
  );
}

export const StrategyConfigModal: React.FC<StrategyConfigModalProps> = ({
  priorityStrategy,
  setPriorityStrategy,
  assignmentStrategy,
  setAssignmentStrategy,
  onClose,
}) => (
  <Modal onClose={onClose} labelledBy="strategy-title" size="lg">
    <OverlayHeader
      id="strategy-title"
      icon={SlidersHorizontal}
      title="Routing rules"
      subtitle="Change how incidents are prioritised and assigned. Takes effect immediately."
      onClose={onClose}
    />

    <div className="space-y-7 overflow-y-auto px-6 py-5">
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-ink">Priority calculation</legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" role="radiogroup">
          {PRIORITY_OPTIONS.map((o) => (
            <OptionCard key={o.id} name="priority" option={o} selected={priorityStrategy === o.id} onSelect={setPriorityStrategy} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-ink">Technician assignment</legend>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2" role="radiogroup">
          {ASSIGNMENT_OPTIONS.map((o) => (
            <OptionCard key={o.id} name="assignment" option={o} selected={assignmentStrategy === o.id} onSelect={setAssignmentStrategy} />
          ))}
        </div>
      </fieldset>
    </div>

    <footer className="flex justify-end gap-2 border-t border-line px-6 py-3.5">
      <button type="button" onClick={onClose} className="ui-btn ui-btn-primary">
        Done
      </button>
    </footer>
  </Modal>
);
