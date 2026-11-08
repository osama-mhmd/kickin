export type GitHubFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface GitHubClientOptions {
	token?: string;
	baseUrl?: string;
	userAgent?: string;
	apiVersion?: string;
	timeoutMs?: number;
	fetch?: GitHubFetch;
}

export type GitHubQueryValue = string | number | boolean | null | undefined;

export type GitHubQuery = Record<string, GitHubQueryValue | GitHubQueryValue[]>;

export interface GitHubRequestOptions {
	method?: string;
	query?: GitHubQuery;
	body?: unknown;
	headers?: HeadersInit;
	signal?: AbortSignal;
	redirect?: RequestRedirect;
	accept?: string;
}

export interface GitHubJsonResponse<T> {
	data: T;
	headers: Headers;
	status: number;
	url: string;
}

export type RepositoryRef = string | { owner: string; name: string };

export interface NormalizedRepositoryRef {
	owner: string;
	name: string;
}

export interface GitHubUserSummary {
	login: string;
	id: number;
	avatar_url?: string;
	html_url?: string;
	type?: string;
}

export interface GitHubRepository {
	id: number;
	name: string;
	full_name: string;
	private: boolean;
	owner: GitHubUserSummary;
	html_url: string;
	description: string | null;
	default_branch: string;
	stargazers_count: number;
	forks_count: number;
	open_issues_count: number;
	language: string | null;
	archived: boolean;
	disabled: boolean;
	size: number;
	pushed_at: string | null;
	updated_at: string;
	created_at: string;
}

export interface GitHubLabel {
	id?: number;
	name: string;
	color?: string;
	description?: string | null;
}

export interface GitHubIssue {
	id: number;
	number: number;
	title: string;
	body: string | null;
	state: 'open' | 'closed';
	state_reason?: string | null;
	labels: GitHubLabel[];
	user: GitHubUserSummary | null;
	assignee: GitHubUserSummary | null;
	assignees?: GitHubUserSummary[];
	comments: number;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	html_url: string;
	pull_request?: {
		url: string;
		html_url?: string;
		merged_at?: string | null;
	};
}

export type GitHubIssueState = 'open' | 'closed' | 'all';

export interface ListIssuesOptions {
	limit?: number;
	offset?: number;
	state?: GitHubIssueState;
	labels?: string | string[];
	sort?: 'created' | 'updated' | 'comments';
	direction?: 'asc' | 'desc';
	since?: string;
	includePullRequests?: boolean;
	signal?: AbortSignal;
}

export interface FetchTarballOptions {
	ref?: string;
	signal?: AbortSignal;
}

export interface RepositoryTarball {
	stream: ReadableStream<Uint8Array>;
	contentType: string | null;
	contentLength: number | null;
	etag: string | null;
	filename: string | null;
	url: string;
}

export interface DownloadTarballOptions extends FetchTarballOptions {
	filename?: string;
	overwrite?: boolean;
}

export interface DownloadedTarball {
	path: string;
	filename: string;
	bytes: number;
	contentType: string | null;
}
