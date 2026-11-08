import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './timestamps';
import { users } from './users';

export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		userAgent: text('user_agent'),
		ipHash: text('ip_hash'),
		...timestamps()
	},
	(t) => [
		index('sessions_user_id_idx').on(t.userId),
		index('sessions_expires_at_idx').on(t.expiresAt)
	]
);
