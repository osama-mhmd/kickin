import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	index,
	integer,
	pgTable,
	text,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { timestamps } from './timestamps';

export const repositories = pgTable(
	'repositories',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		githubId: bigint('github_id', { mode: 'number' }).notNull(),
		owner: text('owner').notNull(),
		name: text('name').notNull(),
		defaultBranch: text('default_branch'),
		language: text('language'),
		stars: integer('stars'),
		sizeKb: integer('size_kb'),
		isPrivate: boolean('is_private').notNull().default(false),
		...timestamps()
	},
	(t) => [
		uniqueIndex('repositories_github_id_idx').on(t.githubId),
		uniqueIndex('repositories_owner_name_idx').on(sql`lower(${t.owner})`, sql`lower(${t.name})`),
		index('repositories_language_idx').on(t.language)
	]
);
