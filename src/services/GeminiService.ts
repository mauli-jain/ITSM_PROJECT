import { GoogleGenAI } from '@google/genai';
import { Category, Incident } from '../types/itsm';

export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  confidence: number; // 0.0 - 1.0
  rationale: string;
}

export interface ResolutionSuggestion {
  suggestedResolution: string;
  confidence: number;
  similarIncidentId?: string;
  keySteps?: string[];
  rationale?: string;
}

/**
 * Strategy/Adapter interface for AI capabilities
 */
export interface AIProvider {
  name: string;
  suggestCategory(
    description: string,
    availableCategories: Category[]
  ): Promise<CategorySuggestion>;
  suggestResolution(
    description: string,
    pastResolvedIncidents: Incident[]
  ): Promise<ResolutionSuggestion>;
}

/**
 * Tokenize string into normalized word set
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

/**
 * Rule-based fallback provider when GEMINI_API_KEY is not set or API fails
 */
export class RuleBasedAIProvider implements AIProvider {
  public readonly name = 'RuleBasedFallback';

  async suggestCategory(
    description: string,
    availableCategories: Category[]
  ): Promise<CategorySuggestion> {
    if (!availableCategories || availableCategories.length === 0) {
      return {
        categoryId: 'CAT-GEN',
        categoryName: 'General IT',
        confidence: 0.5,
        rationale: 'Default category applied (no categories provided)',
      };
    }

    const inputTokens = tokenize(description);
    let bestCat = availableCategories[0];
    let maxOverlap = 0;

    for (const cat of availableCategories) {
      const catTokens = tokenize(`${cat.name} ${cat.description} ${(cat.keywords || []).join(' ')}`);
      let overlap = 0;
      for (const token of inputTokens) {
        if (catTokens.has(token)) overlap++;
      }
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestCat = cat;
      }
    }

    const confidence = maxOverlap > 0 ? Math.min(0.9, 0.5 + maxOverlap * 0.1) : 0.45;
    return {
      categoryId: bestCat.id,
      categoryName: bestCat.name,
      confidence: Math.round(confidence * 100) / 100,
      rationale: maxOverlap > 0
        ? `Rule-based token matching identified ${maxOverlap} overlapping domain keyword(s).`
        : 'Default category assigned based on low keyword affinity.',
    };
  }

  async suggestResolution(
    description: string,
    pastResolvedIncidents: Incident[]
  ): Promise<ResolutionSuggestion> {
    const inputTokens = tokenize(description);
    let bestMatch: Incident | null = null;
    let highestJaccard = 0;

    for (const inc of pastResolvedIncidents) {
      if (!inc.resolutionSummary) continue;
      const incTokens = tokenize(`${inc.title} ${inc.description}`);
      if (incTokens.size === 0) continue;

      let intersection = 0;
      for (const t of inputTokens) {
        if (incTokens.has(t)) intersection++;
      }
      const union = new Set([...inputTokens, ...incTokens]).size;
      const jaccard = union > 0 ? intersection / union : 0;

      if (jaccard > highestJaccard) {
        highestJaccard = jaccard;
        bestMatch = inc;
      }
    }

    if (bestMatch && bestMatch.resolutionSummary && highestJaccard >= 0.15) {
      return {
        suggestedResolution: bestMatch.resolutionSummary,
        confidence: Math.round(Math.min(0.92, 0.6 + highestJaccard * 0.3) * 100) / 100,
        similarIncidentId: bestMatch.id,
        keySteps: [
          `Reference historical incident ${bestMatch.id}: ${bestMatch.title}`,
          'Apply proven remediation sequence validated in historical resolution summary.',
          'Verify service recovery metrics and confirm error rate normalizes.',
        ],
        rationale: `Matched ${Math.round(highestJaccard * 100)}% token similarity with resolved incident ${bestMatch.id}.`,
      };
    }

    // Generic best-practice protocol if no historical matches
    return {
      suggestedResolution:
        '1. Inspect server and application runtime logs around failure timestamp.\n2. Verify upstream connectivity, database connection pool limits, and network routing.\n3. Recycle degraded worker process or rollback recent configuration delta.\n4. Perform smoke test on health probe endpoint.',
      confidence: 0.55,
      keySteps: [
        'Check logs and system health diagnostics.',
        'Isolate dependency failures (database, cache, upstream APIs).',
        'Restart or rollback suspect deployment.',
        'Validate health checks before marking resolved.',
      ],
      rationale: 'Standard ITIL incident remediation protocol (no matching past resolved incidents found).',
    };
  }
}

/**
 * Gemini-powered AI Provider using @google/genai SDK
 */
export class GeminiAIProvider implements AIProvider {
  public readonly name = 'GeminiAI';
  private client: GoogleGenAI;

