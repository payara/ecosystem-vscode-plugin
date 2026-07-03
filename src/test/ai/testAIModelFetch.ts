'use strict';

/**
 * Standalone test for AIModelFetcher logic (local providers only — cloud providers use static lists).
 * Run: npx ts-node --project tsconfig.json src/test/ai/testAIModelFetch.ts <PROVIDER> [LOCATION]
 *
 * Examples (local providers):
 *   npx ts-node --project tsconfig.json src/test/ai/testAIModelFetch.ts OLLAMA http://localhost:11434
 *   npx ts-node --project tsconfig.json src/test/ai/testAIModelFetch.ts LM_STUDIO http://localhost:1234
 *   npx ts-node --project tsconfig.json src/test/ai/testAIModelFetch.ts CUSTOM_OPEN_AI http://localhost:8080
 *
 * Cloud providers (OPEN_AI, ANTHROPIC, GOOGLE, GROQ, MISTRAL, DEEPSEEK, DEEPINFRA)
 * use a static curated model list — no network call needed.
 */

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

const CLOUD_MODELS: Record<string, string[]> = {
    OPEN_AI: [
        'o3', 'o3-mini', 'o4-mini', 'o1', 'o1-mini',
        'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo',
    ],
    ANTHROPIC: [
        'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5',
        'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307',
    ],
    GOOGLE: [
        'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-exp',
        'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro',
    ],
    GROQ: [
        'llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant',
        'llama3-70b-8192', 'llama3-8b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it',
    ],
    MISTRAL: [
        'mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest',
        'codestral-latest', 'open-mixtral-8x22b', 'open-mixtral-8x7b', 'open-mistral-7b',
    ],
    DEEPSEEK: [
        'deepseek-chat', 'deepseek-coder', 'deepseek-reasoner',
    ],
    DEEPINFRA: [
        'meta-llama/Meta-Llama-3.1-70B-Instruct', 'meta-llama/Meta-Llama-3.1-8B-Instruct',
        'mistralai/Mistral-7B-Instruct-v0.3', 'microsoft/WizardLM-2-8x22B',
        'Qwen/Qwen2-72B-Instruct',
    ],
};

const LOCAL_PROVIDERS = new Set(['OLLAMA', 'LM_STUDIO', 'GPT4ALL']);

function fetchJson(options: ReturnType<typeof buildLocalRequestOptions>): Promise<string> {
    return new Promise((resolve, reject) => {
        const requester = options.protocol === 'https:' ? https : http;
        const req = requester.request(
            { hostname: options.hostname, port: options.port, path: options.path, method: options.method, headers: options.headers, timeout: 15000 },
            (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        let detail = '';
                        try { detail = JSON.parse(data)?.error?.message || data.slice(0, 300); } catch { detail = data.slice(0, 300); }
                        reject(new Error(`HTTP ${res.statusCode}: ${detail}`));
                    }
                });
            }
        );
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        req.on('error', (err) => reject(err));
        req.end();
    });
}

function buildLocalRequestOptions(provider: string, providerLocation: string) {
    let baseUrl: string;
    let path: string;
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    switch (provider) {
        case 'OLLAMA':    baseUrl = providerLocation || 'http://localhost:11434'; path = '/api/tags'; break;
        case 'LM_STUDIO': baseUrl = providerLocation || 'http://localhost:1234';  path = '/v1/models'; break;
        default:          baseUrl = providerLocation || 'http://localhost:4891';  path = '/v1/models'; break;
    }
    const parsed = new URL(baseUrl);
    const protocol = parsed.protocol;
    const hostname = parsed.hostname;
    const port = parsed.port ? parseInt(parsed.port, 10) : protocol === 'https:' ? 443 : 80;
    const basePath = parsed.pathname.replace(/\/$/, '');
    return { hostname, port, path: basePath + path, method: 'GET', headers, protocol };
}

function parseLocalModelIds(provider: string, body: string): string[] {
    const json = JSON.parse(body);
    if (provider === 'OLLAMA') {
        return (json.models as Array<{ name: string }> || []).map(m => m.name).filter(Boolean);
    }
    return (json.data as Array<{ id: string }> || []).map(m => m.id).filter(Boolean);
}

async function main() {
    const [, , provider = 'OPEN_AI', providerLocation = ''] = process.argv;

    if (CLOUD_MODELS[provider]) {
        const models = [...CLOUD_MODELS[provider]].sort((a, b) => a.localeCompare(b));
        console.log(`Provider : ${provider} (static list)`);
        console.log(`\n✓ ${models.length} models:\n`);
        models.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
        return;
    }

    if (!LOCAL_PROVIDERS.has(provider) && provider !== 'CUSTOM_OPEN_AI') {
        console.error(`Unknown provider: ${provider}`);
        process.exit(1);
    }

    const options = buildLocalRequestOptions(provider, providerLocation);
    console.log(`Provider : ${provider}`);
    console.log(`Endpoint : ${options.protocol}//${options.hostname}:${options.port}${options.path}`);
    console.log('Fetching...\n');

    try {
        const body = await fetchJson(options);
        const models = parseLocalModelIds(provider, body);
        models.sort((a, b) => a.localeCompare(b));
        console.log(`✓ ${models.length} models returned:\n`);
        models.slice(0, 20).forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
        if (models.length > 20) { console.log(`  ... and ${models.length - 20} more`); }
    } catch (err) {
        console.error(`✗ Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
    }
}

main();
