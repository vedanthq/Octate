import process from 'node:process';
import { AuthenticationError, ValidationError } from '../../errors/index.js';
import { serializePromptContext } from '../../intelligence/context/serializer.js';
import { createLogger } from '../../logging/index.js';
import { loadPromptTemplate } from '../prompts/loader.js';
import { renderTemplate } from '../prompts/template.js';
import { safeJsonParse } from '../schema/extractor.js';
import { validateModelResponse } from '../schema/finding.js';
import { groundFindings } from '../schema/grounding.js';
import { formatZodIssuesForRepairPrompt } from '../schema/repair.js';
import type {
  ModelFinding,
  ModelRequest,
  ModelResponse,
  ModelUsage,
  ReviewModel,
} from '../types.js';
import { type ErrorWithHttpMetadata, ResilienceManager } from './resilience.js';

export interface LocalNvidiaProviderOptions {
  apiKey?: string | undefined;
  timeoutMs?: number | undefined;
  maxRetries?: number | undefined;
  concurrency?: number | undefined;
  modelId?: string | undefined;
  endpointUrl?: string | undefined;
  repoRoot?: string | undefined;
}

interface NvidiaChatChoice {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason?: string;
}

interface NvidiaChatCompletionResponse {
  id?: string;
  choices?: NvidiaChatChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
}

function determineRole(reviewTask?: string): string {
  if (!reviewTask) {
    return 'reviewer.structural.v1';
  }
  const lower = reviewTask.toLowerCase();
  if (lower.includes('security')) {
    return 'reviewer.security.v1';
  }
  if (lower.includes('semantic')) {
    return 'reviewer.semantic.v1';
  }
  if (lower.includes('critic')) {
    return 'critic.v1';
  }
  if (lower.includes('structural')) {
    return 'reviewer.structural.v1';
  }
  return 'reviewer.structural.v1';
}

function mapFinishReason(reason?: string): 'stop' | 'length' | 'content_filter' | 'error' {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content_filter';
    default:
      return 'stop';
  }
}

/**
 * Concrete ReviewModel implementation connecting to NVIDIA's inference API.
 */
export class LocalNvidiaProvider implements ReviewModel {
  readonly modelId: string;
  readonly endpointUrl: string;
  readonly repoRoot: string;
  private options: LocalNvidiaProviderOptions;
  private resilienceManager: ResilienceManager;
  private logger = createLogger('model/nvidia');

  constructor(options: LocalNvidiaProviderOptions = {}) {
    this.options = options;
    this.modelId = options.modelId ?? 'nvidia/nemotron-3-ultra-550b-a55b';
    this.endpointUrl =
      options.endpointUrl ?? 'https://integrate.api.nvidia.com/v1/chat/completions';
    this.repoRoot = options.repoRoot ?? process.cwd();
    const envTimeout = process.env.OCTATE_TIMEOUT_MS
      ? Number.parseInt(process.env.OCTATE_TIMEOUT_MS, 10)
      : process.env.NVIDIA_TIMEOUT_MS
        ? Number.parseInt(process.env.NVIDIA_TIMEOUT_MS, 10)
        : undefined;

    this.resilienceManager = new ResilienceManager({
      maxRetries: options.maxRetries ?? 3,
      timeoutMs: options.timeoutMs ?? envTimeout ?? 120000,
      concurrency: options.concurrency ?? 2,
    });
  }

  /**
   * Generates findings using NVIDIA Nemotron 3 Ultra with resilience, retry, and schema repair.
   */
  async generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    const key = this.options.apiKey ?? process.env.NVIDIA_API_KEY;
    if (!key) {
      throw new AuthenticationError(
        'NVIDIA_API_KEY environment variable is not set. Export NVIDIA_API_KEY to enable AI code review.'
      );
    }

