/*
 * Copyright (c) 2026 Payara Foundation and/or its affiliates and others.
 * All rights reserved.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0, which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the
 * Eclipse Public License v. 2.0 are satisfied: GNU General Public License,
 * version 2 with the GNU Classpath Exception, which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 */

'use strict';

import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

interface RequestOptions {
    hostname: string;
    port: number;
    path: string;
    method: string;
    headers: Record<string, string>;
    protocol: string;
}

// Curated model lists for cloud providers — no network call or API key required.
export const CLOUD_MODELS: Record<string, string[]> = {
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

function fetchJson(options: RequestOptions): Promise<string> {
    return new Promise((resolve, reject) => {
        const requester = options.protocol === 'https:' ? https : http;
        const req = requester.request(
            {
                hostname: options.hostname,
                port: options.port,
                path: options.path,
                method: options.method,
                headers: options.headers,
                timeout: 15000
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        let detail = '';
                        try { detail = JSON.parse(data)?.error?.message || data.slice(0, 200); } catch { detail = data.slice(0, 200); }
                        reject(new Error(`HTTP ${res.statusCode}${detail ? ': ' + detail : ''}`));
                    }
                });
            }
        );
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        req.on('error', (err) => reject(err));
        req.end();
    });
}

function buildLocalRequestOptions(provider: string, providerLocation: string): RequestOptions {
    let baseUrl: string;
    let path: string;
    const headers: Record<string, string> = { 'Accept': 'application/json' };

    switch (provider) {
        case 'OLLAMA':
            baseUrl = providerLocation || 'http://localhost:11434';
            path = '/api/tags'; break;
        case 'LM_STUDIO':
            baseUrl = providerLocation || 'http://localhost:1234';
            path = '/v1/models'; break;
        default: // GPT4ALL
            baseUrl = providerLocation || 'http://localhost:4891';
            path = '/v1/models'; break;
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
        const models: Array<{ name: string }> = json.models || [];
        return models.map((m) => m.name).filter(Boolean);
    }
    const data: Array<{ id: string }> = json.data || [];
    return data.map((m) => m.id).filter(Boolean);
}

export async function selectAIModel(): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const provider: string = config.get<string>('payara.ai.provider') || 'OPEN_AI';
    const providerLocation: string = config.get<string>('payara.ai.providerLocation') || '';

    const qp = vscode.window.createQuickPick();
    qp.placeholder = `Select model for ${provider} (or type a custom name and press Enter)`;
    qp.busy = true;
    qp.ignoreFocusOut = true;
    qp.show();

    let fetchError: string | undefined;
    try {
        let modelIds: string[];

        if (LOCAL_PROVIDERS.has(provider)) {
            const opts = buildLocalRequestOptions(provider, providerLocation);
            const body = await fetchJson(opts);
            modelIds = parseLocalModelIds(provider, body);
        } else if (provider === 'CUSTOM_OPEN_AI') {
            const parsed = new URL(providerLocation);
            const protocol = parsed.protocol;
            const hostname = parsed.hostname;
            const port = parsed.port ? parseInt(parsed.port, 10) : protocol === 'https:' ? 443 : 80;
            const basePath = parsed.pathname.replace(/\/$/, '');
            const opts: RequestOptions = { hostname, port, path: basePath + '/v1/models', method: 'GET', headers: { 'Accept': 'application/json' }, protocol };
            const body = await fetchJson(opts);
            const json = JSON.parse(body);
            modelIds = (json.data as Array<{ id: string }> || []).map((m) => m.id).filter(Boolean);
        } else {
            // Cloud providers: use curated static list — no network call needed.
            modelIds = CLOUD_MODELS[provider] || [];
        }

        modelIds.sort((a, b) => a.localeCompare(b));
        qp.items = modelIds.map(id => ({ label: id }));
    } catch (err: unknown) {
        fetchError = err instanceof Error ? err.message : String(err);
    }
    qp.busy = false;

    if (fetchError) {
        qp.hide();
        qp.dispose();
        vscode.window.showErrorMessage(`Failed to fetch ${provider} models: ${fetchError}`);
        return;
    }

    if (qp.items.length === 0) {
        qp.hide();
        qp.dispose();
        vscode.window.showErrorMessage(`No models found for ${provider}.`);
        return;
    }

    await new Promise<void>((resolve) => {
        qp.onDidAccept(() => {
            const modelName = qp.selectedItems[0]?.label || qp.value;
            if (modelName) {
                const target = vscode.workspace.workspaceFolders
                    ? vscode.ConfigurationTarget.Workspace
                    : vscode.ConfigurationTarget.Global;
                vscode.workspace.getConfiguration().update('payara.ai.model', modelName, target);
                vscode.window.showInformationMessage(`AI model set to: ${modelName}`);
            }
            qp.hide();
            resolve();
        });
        qp.onDidHide(() => resolve());
    });
    qp.dispose();
}
