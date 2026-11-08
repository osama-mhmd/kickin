import { expect, test } from 'vitest';
import { detectLanguage, getLanguageDefinition, listLanguages } from './languages';

test('detects languages from file extensions', () => {
	expect(detectLanguage('src/app.ts')?.id).toBe('typescript');
	expect(detectLanguage('src/app.tsx')?.id).toBe('tsx');
	expect(detectLanguage('src/app.js')?.id).toBe('javascript');
	expect(detectLanguage('src/app.py')?.id).toBe('python');
	expect(detectLanguage('src/main.rs')?.id).toBe('rust');
	expect(detectLanguage('src/App.vue')).toBeUndefined();
});

test('detects languages from well-known filenames', () => {
	expect(detectLanguage('Gemfile')?.id).toBe('ruby');
	expect(detectLanguage('scripts/.bashrc')?.id).toBe('bash');
	expect(detectLanguage('PKGBUILD')?.id).toBe('bash');
});

test('detects languages from shebangs for extensionless scripts', () => {
	expect(detectLanguage('bin/run', '#!/usr/bin/env node\nconsole.log(1);')?.id).toBe('javascript');
	expect(detectLanguage('bin/run', '#!/usr/bin/env python3\nprint(1)')?.id).toBe('python');
	expect(detectLanguage('bin/run', '#!/bin/bash\necho hi')?.id).toBe('bash');
	expect(detectLanguage('bin/run', 'no shebang here')?.id).toBeUndefined();
});

test('exposes language metadata and definitions', () => {
	const languages = listLanguages();
	const ids = languages.map((language) => language.id);

	expect(ids).toContain('javascript');
	expect(ids).toContain('typescript');
	expect(ids).toContain('python');
	expect(getLanguageDefinition('typescript')?.name).toBe('TypeScript');
	expect(getLanguageDefinition('missing')).toBeUndefined();
});
