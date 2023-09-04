/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import {
	DiscordAPIError,
	Guild,
	GuildBan,
	Snowflake,
	TextBasedChannel,
	User,
} from 'discord.js';
import { GlobalLogger } from '@mimickal/discord-logging';

import { APP_NAME, GuildConfig } from './config';
import * as database from './database';
import { RowId } from './database';

const logger = GlobalLogger.logger;

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
			banned_at: bannedAt,
			guild_id: guildId,
			reason: reason,
			ref_ban_id: refBanId,
			user_id: user.id,
		});
	} catch (err) {
		logger.error('Failed to add ban to database', err);
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

/** Uses the reason on a ban to determine if the operation came from this bot. */
export function banCameFromThisBot(ban: GuildBan): boolean {
	// Kind of a hack, but it works.
	return ban.reason?.startsWith(APP_NAME) ?? false;
}

/**
 * Returns whether or not the guild the given ban came from has
 * broadcasting enabled.
 */
export async function banGuildHasBroadcastingEnabled(ban: GuildBan): Promise<boolean> {
	const guildConfig = await GuildConfig.for(ban.guild.id);
	return guildConfig.broadcast ?? false;
}

/** Gets the configured alert channel for the guild the given ban came from. */
export async function fetchGuildAlertChannel(ban: GuildBan): Promise<TextBasedChannel | null> {
	const guildConfig = await GuildConfig.for(ban.guild.id);
	if (!guildConfig.alertChannelId) return null;

	// Verify this is a channel we can actually send messages to.
	const alertChannel = await ban.client.channels.fetch(guildConfig.alertChannelId);
	if (!alertChannel?.isTextBased() || alertChannel.hasOwnProperty('send')) {
		throw new Error(`Invalid channel ${guildConfig.alertChannelId}`);
	}

	return alertChannel;
}
