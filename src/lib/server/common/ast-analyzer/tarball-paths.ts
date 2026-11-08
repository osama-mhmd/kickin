const IGNORED_SEGMENTS = new Set([
	'node_modules',
	'.git',
	'.hg',
	'.svn',
	'dist',
	'build',
	'out',
	'coverage',
	'.next',
	'.nuxt',
	'.svelte-kit',
	'.output',
	'vendor',
	'Pods',
	'DerivedData',
	'__pycache__',
	'.venv',
	'venv',
	'.cache',
	'.idea',
	'.vscode',
	'bower_components',
	'jspm_packages',
	'.turbo',
	'.gradle',
	'.mvn',
	'target'
]);

const IGNORED_FILE_NAMES = new Set([
	'package-lock.json',
	'npm-shrinkwrap.json',
	'pnpm-lock.yaml',
	'yarn.lock',
	'bun.lockb',
	'Cargo.lock',
	'Gemfile.lock',
	'composer.lock',
	'poetry.lock',
	'Pipfile.lock',
	'go.sum'
]);

const IGNORED_FILE_PATTERNS = [
	/\.min\.(?:js|css)$/i,
	/\.map$/i,
	/\.snap$/i,
	/\.lock$/i,
	/-lock\.json$/i,
	/^\.DS_Store$/i
];

export function normalizeEntryPath(raw: string): string | null {
	if (raw.includes('\0')) return null;

	const normalized = raw.replace(/\\/g, '/');

	if (normalized.startsWith('/')) return null;
	if (/^[a-zA-Z]:/.test(normalized)) return null;

	const segments = normalized.split('/').filter((segment) => segment !== '' && segment !== '.');

	if (segments.length === 0) return null;
	if (segments.some((segment) => segment === '..')) return null;

	return segments.join('/');
}

export function detectAutomaticRoot(raw: string): string | null {
	const normalized = raw.replace(/\\/g, '/').replace(/^\.\/+/, '');
	const isDirectory = normalized.endsWith('/');
	const segments = normalized.split('/').filter((segment) => segment !== '' && segment !== '.');

	if (segments.length === 0) return null;
	if (segments.some((segment) => segment === '..')) return null;
	if (segments.length > 1) return segments[0];

	return isDirectory ? segments[0] : null;
}

export function toRelativePath(path: string, root: string | null): string | null {
	if (!root) return path;
	if (path === root) return null;

	const prefix = root.endsWith('/') ? root : `${root}/`;

	if (!path.startsWith(prefix)) return null;

	const relative = path.slice(prefix.length);

	return relative.length > 0 ? relative : null;
}

export function shouldIgnorePath(
	path: string,
	shouldInclude: ((path: string) => boolean) | undefined
): boolean {
	const segments = path.split('/');
	const filename = segments[segments.length - 1];

	if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) return true;
	if (IGNORED_FILE_NAMES.has(filename)) return true;
	if (IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(filename))) return true;

	return shouldInclude !== undefined && !shouldInclude(path);
}

export function looksBinary(buffer: Buffer): boolean {
	const sample = buffer.subarray(0, 8_192);

	if (sample.includes(0)) return true;

	let suspicious = 0;

	for (const byte of sample) {
		if (byte === 9 || byte === 10 || byte === 13 || byte === 27 || byte >= 32) continue;

		suspicious += 1;
	}

	return sample.length > 0 && suspicious / sample.length > 0.1;
}
