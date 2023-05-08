/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { parseJSON as parseJsonDate } from 'date-fns';
import { Snowflake } from 'discord.js';

import { GuildConfigKey } from '../config';
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
	banned_at?: Date;
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
	key: GuildConfigKey;
	value: string | null;
}

export interface GuildRow {
	id: Snowflake;
	joined_at?: Date | null;
	name?: string | null;
}

export interface UserRow {
	created_at: Date;
	deleted: boolean;
	id: Snowflake;
}

// Row type constraints for individual operations
type AddBanRow = Omit<BanRow, 'id'>;
type AddUserRow = Omit<UserRow, 'deleted'>;
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

export async function getBan(ban: FetchBanRow): Promise<BanRow|undefined> {
	const row = await knex<BanRow>(Tables.BANS)
		.first()
		.where(ban);
	return parseDates(row, ['banned_at']);
}

export async function getGuildBans(guildId: Snowflake): Promise<BanRow[]> {
	return await knex<BanRow>(Tables.BANS)
		.select()
		.where('guild_id', '=', guildId);
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

export async function getGuild(guildId: Snowflake): Promise<GuildRow|undefined> {
	const row = await knex<GuildRow>(Tables.GUILDS)
		.first()
		.where('id', '=', guildId);
	return parseDates(row, ['joined_at']);
}

export async function getGuilds(): Promise<GuildRow[]> {
	const guildRows = await knex<GuildRow>(Tables.GUILDS)
		.select();
	return guildRows.map(row => parseDates(row, ['joined_at'])!)
}

export async function upsertGuild(guild: GuildRow): Promise<void> {
	await knex<GuildRow>(Tables.GUILDS)
		.insert(guild)
		.onConflict('id').merge();
}

export async function addUser(user: AddUserRow): Promise<void> {
	await knex<AddUserRow>(Tables.USERS)
		.insert(user)
		.onConflict('id').ignore();
}

export async function getUser(id: Snowflake): Promise<UserRow | undefined> {
	const row = await knex<UserRow>(Tables.USERS)
		.first()
		.where('id', '=', id);
	return parseDates(row, ['created_at']);
}

export async function getUndeletedUsers(): Promise<UserRow[]> {
	return await knex<UserRow>(Tables.USERS)
		.select()
		.where('deleted', '=', false);
}

export async function setUserDeleted(userId: Snowflake): Promise<void> {
	await knex<UserRow>(Tables.USERS)
		.update('deleted', true)
		.where('id', '=', userId);
}

export async function clearDataForGuild(guildId: Snowflake): Promise<void> {
	await knex<BanRow>(Tables.BANS)
		.delete()
		.where('guild_id', '=', guildId);

	await knex<ConfigRow>(Tables.CONFIG)
		.delete()
		.where('guild_id', '=', guildId);

	await knex<GuildRow>(Tables.GUILDS)
		.delete()
		.where('id', '=', guildId);
}

// Fields in T with (possibly optional) Date https://stackoverflow.com/a/49752227
type DateKey<T> = keyof {
	[K in keyof T as T[K] extends (Date | null | undefined) ? K : never]: any
}

/** Converts columns containing date data to actual {@link Date} objects. */
function parseDates<T>(
	row: T | undefined,
	dateKeys: DateKey<T>[]
): T | undefined {
	if (!row) return;

	dateKeys.forEach(key => {
		// These are the possible values of a date column in the database.
		const value = row[key] as number | string | null | undefined;

		if (value != null) { // Intentional loose equality
			// @ts-ignore The constraint on key makes this a safe assignment.
			row[key] = parseJsonDate(value);
		}
	});

	return row;
}
