# AST Analyzer

The AST analyzer is a **common module** at `src/lib/server/common/ast-analyzer`. It turns source files into tree-sitter syntax trees and returns one JSON document for the whole compilation. It also reads GitHub-style tarballs into a filtered list of source files so callers do not have to handle tar paths, binaries, or dependency folders.

It does **not** write to the database and does not decide what the trees are used for. A database module's service calls it, then stores the result (for example keyed by `repo_id + commit_sha`).

## Why it exists

The AI needs to know _where_ code lives, not just which files exist. A flat file tree says `src/router/navigation.ts`; an AST says the file exports `navigate`, declares an interface, and calls `resolve`. The analyzer provides that structure in a bounded, deterministic JSON format.

Two design rules matter:

- **Bounded output.** Repositories can be enormous. Every parse has a node, depth, text, and file-size budget. Truncation is explicit in the JSON.
- **Safe tarball handling.** Archive paths are never trusted. Traversal paths, absolute paths, symlinks, binary files, build output, and dependencies are excluded before parsing.

## Public API

```ts
import { getAstAnalyzer } from '$lib/server/common/ast-analyzer';

const analyzer = getAstAnalyzer();

const compilation = await analyzer.analyzeFiles([
	{ path: 'src/index.ts', content: 'export const answer = 42;' },
	{ path: 'scripts/build', content: '#!/usr/bin/env node\nconsole.log("build");' }
]);

const analysis = await analyzer.analyzeTarball('/tmp/owner-repo.tar.gz');
// analysis.compilation is the JSON document.
// analysis.root / analysis.files / analysis.skipped describe extraction.
```

`createAstAnalyzer(defaultOptions)` is the testable/worker-friendly form. Defaults are merged into every call:

```ts
import { createAstAnalyzer } from './common/ast-analyzer';

const analyzer = createAstAnalyzer({
	maxNodesPerFile: 10_000,
	includeText: 'leaves'
});
```

The standalone functions are also exported:

```ts
import {
	analyzeSourceFile,
	analyzeSourceFiles,
	readTarballSourceFiles,
	getLanguageDefinition,
	loadLanguage,
	listLanguages
} from './common/ast-analyzer';
```

### Service composition

```ts
const extraction = await readTarballSourceFiles(tarballPath, {
	maxFileBytes: 512 * 1024
});

const compilation = await analyzeSourceFiles(extraction.files, {
	metadata: { repository: 'owner/repo', commitSha }
});

await repoComputations.upsert(compilation);
```

The worker downloads the tarball with the GitHub module, then calls the analyzer. The server layer never imports this module directly.

## Supported languages

The registry maps extensions, well-known filenames, and shebangs to a tree-sitter grammar. Grammars are loaded lazily and cached per language, so startup does not pay for languages a repository does not use.

