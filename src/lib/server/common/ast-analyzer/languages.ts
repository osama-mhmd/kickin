import type Parser from 'tree-sitter';
import { AstLanguageError } from './errors';

export interface AstLanguageDefinition {
	readonly id: string;
	readonly name: string;
	readonly extensions: readonly string[];
	readonly filenames?: readonly string[];
	load(): Promise<Parser.Language>;
}

export interface AstLanguageInfo {
	id: string;
	name: string;
	extensions: string[];
	filenames: string[];
}

type LanguageModule<T> = { default: T };

async function loadDefault(specifier: () => Promise<unknown>): Promise<Parser.Language> {
	const module = (await specifier()) as LanguageModule<Parser.Language>;

	return module.default;
}

const definitions: AstLanguageDefinition[] = [
	{
		id: 'javascript',
		name: 'JavaScript',
		extensions: ['.js', '.jsx', '.mjs', '.cjs'],
		load: () => loadDefault(() => import('tree-sitter-javascript'))
	},
	{
		id: 'typescript',
		name: 'TypeScript',
		extensions: ['.ts', '.mts', '.cts'],
		load: async () => {
			const module = (await import('tree-sitter-typescript')) as LanguageModule<{
				typescript: Parser.Language;
			}>;

			return module.default.typescript;
		}
	},
	{
		id: 'tsx',
		name: 'TSX',
		extensions: ['.tsx'],
		load: async () => {
			const module = (await import('tree-sitter-typescript')) as LanguageModule<{
				tsx: Parser.Language;
			}>;

			return module.default.tsx;
		}
	},
	{
		id: 'python',
		name: 'Python',
		extensions: ['.py', '.pyi', '.pyw'],
		load: () => loadDefault(() => import('tree-sitter-python'))
	},
	{
		id: 'json',
		name: 'JSON',
		extensions: ['.json', '.jsonc'],
		load: () => loadDefault(() => import('tree-sitter-json'))
	},
	{
		id: 'css',
		name: 'CSS',
		extensions: ['.css'],
		load: () => loadDefault(() => import('tree-sitter-css'))
	},
	{
		id: 'html',
		name: 'HTML',
		extensions: ['.html', '.htm', '.xhtml'],
		load: () => loadDefault(() => import('tree-sitter-html'))
	},
	{
		id: 'go',
		name: 'Go',
		extensions: ['.go'],
		load: () => loadDefault(() => import('tree-sitter-go'))
	},
	{
		id: 'rust',
		name: 'Rust',
		extensions: ['.rs'],
		load: () => loadDefault(() => import('tree-sitter-rust'))
	},
	{
		id: 'java',
		name: 'Java',
		extensions: ['.java'],
		load: () => loadDefault(() => import('tree-sitter-java'))
	},
	{
		id: 'c',
		name: 'C',
		extensions: ['.c', '.h'],
		load: () => loadDefault(() => import('tree-sitter-c'))
	},
	{
		id: 'cpp',
		name: 'C++',
		extensions: ['.cc', '.cpp', '.cxx', '.c++', '.hh', '.hpp', '.hxx', '.h++'],
		load: () => loadDefault(() => import('tree-sitter-cpp'))
	},
	{
		id: 'csharp',
		name: 'C#',
		extensions: ['.cs'],
		load: () => loadDefault(() => import('tree-sitter-c-sharp'))
	},
	{
		id: 'bash',
		name: 'Bash',
		extensions: ['.sh', '.bash', '.zsh', '.ksh'],
		filenames: ['.bashrc', '.bash_profile', '.profile', '.zshrc', 'PKGBUILD'],
		load: () => loadDefault(() => import('tree-sitter-bash'))
	},
	{
		id: 'ruby',
		name: 'Ruby',
		extensions: ['.rb', '.rake', '.gemspec'],
		filenames: ['Gemfile', 'Rakefile', 'Vagrantfile', 'Brewfile', 'Capfile', 'Guardfile'],
		load: () => loadDefault(() => import('tree-sitter-ruby'))
	},
	{
		id: 'php',
		name: 'PHP',
		extensions: ['.php'],
		load: async () => {
			const module = (await import('tree-sitter-php')) as LanguageModule<{
				php: Parser.Language;
			}>;

			return module.default.php;
		}
	},
	{
		id: 'kotlin',
		name: 'Kotlin',
		extensions: ['.kt', '.kts'],
		load: () => loadDefault(() => import('@tree-sitter-grammars/tree-sitter-kotlin'))
	},
	{
		id: 'lua',
		name: 'Lua',
		extensions: ['.lua'],
		load: () => loadDefault(() => import('@tree-sitter-grammars/tree-sitter-lua'))
	},
	{
		id: 'yaml',
		name: 'YAML',
		extensions: ['.yml', '.yaml'],
		load: () => loadDefault(() => import('@tree-sitter-grammars/tree-sitter-yaml'))
	},
	{
		id: 'markdown',
		name: 'Markdown',
		extensions: ['.md', '.markdown'],
		load: () => loadDefault(() => import('@tree-sitter-grammars/tree-sitter-markdown'))
	},
	{
		id: 'scala',
		name: 'Scala',
		extensions: ['.scala', '.sc'],
		load: () => loadDefault(() => import('tree-sitter-scala'))
	},
	{
		id: 'swift',
		name: 'Swift',
		extensions: ['.swift'],
		load: () => loadDefault(() => import('tree-sitter-swift'))
	}
];

