/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import * as Discord from 'discord.js';
import { createLogger, GlobalLogger } from '@mimickal/discord-logging';

import * as config from './config';

// Need to set logger before loading modules that use it.
const logger = createLogger({ filename: config.Env.logfile });
GlobalLogger.setGlobalLogger(logger);

import * as events from './events';

// Everything operates on IDs, so we can safely rely on partials.
const client = new Discord.Client({
	intents: [
		Discord.GatewayIntentBits.Guilds,
		Discord.GatewayIntentBits.GuildMembers,
		Discord.GatewayIntentBits.GuildModeration,
	],
	partials: [
		Discord.Partials.Channel,
		Discord.Partials.GuildMember,
		Discord.Partials.User,
	],
	presence: {
		activities: [{
			name: `Version ${config.Package.version}`,
			type: Discord.ActivityType.Playing,
		}],
	},
});

client.on(Discord.Events.ClientReady, events.onReady);
client.on(Discord.Events.GuildBanAdd, events.onUserBanned);
client.on(Discord.Events.GuildBanRemove, events.onUserUnbanned);
client.on(Discord.Events.GuildCreate, events.onGuildJoin);
client.on(Discord.Events.GuildDelete, events.onGuildLeave);
client.on(Discord.Events.InteractionCreate, events.onInteraction);
client.on(Discord.Events.MessageCreate, events.testMessage);

logger.info(`Bot is starting with config: ${JSON.stringify({
	...config.Env,
	token: '<REDACTED>',
})}`);

client.login(config.Env.token).catch(err => {
	logger.error('Failed to log in!', err);
	process.exit(1);
});
