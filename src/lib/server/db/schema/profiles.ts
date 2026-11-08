import { sql } from 'drizzle-orm';
import { check, pgTable, real, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './timestamps';
import { users } from './users';

export const profiles = pgTable(
	'profiles',
	{
		userId: uuid('user_id')
			.primaryKey()
			.references(() => users.id, { onDelete: 'cascade' }),
		headline: text('headline'),
		hoursPerWeek: smallint('hours_per_week'),
		timezone: text('timezone'),
		professionalYears: real('professional_years'),
		opensourceYears: real('opensource_years'),
		onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
		...timestamps()
	},
	(t) => [
		check(
			'profiles_hours_per_week_check',
			sql`${t.hoursPerWeek} is null or ${t.hoursPerWeek} between 0 and 168`
		),
		check(
			'profiles_professional_years_check',
			sql`${t.professionalYears} is null or ${t.professionalYears} >= 0`
		),
		check(
			'profiles_opensource_years_check',
			sql`${t.opensourceYears} is null or ${t.opensourceYears} >= 0`
		)
	]
);
