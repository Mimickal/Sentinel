/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { Snowflake } from 'discord.js';

import { ConfigKey } from '../guildconf';
import knex from './knex_env';

enum Tables {
	BANS = 'bans',
	CONFIG = 'config',
	GUILDS = 'guilds',
	USERS = 'users',
}

// Type aliases for clarity
export type RowId = number;

// Database row types
export interface BanRow {
	banned_at: Date;
	banned_by?: Snowflake;
	guild_id: Snowflake;
	id: RowId;
	reason?: string | null;
	ref_ban_id?: number;
	user_id: Snowflake;
}

export interface ConfigRow {
	id: RowId;
	guild_id: Snowflake;
	key: ConfigKey;
	value: string | null;
}

export interface GuildRow {
	id: Snowflake;
	joined_at: Date;
	left_at?: Date | null;
	name: string;
}

export interface UserRow {
	created_at: Date;
	deleted: boolean;
	id: Snowflake;
}

// Row type constraints for individual operations
type AddBanRow = Omit<BanRow, 'id'>;
type AddUserRow = Omit<UserRow, 'deleted'>;
type DeletedUserRow = Omit<UserRow, 'created_at'> & Partial<UserRow>;
type LeftGuildRow = Pick<GuildRow, 'id'|'left_at'>;
type FetchBanRow = Pick<BanRow, 'guild_id'|'user_id'> | Pick<BanRow, 'id'>;
type SetConfigRow = Omit<ConfigRow, 'id'>;

export async function addBan(ban: AddBanRow): Promise<number> {
	const returned = await knex<BanRow>(Tables.BANS)
		.insert({
			...ban,
			reason: ban.reason || undefined, // Avoids empty strings
		})
		.returning('id')
		.onConflict(['guild_id', 'user_id']).merge();
	return returned[0].id;
}

export async function getUserBan(ban: FetchBanRow): Promise<BanRow|undefined> {
	return knex<BanRow>(Tables.BANS)
		.first()
		.where(ban);
}

export async function removeBan(ban: FetchBanRow): Promise<void> {
	await knex<FetchBanRow>(Tables.BANS)
		.delete()
		.where(ban);
}

export async function getGuildConfig(id: Snowflake): Promise<ConfigRow[]> {
	return await knex<ConfigRow>(Tables.CONFIG)
		.select()
		.where('guild_id', '=', id);
}

export async function setGuildConfigValue(config: SetConfigRow): Promise<void> {
	await knex<SetConfigRow>(Tables.CONFIG)
		.insert(config)
		.onConflict(['guild_id', 'key']).merge();
}

export async function getGuilds(): Promise<GuildRow[]> {
	return knex<GuildRow>(Tables.GUILDS)
		.select();
}

export async function upsertGuild(guild: GuildRow): Promise<void> {
	await knex<GuildRow>(Tables.GUILDS)
		.insert(guild)
		.onConflict('id').merge();
}

export async function setGuildLeft(guild: LeftGuildRow): Promise<void> {
	await knex<LeftGuildRow>(Tables.GUILDS)
		.update('left_at', guild.left_at)
		.where('id', '=', guild.id);
}

export async function addUser(user: AddUserRow): Promise<void> {
	await knex<AddUserRow>(Tables.USERS)
		.insert(user)
		.onConflict('id').ignore();
}

export async function getUser(id: Snowflake): Promise<UserRow | undefined> {
	return knex<UserRow>(Tables.USERS)
		.first()
		.where('id', '=', id);
}

export async function setUserDeleted(user: DeletedUserRow): Promise<void> {
	await knex<DeletedUserRow>(Tables.USERS)
		.update('deleted', user.deleted)
		.where('id', '=', user.id);
}
