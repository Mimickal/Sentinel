/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import * as https from 'https';

import { parseJSON as parseJsonDate } from 'date-fns';
import { Guild } from 'discord.js';

import { APP_NAME } from './config';
import { getGuildBans } from './database';

// NOTE this type is used to generate files people will download.
// Be very careful changing values here. We can't control those files once
// they're out in the wild. Try to keep them as compatible as possible.

export interface GuildBanItem {
	guild_id: string;
	user_deleted?: boolean | null;
	user_id: string;
	reason: string | null;
	ban_id?: number;
	init_ban_id?: number;
	banned_date?: Date;
}

// Hack to get typeof values https://stackoverflow.com/a/69655302
const dummy = typeof(null as any);
type TypeOf = typeof dummy;

const ASSERTIONS: Record<keyof GuildBanItem, TypeOf | TypeOf[]> = {
	guild_id: 'string',
	user_deleted: 'boolean',
	user_id: 'string',
	reason: 'string',
	ban_id: ['undefined', 'number'],
	init_ban_id: ['undefined', 'number'],
	banned_date: ['undefined', 'number', 'string'],
}
const NULLABLE: (keyof GuildBanItem)[] = ['user_deleted', 'reason'];

// Validates that the given data actually conforms to the above type assertions.
//
// This data comes from the internet, so we need more than TypeScript's static
// type checker here.
//
// Also, it's user-uploaded data, so we need to be extra-sure it's valid.
function validateBanItems(items: GuildBanItem[]): void {
	if (!Array.isArray(items)) throw new Error('JSON is not an array');

	items.forEach((item, idx) => {

		// Validate values are the proper type
		(Object.keys(item) as (keyof GuildBanItem)[]).forEach(key => {
			const value = item[key];
			const expectedType = ASSERTIONS[key];
			const prefix = `ban[${idx}].${key}`;

			if (value === null && NULLABLE.includes(key as keyof GuildBanItem))
				return; // Check next key

			if (Array.isArray(expectedType)) {
				if (!expectedType.includes(typeof value))
					throw new Error(`${prefix} must be one of: ${expectedType.join(', ')}`);
			} else if (expectedType !== typeof value)
				throw new Error(`${prefix} must be a ${expectedType}`);
		});

		// Validate values make sense
		if (item.init_ban_id && item.ban_id === item.init_ban_id)
			throw new Error(`ban[${idx}] ban_id cannot equal init_ban_id`);
	});
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
	return (await getGuildBans(guild.id))
		.filter(ban => pattern ? ban.reason?.match(pattern) : true)
		.map(ban => ({
			ban_id: ban.id,
			banned_date: ban.banned_at,
			guild_id: ban.guild_id,
			init_ban_id: ban.ref_ban_id,
			reason: ban.reason || null,
			user_id: ban.user_id,
		}));
}

/**
 * Downloads and validates a ban list from a JSON file.
 */
export async function downloadGuildBanItems(url: string): Promise<GuildBanItem[]> {
	const banItems = await httpGet(url);
	validateBanItems(banItems);

	// Dates need to be deserialized from JSON
	return banItems.map(item => ({
		...item,
		banned_date: item.banned_date ? parseJsonDate(item.banned_date) : undefined,
	}));
}

/**
 * Generates a standard ban list filename from a Guild's ID.
 */
export function banFileName(guild: Guild): string {
	return `${APP_NAME}-${guild.id}_${new Date().toISOString().split('T')[0]}.json`;
}

/**
 * Extremely minimal wrapper around https that enables one-line,
 * Promise-friendly HTTP requests.
 *
 * Why this isn't part of the standard library is beyond me.
 */
async function httpGet(url: string): Promise<GuildBanItem[]> {
	return new Promise((resolve, reject) => {
		https.get(url, response => {
			const buffers: any[] = [];
			response.on('data', buffer => buffers.push(buffer));
			response.on('error', reject);
			response.on('end', () => {
				const data = Buffer.concat(buffers).toString();
				response.statusCode === 200
					? resolve(JSON.parse(data))
					: reject(data)
			});
		});
	});
}
