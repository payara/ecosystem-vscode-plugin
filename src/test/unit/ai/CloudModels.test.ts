/*
 * Copyright (c) 2026 Payara Foundation and/or its affiliates and others.
 * All rights reserved.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0, which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 */

'use strict';

import * as assert from 'assert';
import { CLOUD_MODELS } from '../../../main/fish/payara/ai/AIModelFetcher';

const EXPECTED_PROVIDERS = ['OPEN_AI', 'ANTHROPIC', 'GOOGLE', 'GROQ', 'MISTRAL', 'DEEPSEEK', 'DEEPINFRA'];

describe('CLOUD_MODELS — coverage', () => {

    it('defines an entry for every expected cloud provider', () => {
        for (const p of EXPECTED_PROVIDERS) {
            assert.ok(p in CLOUD_MODELS, `Missing provider: ${p}`);
        }
    });

    it('every provider has at least one model', () => {
        for (const [provider, models] of Object.entries(CLOUD_MODELS)) {
            assert.ok(models.length > 0, `${provider} has no models`);
        }
    });

    it('no model ID is an empty string or only whitespace', () => {
        for (const [provider, models] of Object.entries(CLOUD_MODELS)) {
            for (const id of models) {
                assert.ok(id.trim().length > 0, `${provider} contains blank model ID`);
            }
        }
    });

    it('no duplicate model IDs within a provider', () => {
        for (const [provider, models] of Object.entries(CLOUD_MODELS)) {
            const set = new Set(models);
            assert.strictEqual(set.size, models.length, `${provider} has duplicate model IDs`);
        }
    });

});

describe('CLOUD_MODELS — OPEN_AI', () => {

    it('includes gpt-4o and gpt-4o-mini', () => {
        assert.ok(CLOUD_MODELS.OPEN_AI.includes('gpt-4o'));
        assert.ok(CLOUD_MODELS.OPEN_AI.includes('gpt-4o-mini'));
    });

    it('model IDs do not contain the "openai/" prefix (already stripped)', () => {
        for (const id of CLOUD_MODELS.OPEN_AI) {
            assert.ok(!id.startsWith('openai/'), `ID should not have openai/ prefix: ${id}`);
        }
    });

});

describe('CLOUD_MODELS — ANTHROPIC', () => {

    it('includes at least one claude-3 and one claude-sonnet-4 model', () => {
        const hasClaude3 = CLOUD_MODELS.ANTHROPIC.some(m => m.startsWith('claude-3'));
        const hasClaude4 = CLOUD_MODELS.ANTHROPIC.some(m => m.includes('claude-sonnet-4') || m.includes('claude-opus-4') || m.includes('claude-haiku-4'));
        assert.ok(hasClaude3, 'Expected at least one claude-3 model');
        assert.ok(hasClaude4, 'Expected at least one claude-4-series model');
    });

    it('model IDs do not contain the "anthropic/" prefix', () => {
        for (const id of CLOUD_MODELS.ANTHROPIC) {
            assert.ok(!id.startsWith('anthropic/'), `ID should not have anthropic/ prefix: ${id}`);
        }
    });

});

describe('CLOUD_MODELS — GOOGLE', () => {

    it('includes at least one gemini model', () => {
        assert.ok(CLOUD_MODELS.GOOGLE.some(m => m.startsWith('gemini-')));
    });

});

describe('CLOUD_MODELS — GROQ', () => {

    it('includes llama and mixtral models', () => {
        const hasLlama   = CLOUD_MODELS.GROQ.some(m => m.includes('llama'));
        const hasMixtral = CLOUD_MODELS.GROQ.some(m => m.includes('mixtral'));
        assert.ok(hasLlama,   'Expected a llama model');
        assert.ok(hasMixtral, 'Expected a mixtral model');
    });

});

describe('CLOUD_MODELS — MISTRAL', () => {

    it('includes mistral-large-latest', () => {
        assert.ok(CLOUD_MODELS.MISTRAL.includes('mistral-large-latest'));
    });

});

describe('CLOUD_MODELS — DEEPSEEK', () => {

    it('includes deepseek-chat', () => {
        assert.ok(CLOUD_MODELS.DEEPSEEK.includes('deepseek-chat'));
    });

});
