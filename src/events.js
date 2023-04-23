/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
const {
	GuildBan,
	Message,
} = require('discord.js');

const commands = require('./commands');
const { BanEmbed, BanButton } = require('./components');

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

/**
 * Event handler for a Guild Member being banned.
 * @param {GuildBan} ban
 */
async function onMemberBanned(ban) {

}

/**
 * Event handler for a Guild Member being unbanned.
 * @param {GuildBan} ban
 */
async function onMemberUnbanned(ban) {

}

/**
 * This is for testing, because sending a message is much easier than banning.
 * @param {Message} message
 */
async function testMessage(message) {
	if (
		message.channel.id !== '186930896606199808' &&
		message.author.id !== '139881327469002752'
	) return;
	console.log('Running test event');

	const channel = message.channel;

	const info = new BanEmbed({
		ban: {
			user: message.author,
			guild: message.guild,
		},
		timestamp: message.createdAt,
	});

	const banBtn = new BanButton();

	await channel.send({
		embeds: [info],
		components: [banBtn],
	});
}

module.exports = {
	onReady,
	onInteraction,
	onMemberBanned,
	onMemberUnbanned,

	testMessage,
};
