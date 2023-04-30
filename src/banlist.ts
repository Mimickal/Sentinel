/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { Guild } from 'discord.js';

import { getUser, getBan } from './database';

// NOTE this type is used to generate files people will download.
// Be very careful changing values here. We can't control those files once
// they're out in the wild. Try to keep them as compatible as possible.

export interface GuildBanItem {
	guild_id: string;
	user_deleted: boolean | null;
	user_id: string;
	reason: string | null;
	ban_id?: number;
	init_ban_id?: number;
	banned_date?: Date;
}

/**
 * Builds a ban list from the given Guild's ban information.
 *
 * This list is cross-checked with our own database to add additional info
 * where possible, such as ban date (which isn't included from Discord, for
 * some crazy reason).
 */
export async function buildGuildBanItems(
	guild: Guild, pattern?: string
): Promise<GuildBanItem[]> {
	const bans: GuildBanItem[] = [];

	// TODO need to batch for giant lists
	const curBans = await guild.bans.fetch();

	for await (const ban of curBans.values()) {
		if (pattern && !ban.reason?.match(pattern)) continue;

		const botBan = await getBan({
			guild_id: guild.id,
			user_id: ban.user.id,
		});
		const userRow = await getUser(ban.user.id);

		bans.push({
			guild_id: guild.id,
			user_deleted: userRow?.deleted ?? null,
			user_id: ban.user.id,
			ban_id: botBan?.id,
			banned_date: botBan?.banned_at,
			init_ban_id: botBan?.ref_ban_id,
			reason: ban.reason || null,
		});
	}

	return bans;
}
