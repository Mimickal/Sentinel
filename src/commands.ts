/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import {
	bold,
	ChannelType,
	ChatInputCommandInteraction,
	PermissionFlagsBits,
} from 'discord.js';
import { SlashCommandRegistry } from 'discord-command-registry';

import { EphemReply, ErrorMsg, FileReply, GoodMsg, InfoMsg } from './components';
import { APP_NAME, GuildConfig } from './config';

type Handler = (interaction: ChatInputCommandInteraction) => Promise<void>;

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
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
		.setHandler(requireInGuild(setAlertChannel))
		.addChannelOption(option => option
			.setName('channel')
			.setDescription('The channel to send bot alerts')
			.setRequired(true)
		)
	)
	.addCommand(command => command
		.setName('export-bans')
		.setDescription('Exports bans to a file')
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
		.setHandler(requireInGuild(exportGuildBans))
		.addStringOption(option => option
			.setName('pattern')
			.setDescription('Only export bans whose reason matches this pattern. Allows regex.')
			.setRequired(false)
		)
	)

/** Middleware that ensures an interaction is a chat slash command in a Guild. */
function requireInGuild(func: Handler): Handler {
	return async (interaction) => {
		if (!interaction.inGuild() && !interaction.isChatInputCommand()) return;

		return func(interaction);
	};
}

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
async function setAlertChannel(interaction: ChatInputCommandInteraction): Promise<void> {
	const channel = interaction.options.getChannel('channel');
	if (![
		ChannelType.GuildText,
		ChannelType.PrivateThread,
		ChannelType.PublicThread,
	].includes(channel!.type)) {
		await interaction.reply(EphemReply(ErrorMsg(
			`Cannot use channel ${channel}! Please use a text channel.`
		)));
		return;
	}

	try {
		// Above check guarantees these values are defined
		await GuildConfig.setAlertChannel(interaction.guild!.id, channel!.id)
	} catch (err) {
		console.error('Failed to set Guild alert channel in database', (err as Error));
		await interaction.reply(EphemReply(ErrorMsg(
			`Failed to set alert channel. Try again?`,
		)));
		return;
	}

	await interaction.reply(GoodMsg(`Now sending alerts to ${channel}`));
}

/**
 * Exports Bans for a Guild to a JSON file, then posts it in the Guild.
 */
async function exportGuildBans(interaction: ChatInputCommandInteraction): Promise<void> {
	const filter = interaction.options.getString('pattern') ?? undefined;
	const guild = interaction.guild!; // Above check guarantees this value.

	console.log('Building ban list for Guild');
	await interaction.reply(InfoMsg('Building ban list...'));

	try {
		const banData = await getGuildBanData(guild, filter);

		await interaction.editReply(FileReply({
			content: GoodMsg('Ban list successfully exported'),
			name: `banlist-${guild.id}.json`,
			data: banData,
		}));
	} catch (err) {
		console.error('Failed to build ban list', err);
		await interaction.editReply(ErrorMsg(
			'Failed to build ban list. Do I have permission to read the ban list?'
		));
	}
}
