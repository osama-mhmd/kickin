import { relations } from 'drizzle-orm';
import { aiCalls } from './ai-calls';
import { githubAccounts } from './github-accounts';
import { issueAnalyses } from './issue-analyses';
import { issueMatches } from './issue-matches';
import { issues } from './issues';
import { profileLanguages } from './profile-languages';
import { profiles } from './profiles';
import { repoComputations } from './repo-computations';
import { repositories } from './repositories';
import { reports } from './reports';
import { sessions } from './sessions';
import { users } from './users';

export const usersRelations = relations(users, ({ one, many }) => ({
	githubAccount: one(githubAccounts, {
		fields: [users.id],
		references: [githubAccounts.userId]
	}),
	profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
	languages: many(profileLanguages),
	sessions: many(sessions),
	issueMatches: many(issueMatches),
	reports: many(reports)
}));

export const githubAccountsRelations = relations(githubAccounts, ({ one }) => ({
	user: one(users, { fields: [githubAccounts.userId], references: [users.id] })
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] })
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
	user: one(users, { fields: [profiles.userId], references: [users.id] })
}));

export const profileLanguagesRelations = relations(profileLanguages, ({ one }) => ({
	user: one(users, { fields: [profileLanguages.userId], references: [users.id] })
}));

export const repositoriesRelations = relations(repositories, ({ many }) => ({
	computations: many(repoComputations),
	issues: many(issues),
	reports: many(reports)
}));

export const repoComputationsRelations = relations(repoComputations, ({ one, many }) => ({
	repository: one(repositories, {
		fields: [repoComputations.repositoryId],
		references: [repositories.id]
	}),
	analyses: many(issueAnalyses)
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
	repository: one(repositories, {
		fields: [issues.repositoryId],
		references: [repositories.id]
	}),
	analyses: many(issueAnalyses),
	matches: many(issueMatches),
	reports: many(reports)
}));

export const issueAnalysesRelations = relations(issueAnalyses, ({ one, many }) => ({
	issue: one(issues, { fields: [issueAnalyses.issueId], references: [issues.id] }),
	repoComputation: one(repoComputations, {
		fields: [issueAnalyses.repoComputationId],
		references: [repoComputations.id]
	}),
	matches: many(issueMatches),
	aiCalls: many(aiCalls),
	reports: many(reports)
}));

export const issueMatchesRelations = relations(issueMatches, ({ one, many }) => ({
	user: one(users, { fields: [issueMatches.userId], references: [users.id] }),
	issue: one(issues, { fields: [issueMatches.issueId], references: [issues.id] }),
	analysis: one(issueAnalyses, {
		fields: [issueMatches.issueAnalysisId],
		references: [issueAnalyses.id]
	}),
	aiCalls: many(aiCalls)
}));

export const reportsRelations = relations(reports, ({ one }) => ({
	user: one(users, { fields: [reports.userId], references: [users.id] }),
	issue: one(issues, { fields: [reports.issueId], references: [issues.id] }),
	repository: one(repositories, {
		fields: [reports.repositoryId],
		references: [repositories.id]
	}),
	issueAnalysis: one(issueAnalyses, {
		fields: [reports.issueAnalysisId],
		references: [issueAnalyses.id]
	})
}));

export const aiCallsRelations = relations(aiCalls, ({ one }) => ({
	issueAnalysis: one(issueAnalyses, {
		fields: [aiCalls.issueAnalysisId],
		references: [issueAnalyses.id]
	}),
	issueMatch: one(issueMatches, {
		fields: [aiCalls.issueMatchId],
		references: [issueMatches.id]
	})
}));
