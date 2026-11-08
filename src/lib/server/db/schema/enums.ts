import { pgEnum } from 'drizzle-orm/pg-core';

export const skillLevel = pgEnum('skill_level', ['beginner', 'intermediate', 'advanced', 'expert']);
export const analysisStatus = pgEnum('analysis_status', [
	'pending',
	'processing',
	'done',
	'failed'
]);
export const confidence = pgEnum('confidence', ['low', 'medium', 'high']);
export const issueState = pgEnum('issue_state', ['open', 'closed']);
export const repoComputationStatus = pgEnum('repo_computation_status', [
	'pending',
	'processing',
	'done',
	'failed'
]);
export const reportCategory = pgEnum('report_category', ['bug', 'abuse', 'inaccuracy', 'other']);
export const reportStatus = pgEnum('report_status', ['open', 'triaged', 'resolved', 'dismissed']);
export const incidentSeverity = pgEnum('incident_severity', ['minor', 'major', 'critical']);
export const incidentStatus = pgEnum('incident_status', [
	'investigating',
	'identified',
	'monitoring',
	'resolved'
]);
export const aiCallPurpose = pgEnum('ai_call_purpose', ['issue_analysis', 'issue_match', 'repair']);
