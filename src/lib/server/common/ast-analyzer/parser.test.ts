import { expect, test } from 'vitest';
import { AstAbortError, AstValidationError } from './errors';
import { analyzeSourceFile, analyzeSourceFiles } from './parser';
import type { AstNode } from './types';

function findNode(node: AstNode | undefined, type: string): AstNode | undefined {
	if (!node) return undefined;
	if (node.type === type) return node;

	for (const child of node.children ?? []) {
		const found = findNode(child, type);

		if (found) return found;
	}

	return undefined;
}

test('parses JavaScript into a serialized tree', async () => {
	const result = await analyzeSourceFile({
		path: 'src/greet.js',
		content: 'function greet(name) {\n\treturn `hi ${name}`;\n}\n'
	});

	expect(result.status).toBe('parsed');
	expect(result.language).toBe('javascript');
	expect(result.hasError).toBe(false);
	expect(result.nodeCount).toBeGreaterThan(0);
	expect(result.tree?.type).toBe('program');

	const declaration = findNode(result.tree, 'function_declaration');

	expect(declaration).toBeDefined();
	expect(declaration?.children?.some((child) => child.field === 'name')).toBe(true);
	expect(declaration?.children?.some((child) => child.field === 'body')).toBe(true);
});

test('parses TypeScript and TSX', async () => {
	const typescript = await analyzeSourceFile({
		path: 'src/math.ts',
		content: 'export const add = (a: number, b: number): number => a + b;\n'
	});
	const tsx = await analyzeSourceFile({
		path: 'src/App.tsx',
		content: 'export const App = () => <div>hello</div>;\n'
	});

	expect(typescript.status).toBe('parsed');
	expect(typescript.language).toBe('typescript');
	expect(typescript.hasError).toBe(false);
	expect(tsx.status).toBe('parsed');
	expect(tsx.language).toBe('tsx');
	expect(tsx.hasError).toBe(false);
});

test('skips unsupported files and respects an explicit language', async () => {
	const unsupported = await analyzeSourceFile({
		path: 'notes.unknown',
		content: 'hello'
	});
	const overridden = await analyzeSourceFile({
		path: 'bin/run',
		content: 'def run():\n\treturn 1\n',
		language: 'python'
	});

	expect(unsupported.status).toBe('unsupported');
	expect(unsupported.language).toBeNull();
	expect(overridden.status).toBe('parsed');
	expect(overridden.language).toBe('python');
});

test('reports syntax errors without failing the file', async () => {
	const result = await analyzeSourceFile({
		path: 'broken.js',
		content: 'const value = ;\n'
	});

	expect(result.status).toBe('parsed');
	expect(result.hasError).toBe(true);
	expect(result.errorCount).toBeGreaterThan(0);
});

test('omits anonymous nodes unless requested', async () => {
	const source = 'const value = 1;\n';
	const namedOnly = await analyzeSourceFile({ path: 'a.js', content: source });
	const allNodes = await analyzeSourceFile(
		{ path: 'a.js', content: source },
		{ includeAnonymous: true }
	);
	const namedDeclaration = findNode(namedOnly.tree, 'lexical_declaration');
	const allDeclaration = findNode(allNodes.tree, 'lexical_declaration');

	expect(namedDeclaration?.children?.length).toBe(1);
	expect(allDeclaration?.children?.length).toBeGreaterThan(1);
	expect(allNodes.nodeCount).toBeGreaterThan(namedOnly.nodeCount);
});

test('truncates trees that exceed the node budget', async () => {
	const result = await analyzeSourceFile(
		{ path: 'a.js', content: 'const value = { nested: { deep: true } };\n' },
		{ maxNodesPerFile: 3 }
	);

	expect(result.status).toBe('parsed');
	expect(result.truncated).toBe(true);
	expect(result.nodeCount).toBeLessThanOrEqual(3);
});

test('skips files over the byte limit', async () => {
	const result = await analyzeSourceFile(
		{ path: 'a.js', content: 'const value = 1;\n' },
		{ maxFileBytes: 4 }
	);

	expect(result.status).toBe('skipped');
	expect(result.skipReason).toBe('too_large');
});

test('builds a compilation summary and preserves metadata', async () => {
	const compilation = await analyzeSourceFiles(
		[
			{ path: 'a.js', content: 'const a = 1;\n' },
			{ path: 'b.unknown', content: 'nope' },
			{ path: 'c.py', content: 'def f():\n\treturn 1\n' }
		],
		{
			now: () => new Date('2026-01-01T00:00:00.000Z'),
			metadata: { repository: 'owner/repo', commitSha: 'abc123' }
		}
	);

	expect(compilation.version).toBe(1);
	expect(compilation.generatedAt).toBe('2026-01-01T00:00:00.000Z');
	expect(compilation.metadata).toEqual({ repository: 'owner/repo', commitSha: 'abc123' });
	expect(compilation.summary.inputFiles).toBe(3);
	expect(compilation.summary.analyzedFiles).toBe(3);
	expect(compilation.summary.parsedFiles).toBe(2);
	expect(compilation.summary.unsupportedFiles).toBe(1);
	expect(compilation.summary.languages).toEqual({ javascript: 1, python: 1 });
});

test('honors maxFiles and maxTotalNodes', async () => {
	const limitedFiles = await analyzeSourceFiles(
		[
			{ path: 'a.js', content: 'const a = 1;\n' },
			{ path: 'b.js', content: 'const b = 2;\n' },
			{ path: 'c.js', content: 'const c = 3;\n' }
		],
		{ maxFiles: 2 }
	);
	const limitedNodes = await analyzeSourceFiles(
		[
			{ path: 'a.js', content: 'const a = 1;\n' },
			{ path: 'b.js', content: 'const b = 2;\n' }
		],
		{ maxNodesPerFile: 100, maxTotalNodes: 5 }
	);

	expect(limitedFiles.summary.inputFiles).toBe(3);
	expect(limitedFiles.summary.analyzedFiles).toBe(2);
	expect(limitedNodes.summary.nodeCount).toBeLessThanOrEqual(5);
	expect(limitedNodes.files.some((file) => file.status === 'skipped')).toBe(true);
});

test('validates numeric limits and aborts early', async () => {
	await expect(
		analyzeSourceFile({ path: 'a.js', content: 'const a = 1;' }, { maxDepth: -1 })
	).rejects.toBeInstanceOf(AstValidationError);

	const controller = new AbortController();
	controller.abort();

	await expect(
		analyzeSourceFile({ path: 'a.js', content: 'const a = 1;' }, { signal: controller.signal })
	).rejects.toBeInstanceOf(AstAbortError);
});
