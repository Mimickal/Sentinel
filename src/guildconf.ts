/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/

// TODO rename this and put it in config/ with config.ts

import { Snowflake } from 'discord.js';

import * as database from './database';

/**
 * Bot configuration for an individual Guild.
 *
 * Persists config changes to the database in the background. This allows
 * config to be accessed and set synchronously.
 */
export default class GuildConfig {
	static async for(guildId: Snowflake) {
		const config = await database.getGuildConfig(guildId);
		return new GuildConfig(guildId, config);
	}

	#_alertChannelId: Snowflake | null;
	#_guildId: Snowflake;

	private constructor(
		guildId: Snowflake,
		config: Record<keyof Omit<GuildConfig, 'guildId'>, string>
	) {
		this.#_guildId = guildId;
		this.#_alertChannelId = config.alertChannelId;
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

	// END DANGER ZONE

	setAlertChannel(channel: Snowflake | null | undefined) {
		const channelId = channel ?? null;
		this.#_alertChannelId = channelId;
		void this.dispatch('alertChannelId', channelId);
	}

	/** Persists guild configuration changes to the database. */
	private async dispatch(key: keyof GuildConfig, value: string | null) {
		try {
			await database.setGuildConfigValue({
				guild_id: this.guildId,
				key: key,
				value: value,
			});
		} catch (err) {
			console.error(`Failed to persist config "${key}" in Guild ${this.guildId}`, err);
		}
	}
}
