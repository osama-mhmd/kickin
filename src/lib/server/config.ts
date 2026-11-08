function loadLocalEnvFile(): void {
	try {
		process.loadEnvFile();
	} catch {
		return;
	}
}

loadLocalEnvFile();

function readOptional(name: string): string | undefined {
	const value = process.env[name];

	if (value === undefined) return undefined;

	const trimmed = value.trim();

	return trimmed.length > 0 ? trimmed : undefined;
}

export const config = {
	get githubToken(): string | undefined {
		return readOptional('GITHUB_TOKEN');
	},
	get databaseUrl(): string | undefined {
		return readOptional('DATABASE_URL');
	},
	get upstashRedisUrl(): string | undefined {
		return readOptional('UPSTASH_REDIS_URL');
	},
	get openrouterApiKey(): string | undefined {
		return readOptional('OPENROUTER_API_KEY');
	},
	get geminiApiKey(): string | undefined {
		return readOptional('GEMINI_API_KEY');
	},
	get groqApiKey(): string | undefined {
		return readOptional('GROQ_API_KEY');
	},
	/** JSON array of `{ provider, model, rpm?, maxTokens?, timeoutMs? }` entries. */
	get aiFallbackChain(): string | undefined {
		return readOptional('AI_FALLBACK_CHAIN');
	}
};
