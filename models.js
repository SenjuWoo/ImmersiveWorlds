// Model picker helpers shared by Immersive Worlds and Immersive Adventures (kept identical in both). No SillyTavern imports.

// Verified on OpenRouter 2026-10-13. Only ids present in the live list are offered first.
export const RECOMMENDED = ['deepseek/deepseek-v4.1-flash', 'deepseek/deepseek-v4-flash', 'anthropic/claude-haiku-5.5'];

// OpenRouter accepts reasoning.effort none|minimal|low|medium|high|xhigh|max and rejects "min".
// '' means: send no effort field at all (some models cannot switch reasoning off).
export const EFFORT_LADDER = Object.freeze(['none', 'minimal', '']);

const OPENROUTER_MODELS = 'https://openrouter.ai/api/v1/models';
const perM = v => { const n = Number(v) * 1e6; return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : 0; };

/** OpenRouter /models JSON -> [{id,name,ctx,inPerM,outPerM,reasoning}], bad rows skipped. */
export function parseModels(json) {
    const rows = Array.isArray(json?.data) ? json.data : [];
    return rows.filter(m => m && typeof m.id === 'string' && m.id).map(m => ({
        id: m.id,
        name: String(m.name || m.id),
        ctx: Number(m.context_length) || 0,
        inPerM: perM(m.pricing?.prompt),
        outPerM: perM(m.pricing?.completion),
        reasoning: Array.isArray(m.supported_parameters) && m.supported_parameters.includes('reasoning'),
    }));
}

/** Recommended models that exist first, then matches of `query` (id or name), cheapest output first. */
export function modelOptions(models, query = '', limit = 60) {
    const q = String(query).trim().toLowerCase();
    const hit = m => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
    const pinned = RECOMMENDED.map(id => models.find(m => m.id === id)).filter(m => m && hit(m));
    const rest = models.filter(m => hit(m) && !pinned.includes(m)).sort((a, b) => a.outPerM - b.outPerM || a.id.localeCompare(b.id));
    return [...pinned, ...rest].slice(0, Math.max(1, limit));
}

// SillyTavern hands the client only "Bad Request" / "Response not OK", never the provider's reasoning detail, so any
// plain rejection steps down; errors that name a key, model or quota are real and are not retried.
const rejected = e => /\b400\b|bad request|response not ok|invalid option|unsupported|not supported/i.test(String(e?.message ?? e));
const unrelated = e => /api key|unauthori[sz]ed|\b40[123]\b|model|not found|unknown|quota|credit|rate/i.test(String(e?.message ?? e));
const reasoningRejection = e => rejected(e) && !unrelated(e);

/** Try each effort in turn; a plain rejection moves to the next, anything else is thrown. */
export async function withLadder(send, ladder = EFFORT_LADDER) {
    let last;
    for (const effort of ladder) {
        try { return await send(effort); } catch (error) {
            if (!reasoningRejection(error)) throw error;
            last = error;
        }
    }
    throw last;
}

/** Missing or rejected key reads as a plain instruction instead of an HTTP code. */
export function friendlyOpenRouterError(error) {
    const text = String(error?.message ?? error);
    if (/\b40[13]\b|api key|unauthori[sz]ed|no auth|secret/i.test(text)) {
        return new Error('No usable OpenRouter API key in SillyTavern. Add it under API Connections → Chat Completion → OpenRouter, or choose another source.', { cause: error });
    }
    return /response not ok|bad request/i.test(text)
        ? new Error('OpenRouter did not accept the request: usually a missing or invalid API key, or a model id that does not exist. Check API Connections → Chat Completion → OpenRouter and the model id.', { cause: error })
        : error;
}

/** Public model list; no key and no user data are sent. */
export async function fetchModels(signal = AbortSignal.timeout(8000)) {
    const res = await fetch(OPENROUTER_MODELS, { headers: { Accept: 'application/json' }, signal });
    if (!res.ok) throw new Error(`OpenRouter model list: HTTP ${res.status}`);
    return parseModels(await res.json());
}

/** Settings written before the picker: a chosen profile keeps working. */
export const migrateModelMode = s => (['current', 'profile', 'model'].includes(s?.modelMode) ? s.modelMode : s?.profileId ? 'profile' : 'current');
