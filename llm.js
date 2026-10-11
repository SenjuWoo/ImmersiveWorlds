// Background LLM calls shared by Immersive Worlds and Immersive Adventures (kept identical in both).
// Route: a chosen Connection Profile, else the active Chat Completion connection, else generateRaw.
// Never mutates the user's global API settings, so a reply generated meanwhile is unaffected.

const TIMEOUT_MS = 120000;

function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Connection profiles usable for background calls, or [] when Connection Manager is off. */
export function listProfiles() {
    try {
        return SillyTavern.getContext().ConnectionManagerRequestService.getSupportedProfiles();
    } catch {
        return [];
    }
}

/**
 * @param {object} o
 * @param {string} o.system
 * @param {string} o.prompt
 * @param {number} o.maxTokens
 * @param {string} [o.profileId] Connection Manager profile id; '' = current connection
 * @param {number} [o.temperature]
 * @param {boolean} [o.noReasoning] ask reasoning models to skip thinking (state calls need none)
 * @returns {Promise<string>}
 */
export async function backgroundGenerate({ system, prompt, maxTokens, profileId = '', temperature = 0.4, noReasoning = true }) {
    const ctx = SillyTavern.getContext();
    const messages = [{ role: 'system', content: system }, { role: 'user', content: prompt }];
    const signal = AbortSignal.timeout(TIMEOUT_MS);

    if (profileId) {
        const profile = listProfiles().find(p => p.id === profileId);
        if (!profile) throw new Error('The selected connection profile is missing or unsupported. Pick another in the extension settings.');
        const source = ctx.CONNECT_API_MAP?.[profile.api]?.source;
        const override = { temperature };
        if (noReasoning && source === 'openrouter') Object.assign(override, { reasoning_effort: 'none', include_reasoning: false });
        const res = await ctx.ConnectionManagerRequestService.sendRequest(profileId, messages, maxTokens, { stream: false, signal, extractData: true, includePreset: true, includeInstruct: true }, override);
        return String(res?.content ?? '');
    }

    if (ctx.mainApi === 'openai' && ctx.ChatCompletionService?.presetToGeneratePayload) {
        // A cloned settings object with overrides: ST maps reasoning_effort per provider (none/low/minimal).
        const preset = { temperature, ...(noReasoning ? { reasoning_effort: 'min', show_thoughts: false } : {}) };
        const payload = await ctx.ChatCompletionService.presetToGeneratePayload(preset, {}, { messages, max_tokens: maxTokens, model: ctx.getChatCompletionModel(), stream: false });
        const res = await ctx.ChatCompletionService.sendRequest(payload, true, signal);
        return String(res?.content ?? '');
    }

    return String(await withTimeout(ctx.generateRaw({ prompt, systemPrompt: system, responseLength: maxTokens, trimNames: false }), TIMEOUT_MS, 'Background request') ?? '');
}

/** First JSON object in a model reply. Tolerates fences, prose around it, and BOMs. */
export function parseJson(value) {
    if (value && typeof value === 'object') return value;
    let text = String(value ?? '').replace(/^﻿/, '').trim();
    if (!text) throw new Error('The model returned an empty reply. Reasoning models: keep "skip reasoning" on or raise the token budget.');
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    try { return JSON.parse(text); } catch { /* fall through to the outermost braces */ }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error(`No JSON object in the reply${text.length > 200 ? ' (it may have been cut off: raise the token budget)' : ''}.`);
    try {
        return JSON.parse(text.slice(start, end + 1));
    } catch (error) {
        throw new Error(`Invalid JSON from the model: ${String(error.message).slice(0, 120)}`);
    }
}

export function errorText(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    const cause = error.cause ? ` (${errorText(error.cause)})` : '';
    if (error instanceof Error) return `${error.message || error.name}${cause}`;
    try { return JSON.stringify(error); } catch { return String(error); }
}

/** 400-class rejections: the request itself is unacceptable to this API, retrying will not help. */
export const isRejection = error => /\b400\b|bad request|unsupported|response[_ -]?format|json[_ -]?schema|not supported/i.test(errorText(error));
