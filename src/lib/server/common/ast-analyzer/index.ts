import { listLanguages } from './languages';
import { analyzeSourceFile, analyzeSourceFiles } from './parser';
import { readTarballSourceFiles } from './tarball';
import type {
	AnalyzeTarballOptions,
	AstAnalyzerOptions,
	AstSourceFile,
	AstTarballAnalysis,
	ReadTarballOptions,
	TarballInput
} from './types';

export * from './types';
export * from './errors';
export {
	analyzeSourceFile,
	analyzeSourceFiles,
	resolveAstAnalyzerOptions,
	type ResolvedAstAnalyzerOptions
} from './parser';
export { readTarballSourceFiles } from './tarball';
export {
	clearLanguageCache,
	detectLanguage,
	getLanguageDefinition,
	listLanguages,
	loadLanguage,
	type AstLanguageDefinition,
	type AstLanguageInfo
} from './languages';

export function createAstAnalyzer(defaultOptions: AstAnalyzerOptions = {}) {
	return {
		languages: listLanguages,
		analyzeFile: (file: AstSourceFile, options?: AstAnalyzerOptions) =>
			analyzeSourceFile(file, { ...defaultOptions, ...options }),
		analyzeFiles: (files: AstSourceFile[], options?: AstAnalyzerOptions) =>
			analyzeSourceFiles(files, { ...defaultOptions, ...options }),
		readTarball: (input: TarballInput, options?: ReadTarballOptions) =>
			readTarballSourceFiles(input, options),
		analyzeTarball: async (
			input: TarballInput,
			options: AnalyzeTarballOptions = {}
		): Promise<AstTarballAnalysis> => {
			const extraction = await readTarballSourceFiles(input, {
				...options.tarball,
				signal: options.tarball?.signal ?? options.analysis?.signal
			});
			const compilation = await analyzeSourceFiles(
				extraction.files.map((file) => ({
					path: file.path,
					content: file.content,
					language: file.language ?? undefined
				})),
				{
					...defaultOptions,
					...options.analysis
				}
			);

			return {
				compilation,
				root: extraction.root,
				files: extraction.files.map((file) => ({
					path: file.path,
					language: file.language,
					bytes: file.bytes
				})),
				skipped: extraction.skipped
			};
		}
	};
}

export type AstAnalyzer = ReturnType<typeof createAstAnalyzer>;

let defaultAnalyzer: AstAnalyzer | undefined;

export function getAstAnalyzer(): AstAnalyzer {
	defaultAnalyzer ??= createAstAnalyzer();

	return defaultAnalyzer;
}
