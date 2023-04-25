/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import knex from './knex_env';

enum Tables {
	BANS = 'bans',
	GUILDS = 'guilds',
	USERS = 'users',
}

export type Snowflake = string;

export interface BanRow {
	banned_at: Date;
	banned_by?: Snowflake;
	guild_id: Snowflake;
	id: number; // NOTE: Database row ID, not Discord ID.
	reason?: string;
	user_id: Snowflake;
}

export interface GuildRow {
	alert_channel_id?: Snowflake;
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

type AddBanRow = Omit<BanRow, 'id'>;
type AlertGuildRow = Required<Pick<GuildRow, 'id'|'alert_channel_id'>>;
type DeletedUserRow = Omit<UserRow, 'created_at'> & Partial<UserRow>;
type LeftGuildRow = Pick<GuildRow, 'id'|'left_at'>;
type RemoveBanRow = Pick<BanRow, 'guild_id'|'user_id'> | Pick<BanRow, 'id'>;

export async function addBan(ban: AddBanRow): Promise<void> {
	await knex<AddBanRow>(Tables.BANS)
		.insert(ban);
}

export async function removeBan(ban: RemoveBanRow): Promise<void> {
	await knex<RemoveBanRow>(Tables.BANS)
		.delete()
		.where(ban);
}

export async function upsertGuild(guild: GuildRow): Promise<void> {
	await knex<GuildRow>(Tables.GUILDS)
		.insert(guild)
		.onConflict('id').merge();
}

export async function setGuildAlertChannel(guild: AlertGuildRow): Promise<void> {
	await knex<AlertGuildRow>(Tables.GUILDS)
		.update('alert_channel_id', guild.alert_channel_id)
		.where('id', '=', guild.id);
}

export async function setGuildLeft(guild: LeftGuildRow): Promise<void> {
	await knex<LeftGuildRow>(Tables.GUILDS)
		.update('left_at', guild.left_at)
		.where('id', '=', guild.id);
}

export async function addUser(user: UserRow): Promise<void> {
	await knex<UserRow>(Tables.USERS)
		.insert(user)
		.onConflict('id').ignore();
}

export async function setUserDeleted(user: DeletedUserRow): Promise<void> {
	await knex<DeletedUserRow>(Tables.USERS)
		.update('deleted', user.deleted)
		.where('id', '=', user.id);
}
