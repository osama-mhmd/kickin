import { expect, test } from 'vitest';
import {
	detectAutomaticRoot,
	looksBinary,
	normalizeEntryPath,
	shouldIgnorePath,
	toRelativePath
} from './tarball-paths';

test('normalizes safe tar entry paths', () => {
	expect(normalizeEntryPath('repo/src/app.ts')).toBe('repo/src/app.ts');
	expect(normalizeEntryPath('./repo//src/app.ts')).toBe('repo/src/app.ts');
	expect(normalizeEntryPath('repo\\src\\app.ts')).toBe('repo/src/app.ts');
	expect(normalizeEntryPath('repo/src/')).toBe('repo/src');
});

test('rejects unsafe tar entry paths', () => {
	expect(normalizeEntryPath('../outside.ts')).toBeNull();
	expect(normalizeEntryPath('repo/../../outside.ts')).toBeNull();
	expect(normalizeEntryPath('/etc/passwd')).toBeNull();
	expect(normalizeEntryPath('C:\\Windows\\evil.ts')).toBeNull();
	expect(normalizeEntryPath('repo/a\0b.ts')).toBeNull();
	expect(normalizeEntryPath('./')).toBeNull();
});

test('detects and strips an automatic archive root', () => {
	expect(detectAutomaticRoot('owner-repo-sha/')).toBe('owner-repo-sha');
	expect(detectAutomaticRoot('owner-repo-sha/src/app.ts')).toBe('owner-repo-sha');
	expect(detectAutomaticRoot('README.md')).toBeNull();
	expect(toRelativePath('owner-repo-sha/src/app.ts', 'owner-repo-sha')).toBe('src/app.ts');
	expect(toRelativePath('other/src/app.ts', 'owner-repo-sha')).toBeNull();
	expect(toRelativePath('src/app.ts', null)).toBe('src/app.ts');
});

test('ignores dependency, build and lockfile paths', () => {
	expect(shouldIgnorePath('node_modules/pkg/index.js', undefined)).toBe(true);
	expect(shouldIgnorePath('dist/app.js', undefined)).toBe(true);
	expect(shouldIgnorePath('package-lock.json', undefined)).toBe(true);
	expect(shouldIgnorePath('src/app.min.js', undefined)).toBe(true);
	expect(shouldIgnorePath('src/app.ts', undefined)).toBe(false);
	expect(shouldIgnorePath('src/app.ts', (path) => path === 'src/app.ts')).toBe(false);
	expect(shouldIgnorePath('src/app.ts', () => false)).toBe(true);
});

test('detects binary content', () => {
	expect(looksBinary(Buffer.from('const x = 1;\n'))).toBe(false);
	expect(looksBinary(Buffer.from([0, 1, 2, 3]))).toBe(true);
	expect(looksBinary(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(true);
});