const byId = new Map<string, AstLanguageDefinition>();
const byExtension = new Map<string, AstLanguageDefinition>();
const byFilename = new Map<string, AstLanguageDefinition>();
const grammarCache = new Map<string, Promise<Parser.Language>>();

for (const definition of definitions) {
	byId.set(definition.id, definition);

	for (const extension of definition.extensions) {
		byExtension.set(extension, definition);
	}

	for (const filename of definition.filenames ?? []) {
		byFilename.set(filename, definition);
	}
}

const shebangPatterns: ReadonlyArray<readonly [RegExp, string]> = [
	[/\b(?:node|nodejs|deno|bun)\b/, 'javascript'],
	[/\bpython[0-9.]*\b/, 'python'],
	[/\b(?:ruby|jruby)\b/, 'ruby'],
	[/\bphp\b/, 'php'],
	[/\b(?:bash|sh|zsh|ksh|dash)\b/, 'bash']
];

export function getLanguageDefinition(id: string): AstLanguageDefinition | undefined {
	return byId.get(id);
}

export function listLanguages(): AstLanguageInfo[] {
	return definitions.map((definition) => ({
		id: definition.id,
		name: definition.name,
		extensions: [...definition.extensions],
		filenames: [...(definition.filenames ?? [])]
	}));
}

export function detectLanguage(path: string, content?: string): AstLanguageDefinition | undefined {
	const normalized = path.replace(/\\/g, '/');
	const filename = normalized.slice(normalized.lastIndexOf('/') + 1);
	const byName = byFilename.get(filename);

	if (byName) return byName;

	const dot = filename.lastIndexOf('.');

	if (dot > 0) {
		const extension = filename.slice(dot).toLowerCase();
		const byExt = byExtension.get(extension);

		if (byExt) return byExt;
	}

	if (content && isProbablyScript(filename)) {
		const firstLine = firstNonEmptyLine(content);

		for (const [pattern, id] of shebangPatterns) {
			if (pattern.test(firstLine)) {
				return byId.get(id);
			}
		}
	}

	return undefined;
}

export function loadLanguage(definition: AstLanguageDefinition): Promise<Parser.Language> {
	let cached = grammarCache.get(definition.id);

	if (!cached) {
		cached = definition.load().catch((cause: unknown) => {
			grammarCache.delete(definition.id);

			throw cause instanceof AstLanguageError
				? cause
				: new AstLanguageError(`Failed to load the ${definition.name} grammar.`, {
						details: { language: definition.id },
						cause
					});
		});
		grammarCache.set(definition.id, cached);
	}

	return cached;
}

export function clearLanguageCache(): void {
	grammarCache.clear();
}

function isProbablyScript(filename: string): boolean {
	return !filename.includes('.') || filename.endsWith('.sh') || filename.endsWith('.bash');
}

function firstNonEmptyLine(content: string): string {
	for (const line of content.split('\n', 10)) {
		const trimmed = line.trim();

		if (trimmed.length > 0) return trimmed;
	}

	return '';
}