    const startTime = performance.now();
    const role = determineRole(request.reviewTask);
    const rawTemplate = await loadPromptTemplate(role);
    const systemPrompt = renderTemplate(rawTemplate, {
      projectRules: request.projectRules ?? [],
      taskDescription: request.reviewTask,
      outputSchema: request.outputSchema,
    });

    const { userPrompt } = serializePromptContext(request);

    const messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const accumulatedUsage: ModelUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };

    let repairAttempts = 0;
    const maxRepairTurns = 2;
    let validatedFindings: ModelFinding[] | null = null;
    let lastRawContent = '';
    let lastModelName = this.modelId;
    let finishReason: 'stop' | 'length' | 'content_filter' | 'error' = 'stop';

    while (repairAttempts <= maxRepairTurns) {
      const completion =
        await this.resilienceManager.executeWithRetry<NvidiaChatCompletionResponse>(
          async (reqSignal) => {
            const response = await fetch(this.endpointUrl, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              body: JSON.stringify({
                model: this.modelId,
                messages,
                temperature: 0.2,
                top_p: 0.7,
                max_tokens: 4096,
                response_format: { type: 'json_object' },
              }),
              signal: reqSignal,
            });

            if (!response.ok) {
              const errorBody = await response.text().catch(() => '');
              const safeBody =
                errorBody.length > 200 ? `${errorBody.slice(0, 200)}...` : errorBody;
              const err: ErrorWithHttpMetadata = new Error(
                `NVIDIA API request failed with status ${response.status}: ${safeBody}`
              );
              err.status = response.status;
              err.headers = response.headers;
              throw err;
            }

            return (await response.json()) as NvidiaChatCompletionResponse;
          },
          signal
        );

      if (completion.usage) {
        accumulatedUsage.promptTokens += completion.usage.prompt_tokens ?? 0;
        accumulatedUsage.completionTokens += completion.usage.completion_tokens ?? 0;
        accumulatedUsage.totalTokens += completion.usage.total_tokens ?? 0;
      }

      if (completion.model) {
        lastModelName = completion.model;
      }

      const choice = completion.choices?.[0];
      lastRawContent = choice?.message?.content ?? '';
      finishReason = mapFinishReason(choice?.finish_reason);

      const parsed = safeJsonParse(lastRawContent);
      if (parsed.success) {
        const validated = validateModelResponse(parsed.data);
        if (validated.success) {
          validatedFindings = validated.data.findings;
          break;
        }

        if (repairAttempts >= maxRepairTurns) {
          throw new ValidationError(
            `Model output failed schema validation after ${repairAttempts} repair attempts: ${validated.error.message}`,
            { issues: validated.error.issues, rawResponse: lastRawContent }
          );
        }

        repairAttempts++;
        const repairPrompt = formatZodIssuesForRepairPrompt(validated.error);
        messages.push({ role: 'assistant', content: lastRawContent });
        messages.push({ role: 'user', content: repairPrompt });
      } else {
        if (repairAttempts >= maxRepairTurns) {
          throw new ValidationError(
            `Model output is not valid JSON after ${repairAttempts} repair attempts: ${parsed.error.message}`,
            { rawResponse: lastRawContent }
          );
        }

        repairAttempts++;
        const repairPrompt = `Your previous response was not valid JSON (${parsed.error.message}). Please return ONLY valid JSON matching the schema.`;
        messages.push({ role: 'assistant', content: lastRawContent });
        messages.push({ role: 'user', content: repairPrompt });
      }
    }

    const groundedFindings = await groundFindings(validatedFindings ?? [], {
      repoRoot: this.repoRoot,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    this.logger.debug(
      {
        model: lastModelName,
        latencyMs,
        usage: accumulatedUsage,
        findingCount: groundedFindings.length,
        repairAttempts,
      },
      'NVIDIA completion finished'
    );

    return {
      findings: groundedFindings,
      usage: accumulatedUsage,
      model: lastModelName,
      latencyMs,
      rawResponse: lastRawContent,
      finishReason,
    };
  }
}