  constructor(apiKey: string, private fallback: AIProvider) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async suggestCategory(
    description: string,
    availableCategories: Category[]
  ): Promise<CategorySuggestion> {
    try {
      const categoriesPrompt = availableCategories
        .map((c) => `- ID: ${c.id}, Name: ${c.name}, Description: ${c.description}, Keywords: ${(c.keywords || []).join(', ')}`)
        .join('\n');

      const prompt = `You are an expert IT Service Management (ITSM) classifier.
Given the following incident description:
"${description}"

And the available categories:
${categoriesPrompt}

Classify the incident into the single most appropriate category.
Return a valid JSON object matching this exact structure:
{
  "categoryId": "<matching ID>",
  "categoryName": "<matching Name>",
  "confidence": <number between 0.0 and 1.0>,
  "rationale": "<brief explanation>"
}`;

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API request timeout (3500ms)')), 3500)
      );

      const response = await Promise.race([
        this.client.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        }),
        timeoutPromise,
      ]);

      const text = response.text || '';
      const parsed = JSON.parse(text);
      if (parsed.categoryId && parsed.categoryName) {
        return {
          categoryId: parsed.categoryId,
          categoryName: parsed.categoryName,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
          rationale: parsed.rationale || 'Categorized by Gemini AI',
        };
      }
      return this.fallback.suggestCategory(description, availableCategories);
    } catch (err) {
      console.warn('[GeminiAIProvider] Error generating category suggestion, falling back to rule-based:', err);
      return this.fallback.suggestCategory(description, availableCategories);
    }
  }

  async suggestResolution(
    description: string,
    pastResolvedIncidents: Incident[]
  ): Promise<ResolutionSuggestion> {
    try {
      const historicalContext = pastResolvedIncidents
        .slice(0, 5)
        .map((i) => `[${i.id}] ${i.title}: ${i.description}\nResolution: ${i.resolutionSummary || 'None'}`)
        .join('\n---\n');

      const prompt = `You are a principal IT site reliability engineer assisting with incident resolution.
Given this active incident description:
"${description}"

And historical resolved incidents for context:
${historicalContext || 'No past resolved incidents available.'}

Recommend a concrete, actionable resolution plan.
Return a valid JSON object matching this exact structure:
{
  "suggestedResolution": "<concise remediation summary>",
  "confidence": <number between 0.0 and 1.0>,
  "keySteps": ["<step 1>", "<step 2>", "<step 3>"],
  "rationale": "<brief rationale>"
}`;

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API request timeout (3500ms)')), 3500)
      );

      const response = await Promise.race([
        this.client.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        }),
        timeoutPromise,
      ]);

      const text = response.text || '';
      const parsed = JSON.parse(text);
      if (parsed.suggestedResolution) {
        return {
          suggestedResolution: parsed.suggestedResolution,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
          keySteps: Array.isArray(parsed.keySteps) ? parsed.keySteps : [],
          rationale: parsed.rationale || 'Generated by Gemini AI',
        };
      }
      return this.fallback.suggestResolution(description, pastResolvedIncidents);
    } catch (err) {
      console.warn('[GeminiAIProvider] Error generating resolution suggestion, falling back to rule-based:', err);
      return this.fallback.suggestResolution(description, pastResolvedIncidents);
    }
  }
}

/**
 * Service orchestrator that selects the active AI Provider
 */
export class AIService {
  private provider: AIProvider;
  private fallbackProvider: AIProvider;

  constructor() {
    this.fallbackProvider = new RuleBasedAIProvider();
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim().length > 0) {
      this.provider = new GeminiAIProvider(apiKey, this.fallbackProvider);
    } else {
      this.provider = this.fallbackProvider;
    }
  }

  public getActiveProviderName(): string {
    return this.provider.name;
  }

  public setProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  public resetToDefault(): void {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim().length > 0) {
      this.provider = new GeminiAIProvider(apiKey, this.fallbackProvider);
    } else {
      this.provider = this.fallbackProvider;
    }
  }

  async suggestCategory(
    description: string,
    availableCategories: Category[]
  ): Promise<CategorySuggestion> {
    try {
      return await this.provider.suggestCategory(description, availableCategories);
    } catch {
      return await this.fallbackProvider.suggestCategory(description, availableCategories);
    }
  }

  async suggestResolution(
    description: string,
    pastResolvedIncidents: Incident[]
  ): Promise<ResolutionSuggestion> {
    try {
      return await this.provider.suggestResolution(description, pastResolvedIncidents);
    } catch {
      return await this.fallbackProvider.suggestResolution(description, pastResolvedIncidents);
    }
  }
}

export const aiService = new AIService();
