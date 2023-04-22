/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
const commands = require('./commands');

/**
 * Event handler for when the bot is logged in.
 *
 * Logs the bot user we logged in as.
 */
async function onReady(client) {
	console.info(`Logged in as ${client.user.tag} (${client.user.id})`);
}

/**
 * Event handler for receiving some kind of interaction.
 * Logs the interaction and passes it on to the command handler.
 */
async function onInteraction(interaction) {
	//console.info(`Received ${detail(interaction)}`);
	console.info('Received interaction');

	try {
		await commands.execute(interaction);
	} catch (err) {
		//logger.error(`${detail(interaction)} error fell through:`, err);
		console.info('Interaction error fell through:', err);
	}
}

module.exports = {
	onReady,
	onInteraction,
};
