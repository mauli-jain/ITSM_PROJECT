import {
  Category,
  Impact,
  Incident,
  IncidentStatus,
  ITService,
  Priority,
  PriorityStrategyType,
  Technician,
  Urgency,
} from '../types/itsm';

/**
 * INTELLIGENT FEATURE (E): Keyword-based Category Suggestion
 * Analyzes incident text and scores each category based on keyword matches.
 */
export function suggestCategory(
  title: string,
  description: string,
  categories: Category[]
): { suggestedCategory: Category | null; matchedKeywords: string[]; confidence: number } {
  const combinedText = `${title} ${description}`.toLowerCase();
  let bestCategory: Category | null = null;
  let maxMatches = 0;
  let bestKeywords: string[] = [];

  for (const cat of categories) {
    const matched = cat.keywords.filter((k) => combinedText.includes(k.toLowerCase()));
    if (matched.length > maxMatches) {
      maxMatches = matched.length;
      bestCategory = cat;
      bestKeywords = matched;
    }
  }

  const confidence = bestCategory ? Math.min(100, Math.round((maxMatches / 3) * 100)) : 0;
  return { suggestedCategory: bestCategory, matchedKeywords: bestKeywords, confidence };
}

/**
 * Tokenize string into set of cleaned lowercase words
 */
function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['the', 'and', 'for', 'with', 'this', 'that', 'are', 'was'].includes(w));
  return new Set(tokens);
}

/**
 * INTELLIGENT FEATURE (A): Duplicate / Related Incident Detection
 * Uses Jaccard Token Similarity on incidents sharing the same affected service
 * within a recent time window (default 24h).
 * Formula: J(A, B) = |A ∩ B| / |A ∪ B|
 */
export function detectDuplicates(
  title: string,
  description: string,
  serviceId: string,
  existingIncidents: Incident[],
  threshold = 0.28
): Array<{ incident: Incident; similarityScore: number; sharedKeywords: string[] }> {
  const inputTokens = tokenize(`${title} ${description}`);
  if (inputTokens.size === 0) return [];

  const results: Array<{ incident: Incident; similarityScore: number; sharedKeywords: string[] }> = [];

  for (const inc of existingIncidents) {
    // Only compare incidents sharing the same service or open
    if (inc.serviceId !== serviceId && serviceId !== '') continue;

    const incTokens = tokenize(`${inc.title} ${inc.description}`);
    if (incTokens.size === 0) continue;

    const intersection: string[] = [];
    inputTokens.forEach((token) => {
      if (incTokens.has(token)) {
        intersection.push(token);
      }
    });

    const unionSize = new Set([...inputTokens, ...incTokens]).size;
    const similarity = unionSize > 0 ? intersection.length / unionSize : 0;

    if (similarity >= threshold) {
      results.push({
        incident: inc,
        similarityScore: Math.round(similarity * 100),
        sharedKeywords: intersection,
      });
    }
  }

  return results.sort((a, b) => b.similarityScore - a.similarityScore);
}

/**
 * STRATEGY PATTERN: Priority Calculation
 * Supports Weighted Scoring & Rule-Based Strategy
 */
export function calculatePriority(
  impact: Impact,
  urgency: Urgency,
  service: ITService | null,
  affectedUsers: number,
  strategy: PriorityStrategyType = 'WEIGHTED_SCORING'
): { priority: Priority; score: number; rationale: string } {
  const impactWeights: Record<Impact, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const urgencyWeights: Record<Urgency, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const critWeights: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

  const impVal = impactWeights[impact] || 2;
  const urgVal = urgencyWeights[urgency] || 2;
  const critVal = service ? critWeights[service.businessCriticality] : 2;

  if (strategy === 'RULE_BASED') {
    // ITIL Rule-Based Matrix
    if (impact === 'CRITICAL' && urgency === 'CRITICAL') {
      return { priority: 'P1', score: 100, rationale: 'Rule-Based: Critical Impact + Critical Urgency = P1' };
    }
    if (impact === 'CRITICAL' || urgency === 'CRITICAL' || (impact === 'HIGH' && urgency === 'HIGH')) {
      return { priority: 'P2', score: 75, rationale: 'Rule-Based: High/Critical combinations mapped to P2' };
    }
    if (impact === 'MEDIUM' || urgency === 'MEDIUM') {
      return { priority: 'P3', score: 50, rationale: 'Rule-Based: Moderate operational disruption mapped to P3' };
    }
    return { priority: 'P4', score: 25, rationale: 'Rule-Based: Minor non-urgent issue mapped to P4' };
  }

  // WEIGHTED SCORING STRATEGY:
  // Base Score = Impact (40%) * Urgency (35%) * Business Criticality (25%)
  // Multiplied by user impact factor: 1 + log10(max(1, affectedUsers)) * 0.15
  const userMultiplier = 1 + Math.log10(Math.max(1, affectedUsers)) * 0.12;
  const rawScore = (impVal * 0.4 + urgVal * 0.35 + critVal * 0.25) * userMultiplier * 10;
  const finalScore = Math.min(100, Math.round(rawScore * 2));

  let priority: Priority = 'P4';
  if (finalScore >= 65 || (impVal === 4 && urgVal >= 3)) {
    priority = 'P1';
  } else if (finalScore >= 45) {
    priority = 'P2';
  } else if (finalScore >= 25) {
    priority = 'P3';
  } else {
    priority = 'P4';
  }

  return {
    priority,
    score: finalScore,
    rationale: `Weighted Scoring: (Imp:${impVal}×0.4 + Urg:${urgVal}×0.35 + Crit:${critVal}×0.25) × UsersFactor(${userMultiplier.toFixed(2)}) = Score ${finalScore}`,
  };
}

