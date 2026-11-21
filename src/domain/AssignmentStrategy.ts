import { Technician } from '../types/itsm';

export interface AssignmentContext {
  incidentId: string;
  categoryName: string;
  serviceName: string;
  incidentDescription: string;
  affectedUsers: number;
}

export interface AssignmentResult {
  technician: Technician;
  strategyUsed: string;
  score: number;
  rationale: string;
}

/**
 * Strategy Interface for Technician Assignment
 */
export interface AssignmentStrategy {
  readonly name: string;
  readonly code: string;
  readonly description: string;
  assign(technicians: Technician[], context: AssignmentContext): AssignmentResult | null;
}

/**
 * 1. Skill-Based Assignment Strategy
 * Matches technician skills against category keywords and service description.
 */
export class SkillBasedAssignmentStrategy implements AssignmentStrategy {
  public readonly name = 'Skill-Based Assignment';
  public readonly code = 'SKILL_BASED';
  public readonly description = 'Matches technician skill tags with incident keywords and service domain';

  public assign(technicians: Technician[], context: AssignmentContext): AssignmentResult | null {
    const availableTechs = technicians.filter((t) => t.available && t.activeIncidentCount < t.maxWorkload);
    if (availableTechs.length === 0) return null;

    const terms = `${context.categoryName} ${context.serviceName} ${context.incidentDescription}`.toLowerCase();

    let bestTech: Technician = availableTechs[0];
    let maxMatchCount = -1;

    for (const tech of availableTechs) {
      const matchCount = tech.skills.filter((skill) =>
        terms.includes(skill.toLowerCase())
      ).length;

      if (matchCount > maxMatchCount) {
        maxMatchCount = matchCount;
        bestTech = tech;
      }
    }

    const score = Math.min(100, Math.round(((maxMatchCount + 1) / 4) * 100));
    return {
      technician: bestTech,
      strategyUsed: this.name,
      score,
      rationale: `Matched ${maxMatchCount} specialized skills (${bestTech.skills.slice(0, 3).join(', ')}) with incident profile.`,
    };
  }
}

/**
 * 2. Load-Based Assignment Strategy
 * Selects technician with the lowest workload utilization ratio (active / max).
 */
export class LoadBasedAssignmentStrategy implements AssignmentStrategy {
  public readonly name = 'Load-Balanced Assignment';
  public readonly code = 'LOAD_BASED';
  public readonly description = 'Minimizes technician burnout by selecting lowest active capacity utilization';

  public assign(technicians: Technician[], _context: AssignmentContext): AssignmentResult | null {
    const availableTechs = technicians.filter((t) => t.available && t.activeIncidentCount < t.maxWorkload);
    if (availableTechs.length === 0) return null;

    // Sort by ratio of active / max ascending
    const sorted = [...availableTechs].sort((a, b) => {
      const ratioA = a.activeIncidentCount / Math.max(1, a.maxWorkload);
      const ratioB = b.activeIncidentCount / Math.max(1, b.maxWorkload);
      return ratioA - ratioB;
    });

    const chosen = sorted[0];
    const utilization = Math.round((chosen.activeIncidentCount / chosen.maxWorkload) * 100);

    return {
      technician: chosen,
      strategyUsed: this.name,
      score: 100 - utilization,
      rationale: `Selected technician with lowest queue capacity utilization: ${chosen.activeIncidentCount}/${chosen.maxWorkload} (${utilization}% loaded).`,
    };
  }
}

/**
 * 3. Round-Robin Assignment Strategy
 * Fair circular dispatch among eligible technicians based on persistent counter index.
 */
export class RoundRobinAssignmentStrategy implements AssignmentStrategy {
  public readonly name = 'Round-Robin Assignment';
  public readonly code = 'ROUND_ROBIN';
  public readonly description = 'Circular distribution across available on-duty technicians';
  private static currentIndex: number = 0;

  public assign(technicians: Technician[], _context: AssignmentContext): AssignmentResult | null {
    const availableTechs = technicians.filter((t) => t.available && t.activeIncidentCount < t.maxWorkload);
    if (availableTechs.length === 0) return null;

    const selected = availableTechs[RoundRobinAssignmentStrategy.currentIndex % availableTechs.length];
    RoundRobinAssignmentStrategy.currentIndex = (RoundRobinAssignmentStrategy.currentIndex + 1) % availableTechs.length;

    return {
      technician: selected,
      strategyUsed: this.name,
      score: 85,
      rationale: `Dispatched via circular round-robin sequence (Index #${RoundRobinAssignmentStrategy.currentIndex}).`,
    };
  }
}

/**
 * 4. Experience-Based Assignment Strategy
 * Prioritizes senior technicians with high years of experience, especially for critical incidents.
 */
export class ExperienceBasedAssignmentStrategy implements AssignmentStrategy {
  public readonly name = 'Experience-Based Assignment';
  public readonly code = 'EXPERIENCE_BASED';
  public readonly description = 'Routes incidents to highest-tenured senior specialists';

  public assign(technicians: Technician[], _context: AssignmentContext): AssignmentResult | null {
    const availableTechs = technicians.filter((t) => t.available && t.activeIncidentCount < t.maxWorkload);
    if (availableTechs.length === 0) return null;

    // Sort descending by experienceYears
    const sorted = [...availableTechs].sort((a, b) => b.experienceYears - a.experienceYears);
    const chosen = sorted[0];
    const expScore = Math.min(100, Math.round(chosen.experienceYears * 12.5));

    return {
      technician: chosen,
      strategyUsed: this.name,
      score: expScore,
      rationale: `Assigned to Senior Staff (${chosen.experienceYears} years seniority; ${chosen.specialization}).`,
    };
  }
}

/**
 * Strategy Context / Dispatcher
 */
export class AssignmentStrategyContext {
  private _strategy: AssignmentStrategy;

  constructor(strategy?: AssignmentStrategy) {
    this._strategy = strategy || new SkillBasedAssignmentStrategy();
  }

  public setStrategy(strategy: AssignmentStrategy): void {
    this._strategy = strategy;
  }

  public get currentStrategy(): AssignmentStrategy {
    return this._strategy;
  }

  public execute(technicians: Technician[], context: AssignmentContext): AssignmentResult | null {
    return this._strategy.assign(technicians, context);
  }

  public static createFromCode(code: string): AssignmentStrategy {
    switch (code) {
      case 'SKILL_BASED':
        return new SkillBasedAssignmentStrategy();
      case 'LOAD_BASED':
        return new LoadBasedAssignmentStrategy();
      case 'ROUND_ROBIN':
        return new RoundRobinAssignmentStrategy();
      case 'EXPERIENCE_BASED':
        return new ExperienceBasedAssignmentStrategy();
      default:
        return new SkillBasedAssignmentStrategy();
    }
  }
}
