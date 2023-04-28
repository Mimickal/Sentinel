/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { bold, ChannelType, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandRegistry } from 'discord-command-registry';

import { EphemReply, ErrorReply, FileReply, InfoReply } from './components';
import * as database from './database';
import { getGuildBanData } from './export';

const PACKAGE = require('../package.json');

// Ok guys, I get it. I'll port this library to TypeScript soon (TM).
export default new SlashCommandRegistry()
	.addCommand(command => command
		.setName('info')
		.setDescription(
			'Prints description, version, and link to source code for the bot'
		)
		.setHandler(cmdInfo)
	)
	.addCommand(command => command
		.setName('alert-channel')
		.setDescription('Sets the channel to send bot alerts')
		.setHandler(setAlertChannel)
		.addChannelOption(option => option
			.setName('channel')
			.setDescription('The channel to send bot alerts')
			.setRequired(true)
		)
	)
	.addCommand(command => command
		.setName('export-bans')
		.setDescription('Exports bans to a file')
		.setHandler(exportGuildBans)
		.addStringOption(option => option
			.setName('pattern')
			.setDescription('Only export bans whose reason matches this pattern. Allows regex.')
			.setRequired(false)
		)
	)
	;

/**
 * Replies with info about this bot, including a link to the source code to be
 * compliant with the AGPLv3 this bot is licensed under.
 */
async function cmdInfo(interaction: ChatInputCommandInteraction): Promise<void> {
	await interaction.reply([
		PACKAGE.description,
		`${bold('Running version:')} ${PACKAGE.version}`,
		`${bold('Source code:')} ${PACKAGE.homepage}`,
	].join('\n'));
}

/**
 * Sets a Guild's alert channel.
 */
async function setAlertChannel(interaction: ChatInputCommandInteraction): Promise<unknown> {
	if (!interaction.inGuild() && !interaction.isChatInputCommand()) return;

	const channel = interaction.options.getChannel('channel');
	if (![
		ChannelType.GuildText,
		ChannelType.PrivateThread,
		ChannelType.PublicThread,
	].includes(channel!.type)) {
		return await interaction.reply({
			content: `Cannot use channel ${channel}! Please use a text channel.`,
			ephemeral: true,
		});
	}

	try {
		await database.setGuildAlertChannel({
			id: interaction.guild!.id, // Above check guarantees guild is set.
			alert_channel_id: channel!.id,
		});
	} catch (err) {
		console.error('Failed to set Guild alert channel in database', (err as Error));
	}

	return interaction.reply(EphemReply(`Now sending alerts to ${channel}`));
}

/**
 * Exports Bans for a Guild to a JSON file, then posts it in the Guild.
 */
async function exportGuildBans(interaction: ChatInputCommandInteraction): Promise<unknown> {
	if (!interaction.inGuild() && !interaction.isChatInputCommand()) return;

	const filter = interaction.options.getString('pattern') ?? undefined;
	const guild = interaction.guild!; // Above check guarantees this value.

	console.log('Building ban list for Guild');
	await interaction.reply(InfoReply('Building ban list...'));

	try {
		const banData = await getGuildBanData(guild, filter);

		await interaction.editReply(FileReply({
			message: 'Ban list successfully exported',
			name: `banlist-${guild.id}.json`,
			data: banData,
		}));
	} catch (err) {
		console.error('Failed to build ban list', err);
		await interaction.editReply(ErrorReply(
			'Failed to build ban list. Do I have permission to read the ban list?'
		));
	}
}