/**
 * INTELLIGENT FEATURE (B): Smart Technician Recommendation
 * Documented Formula:
 * - Skill Match Score (40%): Matching technician skills with category name / service name / keywords
 * - Workload Availability Score (30%): (1 - activeIncidents / maxWorkload) * 100 (0 if full)
 * - Experience Score (20%): min(100, years * 12.5)
 * - Status Bonus (10%): 100 if available, 0 if unavailable
 */
export interface TechnicianScore {
  technician: Technician;
  totalScore: number;
  skillScore: number;
  workloadScore: number;
  experienceScore: number;
  matchedSkills: string[];
}

export function recommendTechnicians(
  technicians: Technician[],
  categoryName: string,
  serviceName: string,
  incidentDescription: string
): TechnicianScore[] {
  const searchTerms = tokenize(`${categoryName} ${serviceName} ${incidentDescription}`);

  return technicians.map((tech) => {
    // 1. Skill Score
    const matchedSkills = tech.skills.filter((skill) =>
      Array.from(searchTerms).some((term) => skill.toLowerCase().includes(term) || term.includes(skill.toLowerCase()))
    );
    const skillScore = Math.min(100, (matchedSkills.length / Math.max(1, tech.skills.length)) * 140);

    // 2. Workload Score
    const capacityRemaining = Math.max(0, tech.maxWorkload - tech.activeIncidentCount);
    const workloadScore = (capacityRemaining / tech.maxWorkload) * 100;

    // 3. Experience Score (8 yrs = 100%)
    const experienceScore = Math.min(100, tech.experienceYears * 12.5);

    // 4. Availability flag bonus
    const availBonus = tech.available ? 100 : 0;

    const totalScore = Math.round(
      skillScore * 0.4 + workloadScore * 0.3 + experienceScore * 0.2 + availBonus * 0.1
    );

    return {
      technician: tech,
      totalScore,
      skillScore: Math.round(skillScore),
      workloadScore: Math.round(workloadScore),
      experienceScore: Math.round(experienceScore),
      matchedSkills,
    };
  }).sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * INTELLIGENT FEATURE (D): SLA Risk Detection
 * Calculates percentage of time elapsed against targets
 */
export function checkSlaStatus(
  createdAt: string,
  responseDeadline: string,
  resolutionDeadline: string,
  status: IncidentStatus
): {
  isResponseBreached: boolean;
  isResponseAtRisk: boolean;
  isResolutionBreached: boolean;
  isResolutionAtRisk: boolean;
  resolutionElapsedPercent: number;
} {
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const respTarget = new Date(responseDeadline).getTime();
  const resTarget = new Date(resolutionDeadline).getTime();

  const isClosedOrResolved = status === 'RESOLVED' || status === 'VERIFIED' || status === 'CLOSED';
  const isAcknowledged = status !== 'NEW' && status !== 'CLASSIFIED' && status !== 'ASSIGNED';

  // Response SLA check
  const isResponseBreached = !isAcknowledged && now > respTarget;
  const isResponseAtRisk = !isAcknowledged && !isResponseBreached && (now - created) / (respTarget - created) >= 0.75;

  // Resolution SLA check
  const resolutionElapsedPercent = Math.min(150, Math.round(((now - created) / (resTarget - created)) * 100));
  const isResolutionBreached = !isClosedOrResolved && now > resTarget;
  const isResolutionAtRisk = !isClosedOrResolved && !isResolutionBreached && resolutionElapsedPercent >= 75;

  return {
    isResponseBreached,
    isResponseAtRisk,
    isResolutionBreached,
    isResolutionAtRisk,
    resolutionElapsedPercent,
  };
}

/**
 * INTELLIGENT FEATURE (F): Suggested Resolution from Historical Incidents
 */
export function findSuggestedResolutions(
  title: string,
  description: string,
  resolvedIncidents: Incident[]
): Array<{ incidentId: string; title: string; resolutionSummary: string; similarityScore: number }> {
  const queryTokens = tokenize(`${title} ${description}`);
  if (queryTokens.size === 0) return [];

  const candidates: Array<{ incidentId: string; title: string; resolutionSummary: string; similarityScore: number }> = [];

  for (const inc of resolvedIncidents) {
    if (!inc.resolutionSummary) continue;
    const incTokens = tokenize(`${inc.title} ${inc.description}`);
    const intersection = Array.from(queryTokens).filter((t) => incTokens.has(t));
    const union = new Set([...queryTokens, ...incTokens]);
    const sim = union.size > 0 ? (intersection.length / union.size) : 0;

    if (sim >= 0.15) {
      candidates.push({
        incidentId: inc.id,
        title: inc.title,
        resolutionSummary: inc.resolutionSummary,
        similarityScore: Math.round(sim * 100),
      });
    }
  }

  return candidates.sort((a, b) => b.similarityScore - a.similarityScore);
}
