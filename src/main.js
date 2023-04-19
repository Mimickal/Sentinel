/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
const Discord = require('discord.js');

const events = require('./events');

const CONFIG = require('../dev-config.json');
const PACKAGE = require('../package.json');

// Everything operates on IDs, so we can safely rely on partials.
const client = new Discord.Client({
	intents: [
		Discord.GatewayIntentBits.Guilds,
		Discord.GatewayIntentBits.GuildMembers,
		Discord.GatewayIntentBits.GuildMessages,
	],
	partials: [
		Discord.Partials.Channel,
		Discord.Partials.GuildMember,
		Discord.Partials.User,
	],
	presence: {
		activities: [{
			name: `Version ${PACKAGE.version}`,
			type: Discord.Activity.PLAYING,
		}],
	},
});

client.on(Discord.Events.ClientReady, events.onReady);

console.info(`Bot is starting with config: ${JSON.stringify({
	...CONFIG,
	token: '<REDACTED>',
})}`);

client.login(CONFIG.token).catch(err => {
	console.error('Failed to log in!', err);
	process.exit(1);
});