| Language   | Extensions / filenames                                       | Package                                      |
| ---------- | ------------------------------------------------------------ | -------------------------------------------- |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs`                                | `tree-sitter-javascript`                     |
| TypeScript | `.ts`, `.mts`, `.cts`                                        | `tree-sitter-typescript`                     |
| TSX        | `.tsx`                                                       | `tree-sitter-typescript`                     |
| Python     | `.py`, `.pyi`, `.pyw`                                        | `tree-sitter-python`                         |
| JSON       | `.json`, `.jsonc`                                            | `tree-sitter-json`                           |
| CSS        | `.css`                                                       | `tree-sitter-css`                            |
| HTML       | `.html`, `.htm`, `.xhtml`                                    | `tree-sitter-html`                           |
| Go         | `.go`                                                        | `tree-sitter-go`                             |
| Rust       | `.rs`                                                        | `tree-sitter-rust`                           |
| Java       | `.java`                                                      | `tree-sitter-java`                           |
| C          | `.c`, `.h`                                                   | `tree-sitter-c`                              |
| C++        | `.cc`, `.cpp`, `.cxx`, `.c++`, `.hh`, `.hpp`, `.hxx`, `.h++` | `tree-sitter-cpp`                            |
| C#         | `.cs`                                                        | `tree-sitter-c-sharp`                        |
| Bash       | `.sh`, `.bash`, `.zsh`, `.ksh`, `.bashrc`, `.profile`, …     | `tree-sitter-bash`                           |
| Ruby       | `.rb`, `.rake`, `.gemspec`, `Gemfile`, `Rakefile`, …         | `tree-sitter-ruby`                           |
| PHP        | `.php`                                                       | `tree-sitter-php`                            |
| Kotlin     | `.kt`, `.kts`                                                | `@tree-sitter-grammars/tree-sitter-kotlin`   |
| Lua        | `.lua`                                                       | `@tree-sitter-grammars/tree-sitter-lua`      |
| YAML       | `.yml`, `.yaml`                                              | `@tree-sitter-grammars/tree-sitter-yaml`     |
| Markdown   | `.md`, `.markdown`                                           | `@tree-sitter-grammars/tree-sitter-markdown` |
| Scala      | `.scala`, `.sc`                                              | `tree-sitter-scala`                          |
| Swift      | `.swift`                                                     | `tree-sitter-swift`                          |

Extensionless executable scripts are detected from their shebang (`node`, `deno`, `bun`, `python`, `ruby`, `php`, `bash`, `sh`, `zsh`). Detection happens after the file is read, so shebang files work both in `analyzeFiles` and in tarballs.

### Adding a language

1. Add the grammar package to `dependencies`.
2. Add one entry to `definitions` in `languages.ts` with its `id`, `name`, `extensions`, optional `filenames`, and a lazy `load()`.
3. If the package exposes a named export (like TypeScript's `typescript` / `tsx`), select it inside `load()`.
4. Add a detection test and a parse test.
5. Update the table above.

## Output JSON

`analyzeSourceFiles` returns one `AstCompilation`:

```json
{
	"version": 1,
	"generatedAt": "2026-11-08T12:00:00.000Z",
	"metadata": { "repository": "owner/repo", "commitSha": "abc123" },
	"files": [
		{
			"path": "src/index.ts",
			"language": "typescript",
			"status": "parsed",
			"bytes": 31,
			"lineCount": 1,
			"nodeCount": 12,
			"errorCount": 0,
			"hasError": false,
			"truncated": false,
			"tree": {
				"type": "program",
				"named": true,
				"start": { "row": 0, "column": 0 },
				"end": { "row": 0, "column": 31 },
				"startIndex": 0,
				"endIndex": 31,
				"children": []
			}
		}
	],
	"summary": {
		"inputFiles": 1,
		"analyzedFiles": 1,
		"parsedFiles": 1,
		"failedFiles": 0,
		"unsupportedFiles": 0,
		"skippedFiles": 0,
		"filesWithErrors": 0,
		"truncatedFiles": 0,
		"nodeCount": 12,
		"languages": { "typescript": 1 },
		"durationMs": 8
	}
}
```

### `AstNode`

| Field                   | Meaning                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `type`                  | Grammar node type (`function_declaration`, `identifier`, …).        |
| `named`                 | Whether the grammar marks this as a named node.                     |
| `field`                 | Field name in the parent (`name`, `body`, `parameters`, …), if any. |
| `start` / `end`         | Zero-based row/column positions.                                    |
| `startIndex`/`endIndex` | Byte offsets in the original source.                                |
| `text`                  | Present for leaves (and errors) when `includeText` allows it.       |
| `textTruncated`         | The leaf text was longer than `maxTextLength` and was cut.          |
| `error`                 | This node is an `ERROR` or `MISSING` recovery node.                 |
| `truncated`             | This subtree's children were omitted because a limit was reached.   |
| `children`              | Child nodes. Omitted for leaves.                                    |

Nodes are written in pre-order. By default anonymous punctuation is removed and leaf text is kept. Use `includeAnonymous: true` for the full concrete syntax tree, but expect much larger output.

### File statuses

| Status        | Meaning                                                         |
| ------------- | --------------------------------------------------------------- |
| `parsed`      | A grammar ran. `hasError`/`errorCount` describe recovery nodes. |
| `failed`      | The grammar could not load or the parser threw. See `error`.    |
| `unsupported` | No grammar matched the path or shebang.                         |
| `skipped`     | A limit prevented analysis. See `skipReason`.                   |

Syntax errors do **not** make a file `failed`: tree-sitter produces a tree with `ERROR`/`MISSING` nodes and `hasError: true`. This is useful signal, not an exception.

## Analyzer options

| Option             | Default            | Purpose                                                       |
| ------------------ | ------------------ | ------------------------------------------------------------- |
| `includeAnonymous` | `false`            | Include anonymous nodes (punctuation, keywords).              |
| `includeText`      | `"leaves"`         | `"none"`, `"leaves"`, or `"all"`.                             |
| `maxNodesPerFile`  | `20_000`           | Maximum serialized nodes per file.                            |
| `maxTotalNodes`    | `1_000_000`        | Global node budget across the compilation.                    |
| `maxDepth`         | `200`              | Maximum tree depth. Deeper subtrees are marked `truncated`.   |
| `maxTextLength`    | `2_000`            | Maximum characters stored in one `text` field.                |
| `maxFiles`         | `5_000`            | Maximum files analyzed. `summary.inputFiles` shows the input. |
| `maxFileBytes`     | `1 MiB`            | Files larger than this are `skipped` with `too_large`.        |
| `metadata`         | —                  | Copied into the compilation (repo, commit, request id, …).    |
| `signal`           | —                  | `AbortSignal`; aborted work throws `AstAbortError`.           |
| `now`              | `() => new Date()` | Clock injection for deterministic tests.                      |

Limits are validated. Zero or negative values throw `AstValidationError` (except `maxDepth` and `maxTextLength`, which may be zero).

## Tarball extraction

`readTarballSourceFiles(input, options)` accepts a filesystem path, a `Uint8Array`, a Node `Readable`, or a web `ReadableStream<Uint8Array>`. GitHub's tarball stream can be passed directly; it is also fine to download to disk first.

```ts
const extraction = await readTarballSourceFiles(tarball.stream);

