import type Parser from 'tree-sitter';
import type { AstNode, AstPoint, AstTextMode } from './types';

export interface SerializeTreeOptions {
	includeAnonymous: boolean;
	includeText: AstTextMode;
	maxNodes: number;
	maxDepth: number;
	maxTextLength: number;
}

export interface SerializedTree {
	root: AstNode;
	nodeCount: number;
	errorCount: number;
	truncated: boolean;
}

interface SerializeState {
	nodeCount: number;
	errorCount: number;
	truncated: boolean;
}

export function serializeTree(
	root: Parser.SyntaxNode,
	options: SerializeTreeOptions
): SerializedTree {
	const state: SerializeState = { nodeCount: 0, errorCount: 0, truncated: false };
	const serialized = serializeNode(root, undefined, 0, state, options);

	if (!serialized) {
		throw new Error('The serializer produced no root node.');
	}

	return {
		root: serialized,
		nodeCount: state.nodeCount,
		errorCount: state.errorCount,
		truncated: state.truncated
	};
}

function serializeNode(
	node: Parser.SyntaxNode,
	field: string | undefined,
	depth: number,
	state: SerializeState,
	options: SerializeTreeOptions
): AstNode | null {
	if (state.nodeCount >= options.maxNodes) {
		state.truncated = true;

		return null;
	}

	state.nodeCount += 1;

	const visibleChildCount = options.includeAnonymous ? node.childCount : node.namedChildCount;
	const isError = node.isError || node.isMissing;
	const result: AstNode = {
		type: node.type,
		named: node.isNamed,
		start: toPoint(node.startPosition),
		end: toPoint(node.endPosition),
		startIndex: node.startIndex,
		endIndex: node.endIndex
	};

	if (field !== undefined) result.field = field;
	if (isError) {
		result.error = true;
		state.errorCount += 1;
	}

	if (shouldIncludeText(isError, visibleChildCount, options.includeText)) {
		const text = node.text;

		if (text.length > options.maxTextLength) {
			result.text = text.slice(0, options.maxTextLength);
			result.textTruncated = true;
			state.truncated = true;
		} else {
			result.text = text;
		}
	}

	if (visibleChildCount === 0) return result;

	if (depth >= options.maxDepth) {
		result.truncated = true;
		state.truncated = true;

		return result;
	}

	const children: AstNode[] = [];

	for (let index = 0; index < visibleChildCount; index += 1) {
		const child = options.includeAnonymous ? node.child(index) : node.namedChild(index);

		if (!child) continue;

		const childField = options.includeAnonymous
			? node.fieldNameForChild(index)
			: node.fieldNameForNamedChild(index);
		const serialized = serializeNode(child, childField ?? undefined, depth + 1, state, options);

		if (!serialized) {
			result.truncated = true;
			state.truncated = true;
			break;
		}

		children.push(serialized);
	}

	if (children.length > 0) result.children = children;

	return result;
}

function shouldIncludeText(
	isError: boolean,
	visibleChildCount: number,
	mode: AstTextMode
): boolean {
	if (mode === 'none') return false;

	return mode === 'all' || isError || visibleChildCount === 0;
}

function toPoint(point: Parser.Point): AstPoint {
	return { row: point.row, column: point.column };
}
