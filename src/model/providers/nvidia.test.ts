import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthenticationError, ValidationError } from '../../errors/index.js';
import type { ModelRequest } from '../types.js';
import { LocalNvidiaProvider } from './nvidia.js';

function createMockResponse(
  body: Record<string, unknown> | string,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  const isString = typeof body === 'string';
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    } as unknown as Headers,
    json: async () => (isString ? JSON.parse(body) : body),
    text: async () => (isString ? body : JSON.stringify(body)),
  } as unknown as Response;
}

describe('LocalNvidiaProvider', () => {
  const originalEnv = process.env;
  let fetchSpy: jest.SpiedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    process.env = { ...originalEnv };
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    process.env = originalEnv;
    fetchSpy.mockRestore();
  });

  const dummyRequest: ModelRequest = {
    systemPolicy: 'Follow standards',
    reviewTask: 'Perform structural review',
    projectRules: ['No any types'],
    repoMetadata: {
      root: '/workspace',
      languages: { TypeScript: 100 },
      fileCount: 1,
      totalLines: 50,
    },
    diff: 'diff --git a/src/index.ts b/src/index.ts\n+const a = 1;',
    context: [],
    diagnostics: [],
    outputSchema: '{"findings": []}',
  };

  it('throws AuthenticationError when NVIDIA_API_KEY is not set', async () => {
    delete process.env.NVIDIA_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.Gemini_API_Key;
    delete process.env.gemini_api_key;
    const provider = new LocalNvidiaProvider();
    await expect(provider.generate(dummyRequest)).rejects.toThrow(AuthenticationError);
  });

  it('successfully generates findings on 200 OK response', async () => {
    process.env.NVIDIA_API_KEY = 'nvapi-test-key';

    const mockFindingsPayload = {
      findings: [
        {
          severity: 'high',
          category: 'correctness',
          title: 'Unchecked return value',
          message: 'The return value is ignored',
          file: 'src/index.ts',
          startLine: 1,
          endLine: 2,
          confidence: 0.9,
          evidence: [],
          relatedFiles: [],
          relatedSymbols: [],
          impact: 'Silent failures',
          suggestedFix: 'Check result',
          reviewer: 'structural',
        },
      ],
    };

    fetchSpy.mockResolvedValueOnce(
      createMockResponse({
        id: 'chat-123',
        model: 'nvidia/nemotron-3-ultra-550b-a55b',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify(mockFindingsPayload),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 120,
          completion_tokens: 45,
          total_tokens: 165,
        },
      })
    );

    const provider = new LocalNvidiaProvider();
    const res = await provider.generate(dummyRequest);

    expect(res.findings.length).toBe(1);
    expect(res.findings[0]?.title).toBe('Unchecked return value');
    expect(res.usage.totalTokens).toBe(165);
    expect(res.finishReason).toBe('stop');

    // Verify Authorization header was sent
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0];
    const headers = callArgs?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer nvapi-test-key');
  });

  it('parses markdown-fenced JSON responses cleanly', async () => {
    process.env.NVIDIA_API_KEY = 'nvapi-test-key';

    const fenced = '```json\n{"findings": []}\n```';

    fetchSpy.mockResolvedValueOnce(
      createMockResponse({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: fenced,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      })
    );

    const provider = new LocalNvidiaProvider();
    const res = await provider.generate(dummyRequest);
    expect(res.findings).toEqual([]);
    expect(res.finishReason).toBe('stop');
  });

  it('recovers via repair loop when first attempt fails schema validation', async () => {
    process.env.NVIDIA_API_KEY = 'nvapi-test-key';

    // 1st response: Invalid schema (missing title and severity)
    fetchSpy.mockResolvedValueOnce(
      createMockResponse({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '{"findings": [{"file": "src/index.ts"}]}',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      })
    );

    // 2nd response: Repaired valid schema
    fetchSpy.mockResolvedValueOnce(
      createMockResponse({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: JSON.stringify({
                findings: [
                  {
                    severity: 'low',
                    category: 'maintainability',
                    title: 'Valid repaired title',
                    message: 'Proper message',
                    file: 'src/index.ts',
                    startLine: 1,
                    endLine: 2,
                    confidence: 0.8,
                  },
                ],
              }),
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      })
    );

    const provider = new LocalNvidiaProvider();
    const res = await provider.generate(dummyRequest);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(res.findings.length).toBe(1);
    expect(res.findings[0]?.title).toBe('Valid repaired title');
    expect(res.usage.totalTokens).toBe(45); // 15 + 30
  });

  it('retries on 429 rate limits and succeeds', async () => {
    process.env.NVIDIA_API_KEY = 'nvapi-test-key';

    // 1st call: 429
    fetchSpy.mockResolvedValueOnce(
      createMockResponse('Rate limit exceeded', 429, {
        'retry-after': '0',
      })
    );

    // 2nd call: 200
    fetchSpy.mockResolvedValueOnce(
      createMockResponse({
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '{"findings": []}',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      })
    );

    const provider = new LocalNvidiaProvider({ maxRetries: 2 });
    const res = await provider.generate(dummyRequest);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(res.findings).toEqual([]);
  });

  it('throws ValidationError if repair attempts are exhausted', async () => {
    process.env.NVIDIA_API_KEY = 'nvapi-test-key';

    // 3 consecutive invalid responses (attempt 0, repair 1, repair 2)
    for (let i = 0; i < 3; i++) {
      fetchSpy.mockResolvedValueOnce(
        createMockResponse({
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: '{"findings": [{"invalid": true}]}',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        })
      );
    }

    const provider = new LocalNvidiaProvider();
    await expect(provider.generate(dummyRequest)).rejects.toThrow(ValidationError);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
