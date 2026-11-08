import { bigint, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './timestamps';
import { users } from './users';

export const githubAccounts = pgTable(
	'github_accounts',
	{
		userId: uuid('user_id')
			.primaryKey()
			.references(() => users.id, { onDelete: 'cascade' }),
		githubId: bigint('github_id', { mode: 'number' }).notNull(),
		accessToken: text('access_token').notNull(),
		refreshToken: text('refresh_token'),
		tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
		scope: text('scope'),
		...timestamps()
	},
	(t) => [uniqueIndex('github_accounts_github_id_idx').on(t.githubId)]
);
