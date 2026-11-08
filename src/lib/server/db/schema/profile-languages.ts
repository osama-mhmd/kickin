import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, primaryKey, real, text, uuid } from 'drizzle-orm/pg-core';
import { skillLevel } from './enums';
import { timestamps } from './timestamps';
import { users } from './users';

export const profileLanguages = pgTable(
	'profile_languages',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		language: text('language').notNull(),
		level: skillLevel('level').notNull(),
		years: real('years'),
		isPrimary: boolean('is_primary').notNull().default(false),
		...timestamps()
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.language] }),
		index('profile_languages_user_id_idx').on(t.userId),
		check('profile_languages_years_check', sql`${t.years} is null or ${t.years} >= 0`)
	]
);
