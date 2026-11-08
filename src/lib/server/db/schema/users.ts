import { sql } from 'drizzle-orm';
import { bigint, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './timestamps';

export const users = pgTable(
	'users',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		githubId: bigint('github_id', { mode: 'number' }).notNull(),
		githubLogin: text('github_login').notNull(),
		name: text('name'),
		email: text('email'),
		avatarUrl: text('avatar_url'),
		lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
		...timestamps()
	},
	(t) => [
		uniqueIndex('users_github_id_idx').on(t.githubId),
		uniqueIndex('users_github_login_idx').on(sql`lower(${t.githubLogin})`)
	]
);
