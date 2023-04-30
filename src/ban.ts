/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { DiscordAPIError, Guild, Snowflake, User } from 'discord.js';

import * as database from './database';
import { RowId } from './database';

/** Adds a Ban and an associated User to the database, logging any errors. */
export async function recordUserBan({ bannedAt, guildId, reason, refBanId, user }: {
	guildId: Snowflake;
	user: User;
	bannedAt?: Date;
	reason?: string | null;
	refBanId?: RowId;
}): Promise<RowId> {
	try {
		await database.addUser({
			created_at: user.createdAt,
			id: user.id,
		});

		return await database.addBan({
			banned_at: bannedAt ?? new Date(Date.now()),
			guild_id: guildId,
			reason: reason,
			ref_ban_id: refBanId,
			user_id: user.id,
		});
	} catch (err) {
		console.error('Failed to add ban to database', err);
		throw err;
	}
}

/**
 * Bans the given User in the given Guild, and persists the ban to the database.
 * We issue these bans, so typing is a little more restrictive
 * (e.g. `reason` is required).
 *
 * @reject {@link DiscordAPIError} if we fail to do the ban in Discord,
 * otherwise whatever Knex throws for failed queries.
 */
export async function banUser({ guild, reason, refBanId, user }: {
	guild: Guild;
	reason: string;
	user: User;
	refBanId?: RowId;
}): Promise<RowId> {
	await guild.bans.create(user.id, { reason });

	return await recordUserBan({
		bannedAt: new Date(Date.now()),
		guildId: guild.id,
		reason: reason,
		refBanId: refBanId,
		user: user,
	});
}
