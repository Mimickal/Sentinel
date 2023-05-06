/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { Snowflake } from 'discord.js';

import * as database from '../database';

export type GuildConfigKey = 'alertChannelId' | 'broadcast';
type ConfRecord = Map<GuildConfigKey, string | null>;

/** Bot configuration for an individual Guild. */
export default class GuildConfig {
	static async for(guildId: Snowflake) {
		const configRows = await database.getGuildConfig(guildId);
		return new GuildConfig(guildId, configRows.reduce<ConfRecord>(
			(map, row) => map.set(row.key, row.value),
			new Map()
		));
	}

	#_alertChannelId: Snowflake | null;
	#_broadcast: boolean;
	#_guildId: Snowflake;

	private constructor(guildId: Snowflake, config: ConfRecord) {
		this.#_guildId = guildId;
		this.#_alertChannelId = config.get('alertChannelId') as string ?? null;
		this.#_broadcast = config.get('broadcast') === 'true';
	}

	// NOTE: guildId is transient and read-only, so no "set guildId(...)"
	get guildId(): Snowflake {
		return this.#_guildId;
	}

	// DANGER ZONE:
	// These property names are used as values in the database.
	// Changing these names will also require a database migration!

	get alertChannelId(): Snowflake | null {
		return this.#_alertChannelId;
	}

	get broadcast(): boolean | null {
		return this.#_broadcast;
	}

	// END DANGER ZONE

	static async setAlertChannel(
		guildId: Snowflake,
		channel: Snowflake | null | undefined
	): Promise<void> {
		return database.setGuildConfigValue({
			guild_id: guildId,
			key: 'alertChannelId',
			value: channel ?? null,
		});
	}

	async setAlertChannel(channel: Snowflake | null | undefined): Promise<void> {
		const channelId = channel ?? null;
		this.#_alertChannelId = channelId;
		return GuildConfig.setAlertChannel(this.guildId, channelId);
	}

	static async setBroadcast(
		guildId: Snowflake,
		broadcast: boolean,
	): Promise<void> {
		return database.setGuildConfigValue({
			guild_id: guildId,
			key: 'broadcast',
			value: broadcast.toString(),
		});
	}

	async setBroadcast(broadcast: boolean): Promise<void> {
		this.#_broadcast = broadcast;
		return GuildConfig.setBroadcast(this.guildId, broadcast);
	}
}