extraction.root; // "owner-repo-abc123" (stripped prefix), or null
extraction.files; // [{ path: "src/app.ts", content, bytes, language }]
extraction.skipped; // [{ path, reason, bytes? }]
extraction.stats; // entries, files, skipped, bytes, reasons, truncated
```

### Path handling

- GitHub archives wrap everything in one top-level directory. It is detected from the first entry and stripped automatically.
- Set `root: false` to keep full archive paths, or `root: "prefix"` to strip an explicit prefix.
- Absolute paths, Windows drive paths, NUL bytes, and any `..` segment are rejected (`outside_root`).
- Only regular files are read. Symlinks and hard links are skipped (`not_a_file`).
- The reader never writes to disk, so extraction cannot escape a directory.

### What is excluded

Built-in filters remove:

- Dependency/build folders: `node_modules`, `.git`, `dist`, `build`, `vendor`, `target`, `.venv`, `.next`, `.svelte-kit`, `coverage`, `__pycache__`, and similar.
- Lock files: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.lock`, `Gemfile.lock`, `go.sum`, and similar.
- Minified/generated noise: `*.min.js`, `*.min.css`, `*.map`, `*.snap`, `*.lock`.
- Binary content: NUL bytes or a high ratio of control characters.
- Invalid UTF-8.
- Files with no supported language, unless `includeUnsupported: true`.

Use `shouldInclude(path)` to add project-specific rules. It runs after the built-in filters.

### Tarball options

| Option               | Default   | Purpose                                               |
| -------------------- | --------- | ----------------------------------------------------- |
| `root`               | auto      | `false` keeps paths; a string strips that prefix.     |
| `maxEntries`         | `50_000`  | Maximum archive entries inspected.                    |
| `maxFileBytes`       | `1 MiB`   | Per-file read limit.                                  |
| `maxTotalBytes`      | `32 MiB`  | Total bytes of selected source files.                 |
| `maxArchiveBytes`    | `256 MiB` | Compressed input cap; larger input throws.            |
| `includeUnsupported` | `false`   | Keep text files with no grammar (language is `null`). |
| `shouldInclude`      | —         | Extra predicate; return `false` to skip a path.       |
| `signal`             | —         | `AbortSignal`.                                        |

When a limit stops extraction, `stats.truncated` is `true` and the reason is recorded in `stats.reasons`. A single oversized file is skipped, not fatal.

## Errors

All errors extend `AstAnalyzerError` and carry a `code`:

| Class                | Code         | When                                                      |
| -------------------- | ------------ | --------------------------------------------------------- |
| `AstValidationError` | `validation` | Invalid option, root, or numeric limit.                   |
| `AstLanguageError`   | `language`   | A grammar could not be loaded.                            |
| `AstTarballError`    | `tarball`    | Input could not be read, parsed, or exceeded archive cap. |
| `AstAbortError`      | `aborted`    | The caller's `AbortSignal` fired.                         |

Per-file grammar/parse failures are returned as `status: "failed"` instead of throwing, so one bad file cannot fail a whole repository. Files can also fail with `language_unavailable` when a native grammar has no prebuilt binary on the platform.

## Performance and persistence

- Parsing is synchronous per file and files are processed in order. This bounds memory and keeps worker CPU predictable.
- Grammars are lazy and cached. The first file of a language pays the native module load cost.
- Output size grows fast if `includeAnonymous` or `includeText: "all"` is enabled. Start with defaults and raise limits only when needed.
- `generatedAt` is a timestamp. If you need byte-identical JSON for caching, pass a fixed `now` or ignore that field in your cache key. The meaningful cache key remains `(repo_id, commit_sha, analyzer options)`.
- Store the JSON in Postgres (`jsonb`) from the owning service. This module never touches the database.

## Limits and deliberate non-goals

- No semantic analysis, symbol resolution, type checking, or cross-file linking.
- No git clone, gitignore evaluation, or repository hosting logic.
- No database access, queue access, or SvelteKit imports. Workers can import this module directly.
- No persistent extraction directory. Tarballs are read in memory up to `maxTotalBytes`.

## Tests

```bash
pnpm exec vitest run src/lib/server/common/ast-analyzer
```

Coverage includes:

- extension/filename/shebang detection,
- JavaScript, TypeScript, and TSX trees with field names,
- error recovery, anonymous-node mode, and truncation,
- option validation and aborts,
- tarball root stripping, filtering, binary detection, size/entry limits, buffer input, and end-to-end tarball analysis,
- path-traversal rejection and ignore rules.
