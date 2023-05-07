/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { Client, DiscordAPIError, Snowflake } from 'discord.js';
import { GlobalLogger } from '@mimickal/discord-logging';

import { getUndeletedUsers, setUserDeleted } from './database';

const logger = GlobalLogger.logger;

/**
 * Checks every User in our database against Discord's API to see if their
 * account has been deleted. If so, update our database record.
 */
export async function checkForDeletedUsers(client: Client): Promise<void> {
	if (!client.isReady()) {
		logger.warn('Attempted to run deleted user check before client was ready');
		return;
	}
	logger.info('Running scan for deleted users');

	for await (const userRow of await getUndeletedUsers()) {
		try {
			if (await isUserDeleted(client, userRow.id)) {
				await setUserDeleted(userRow.id);
				logger.info(`Marked User ${userRow.id} as deleted`);
			}
		} catch (err) {
			logger.error(`Failed to mark User ${userRow.id} as deleted`, err);
		}
	}

	logger.info('Finished deleted user scan');
}

/**
 * Discord's API doesn't give us a good way to know if an account is deleted or
 * not, so we need to figure it out ourselves.
 *
 * Older deleted accounts would return an actual error when force fetched.
 * Newer deleted accounts return successfully, so we need to fall back on
 * reading the username instead.
 */
async function isUserDeleted(client: Client, userId: Snowflake): Promise<boolean> {
	try {
		const user = await client.users.fetch(userId, { force: true });
		return !!user.username.match(/Deleted User [a-f0-9]{8}/);
	} catch (e) {
		const err = e as DiscordAPIError;
		if (err instanceof DiscordAPIError && err.message.includes('Unknown User')) {
			return true;
		} else {
			throw e;
		}
	}
}
