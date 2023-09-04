/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import {
	Collection,
	GuildBan,
	GuildBanManager,
	Message,
	MessageManager,
	Snowflake,
} from 'discord.js';

/**
 * Discord.js Snowflakes are also sort-of timestamps,
 * so this is the oldest possible ID.
 */
const BEGINNING_OF_TIME = '0';
/** Highest safe fetch limit across supported types. */
const DEFAULT_BATCH_SIZE = 100 as const;

type FetchOptions = {
	/** Fetch things after (*but not including*) this ID. */
	after?: Snowflake;
	/** Fetch things before (*but not including*) this ID. */
	before?: Snowflake;
	/** Things to return per fetch. Defaults to {@link DEFAULT_BATCH_SIZE}. */
	limit?: number;
	/** Read from oldest thing first, instead of default newest first. */
	reverse?: boolean;
	/** TOTAL number of returned things. If undefined, returns *everything*. */
	totalLimit?: number;

};
type Fetchable<R> = {
	fetch: (options?: FetchOptions) => Promise<Collection<Snowflake, R>>;
};

/**
 * Utility for automatically fetching paginated data with fetch limits.
 * Yields one item at a time, by default starting with newest first.
 *
 * @param manager A Discord.js `CachedManager` that implements `fetch`.
 * - {@link GuildBanManager} (for {@link GuildBan}s)
 * - {@link MessageManager} (for {@link Message}s)
 * @param options Optional flags to constrain the fetch.
 *
 * @note This is not needed for the following, which fetch all records by default:
 * - Channels
 * - Commands
 * - Emojis
 * - Invites
 * - Members
 * - Roles
 */
export async function* fetchAll<
	R, F extends Fetchable<R> = Fetchable<R>,
>(manager: F, options?: FetchOptions): AsyncGenerator<R> {
	// Limit must be defined or else some managers call the wrong version of fetch.
	const limit: number = (options?.limit ?? 1) > DEFAULT_BATCH_SIZE
		? DEFAULT_BATCH_SIZE
		: options?.limit ?? DEFAULT_BATCH_SIZE;

	let cursor = options?.reverse
		? (options?.after ?? BEGINNING_OF_TIME)
		: options?.before; // Implicitly defaults to "most recent".
	let page: Collection<Snowflake, R>;
	let totalGot = 0;

	do {
		page = await manager.fetch({
			limit: limit,
			...(options?.reverse
				? { after: cursor,         before: options.before }
				: { after: options?.after, before: cursor }
			),
		});

		if (options?.reverse)
			page = page.reverse();

		for (const item of page.values()) {
			yield item;

			totalGot++;
			if (totalGot === options?.totalLimit) return;
		}

		cursor = page.lastKey();
	} while (page.size === limit);
}

/**
 * Resolves a Promise and ignores any error it might throw.
 * This is useful because Discord.js throws an error when you try to do things
 * like fetching a ban for a user that isn't banned. For our purposes, it's
 * better to have `undefined` instead.
 */
export async function ignoreError<T>(func: () => Promise<T>): Promise<T | undefined> {
	try {
		return await func();
	} catch {}
}
