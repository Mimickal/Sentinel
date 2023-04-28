/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { Guild } from 'discord.js';
import { getUser, getUserBan } from './database';

interface GuildBanData {
	guild_id: string;
	user_deleted: boolean | null;
	user_id: string;
	reason: string | null;
	ban_id?: number;
	init_ban_id?: number;
	banned_date?: Date;
}

export async function getGuildBanData(
	guild: Guild, pattern?: string
): Promise<GuildBanData[]> {
	const bans: GuildBanData[] = [];

	// TODO need to batch for giant lists
	const curBans = await guild.bans.fetch();

	for await (const ban of curBans.values()) {
		if (pattern && !ban.reason?.match(pattern)) continue;

		const botBan = await getUserBan({
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
