import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { c as createArchive } from 'tar';
import { expect, onTestFinished, test } from 'vitest';
import { AstAbortError } from './errors';
import { getAstAnalyzer } from './index';
import { readTarballSourceFiles } from './tarball';

interface Fixture {
	directory: string;
	archive: string;
	root: string;
}

async function createFixture(): Promise<Fixture> {
	const directory = await mkdtemp(join(tmpdir(), 'kickin-ast-'));
	const root = 'owner-repo-sha';
	const repository = join(directory, root);

	await mkdir(join(repository, 'src'), { recursive: true });
	await mkdir(join(repository, 'node_modules', 'dep'), { recursive: true });
	await writeFile(join(repository, 'src', 'app.ts'), 'export const answer: number = 42;\n');
	await writeFile(join(repository, 'src', 'script'), '#!/usr/bin/env node\nconsole.log("hi");\n');
	await writeFile(join(repository, 'src', 'binary.js'), Buffer.from([0, 1, 2, 3, 4]));
	await writeFile(join(repository, 'README.md'), '# Demo\n');
	await writeFile(join(repository, 'notes.txt'), 'plain text\n');
	await writeFile(join(repository, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;\n');
	await writeFile(join(repository, 'package-lock.json'), '{}\n');
	await writeFile(join(repository, 'logo.png'), Buffer.from([0, 1, 2, 3]));

	const archive = join(directory, 'repo.tar.gz');

	await createArchive({ gzip: true, file: archive, cwd: directory, portable: true }, [root]);

	return { directory, archive, root };
}

async function fixtureWithCleanup(): Promise<Fixture> {
	const fixture = await createFixture();

	onTestFinished(() => rm(fixture.directory, { recursive: true, force: true }));

	return fixture;
}

test('reads a GitHub-style tarball into a filtered source file list', async () => {
	const fixture = await fixtureWithCleanup();
	const extraction = await readTarballSourceFiles(fixture.archive);
	const files = new Map(extraction.files.map((file) => [file.path, file]));
	const reasons = new Set(extraction.skipped.map((entry) => entry.reason));

	expect(extraction.root).toBe(fixture.root);
	expect([...files.keys()].sort()).toEqual(['README.md', 'src/app.ts', 'src/script']);
	expect(files.get('src/app.ts')?.language).toBe('typescript');
	expect(files.get('src/script')?.language).toBe('javascript');
	expect(files.get('README.md')?.language).toBe('markdown');
	expect(files.get('README.md')?.content).toBe('# Demo\n');
	expect(reasons.has('ignored')).toBe(true);
	expect(reasons.has('binary')).toBe(true);
	expect(reasons.has('unsupported_language')).toBe(true);
	expect(extraction.stats.files).toBe(3);
	expect(extraction.stats.truncated).toBe(false);
});

test('can keep the archive root paths', async () => {
	const fixture = await fixtureWithCleanup();
	const extraction = await readTarballSourceFiles(fixture.archive, { root: false });

	expect(extraction.root).toBeNull();
	expect(extraction.files.some((file) => file.path === `${fixture.root}/src/app.ts`)).toBe(true);
});

test('can include files with no supported language', async () => {
	const fixture = await fixtureWithCleanup();
	const extraction = await readTarballSourceFiles(fixture.archive, {
		includeUnsupported: true
	});

	expect(extraction.files.some((file) => file.path === 'notes.txt' && file.language === null)).toBe(
		true
	);
});

test('applies size and entry limits', async () => {
	const fixture = await fixtureWithCleanup();
	const fileLimited = await readTarballSourceFiles(fixture.archive, {
		maxFileBytes: 10
	});
	const totalLimited = await readTarballSourceFiles(fixture.archive, {
		maxTotalBytes: 1
	});
	const entryLimited = await readTarballSourceFiles(fixture.archive, {
		maxEntries: 1
	});

	expect(fileLimited.skipped.some((entry) => entry.reason === 'too_large')).toBe(true);
	expect(totalLimited.stats.truncated).toBe(true);
	expect(totalLimited.skipped.some((entry) => entry.reason === 'total_limit')).toBe(true);
	expect(entryLimited.stats.truncated).toBe(true);
});

test('applies a custom include filter', async () => {
	const fixture = await fixtureWithCleanup();
	const extraction = await readTarballSourceFiles(fixture.archive, {
		shouldInclude: (path) => path.startsWith('src/')
	});

	expect(extraction.files.every((file) => file.path.startsWith('src/'))).toBe(true);
});

test('accepts the tarball as an in-memory buffer', async () => {
	const fixture = await fixtureWithCleanup();
	const bytes = await readFile(fixture.archive);
	const extraction = await readTarballSourceFiles(bytes);

	expect(extraction.files.some((file) => file.path === 'src/app.ts')).toBe(true);
});

test('aborts when the signal is already aborted', async () => {
	const fixture = await fixtureWithCleanup();
	const controller = new AbortController();

	controller.abort();

	await expect(
		readTarballSourceFiles(fixture.archive, { signal: controller.signal })
	).rejects.toBeInstanceOf(AstAbortError);
});

test('forwards the analysis signal to tarball extraction', async () => {
	const fixture = await fixtureWithCleanup();
	const controller = new AbortController();

	controller.abort();

	await expect(
		getAstAnalyzer().analyzeTarball(fixture.archive, {
			analysis: { signal: controller.signal }
		})
	).rejects.toBeInstanceOf(AstAbortError);
});

test('analyzes a tarball end to end', async () => {
	const fixture = await fixtureWithCleanup();
	const analysis = await getAstAnalyzer().analyzeTarball(fixture.archive);
	const app = analysis.compilation.files.find((file) => file.path === 'src/app.ts');

	expect(analysis.root).toBe(fixture.root);
	expect(app?.status).toBe('parsed');
	expect(app?.language).toBe('typescript');
	expect(analysis.compilation.summary.parsedFiles).toBeGreaterThanOrEqual(3);
});
