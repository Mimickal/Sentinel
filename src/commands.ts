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
	DiscordAPIError,
	PermissionFlagsBits,
	Snowflake,
	userMention,
} from 'discord.js';
// @ts-ignore
import { SlashCommandRegistry } from 'discord-command-registry';

import { banUser } from './ban';
import {
	banFileName,
	buildGuildBanItems,
	downloadGuildBanItems,
	GuildBanItem,
 } from './banlist';
import { EphemReply, ErrorMsg, FileReply, GoodMsg, InfoMsg } from './components';
import { APP_NAME, GuildConfig, Package } from './config';

type Handler = (interaction: ChatInputCommandInteraction) => Promise<void>;

// Ok guys, I get it. I'll port this library to TypeScript soon (TM).
export default new SlashCommandRegistry()
	// @ts-ignore
	.addCommand(command => command
		.setName('info')
		.setDescription(
			'Prints description, version, and link to source code for the bot'
		)
		.setHandler(cmdInfo)
	)
	// @ts-ignore
	.addCommand(command => command
		.setName('config')
		.setDescription('Change some configuration for the bot')
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
		// @ts-ignore
		.addSubcommand(subcommand => subcommand
			.setName('alert-channel')
			.setDescription('Sets the channel to send bot alerts')
			.setHandler(requireInGuild(setAlertChannel))
			// @ts-ignore
			.addChannelOption(option => option
				.setName('channel')
				.setDescription('The channel to send bot alerts')
				.setRequired(true)
			)
		)
	)
	// @ts-ignore
	.addCommand(command => command
		.setName('export-bans')
		.setDescription('Exports bans to a file')
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
		.setHandler(requireInGuild(exportGuildBans))
		// @ts-ignore
		.addStringOption(option => option
			.setName('pattern')
			.setDescription('Only export bans whose reason matches this pattern. Allows regex.')
			.setRequired(false)
		)
	)
	// @ts-ignore
	.addCommand(command => command
		.setName('import-bans')
		.setDescription('Import bans from a file')
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
		.setHandler(requireInGuild(importGuildBans))
		// @ts-ignore
		.addAttachmentOption(option => option
			.setName('banlist')
			.setDescription('A banlist JSON file from the /export-bans command')
			.setRequired(true)
		)
	);

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
		Package.description,
		`${bold('Running version:')} ${Package.version}`,
		`${bold('Source code:')} ${Package.homepage}`,
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
		// requireInGuild decorator guarantees these values are defined
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
		const banData = await buildGuildBanItems(guild, filter);

		await interaction.editReply(FileReply({
			content: GoodMsg('Ban list successfully exported'),
			name: banFileName(guild),
			data: banData,
		}));
	} catch (err) {
		console.error('Failed to build ban list', err);
		await interaction.editReply(ErrorMsg(
			'Failed to build ban list. Do I have permission to read the ban list?'
		));
	}
}

/**
 * Import Bans from a JSON file and apply them to the Guild.
 */
async function importGuildBans(interaction: ChatInputCommandInteraction): Promise<void> {
	const banList = interaction.options.getAttachment('banlist', true);

	if (!banList.contentType?.includes('application/json')) {
		await interaction.reply(EphemReply(ErrorMsg('Ban list must be a JSON file!')));
		return;
	}

	await interaction.reply(InfoMsg('Loading ban list...'));

	let banItems: GuildBanItem[];
	try {
		banItems = await downloadGuildBanItems(banList.url);
	} catch (err) {
		console.warn(`Downloaded bad banlist ${banList.url}`, err);
		await interaction.editReply(ErrorMsg(
			`Cannot load banlist!\nReason: ${(err as Error).message}`
		));
		return;
	}

	// requireInGuild decorator guarantees this value is defined
	const guild = interaction.guild!;
	const reason = `${APP_NAME}: Imported from list`;
	const userBans: Snowflake[] = [];
	let errMsg: string | undefined;

	for await (const item of banItems) {
		try {
			const user = await interaction.client.users.fetch(item.user_id);
			// TODO can we get "already banned" here?
			await banUser({
				guild, user, reason,
				refBanId: item.init_ban_id ?? item.ban_id,
			});
			userBans.push(user.id);

			// Give progress updates for large ban lists
			if (userBans.length % 10 === 0) {
				await interaction.editReply(InfoMsg(
					`Loading ban list (${userBans.length}/${banItems.length})...`
				));
			}
		} catch (err) {
			if (err instanceof DiscordAPIError) {
				console.warn('Failed to ban User in Guild', err);
				errMsg = `Failed to ban ${userMention(item.user_id)}. ` +
					'Do I have the right permissions?';
			} else {
				console.error('Failed to add ban to database', err);
				errMsg = 'Something went wrong on my end.';
			}

			break;
		}
	}

	const messages = splitLongMessage([
		errMsg ? `${errMsg}\n\n` : '',
		'Successfully banned',
		banItems.length === userBans.length
			? `all ${banItems.length}`
			: `${userBans.length}/${banItems.length}`,
		'users:\n',
		userBans.map(banId => userMention(banId)).join(' '),
	].join(' '));

	const Decorate = errMsg ? ErrorMsg : GoodMsg;
	const firstMessage = messages.shift()!;
	await interaction.editReply(Decorate(firstMessage));
	for await (const message of messages) {
		await interaction.reply(Decorate(message));
	}
}

// There are surely more efficient ways to do this,
// but this won't be called very often so whatever.
function splitLongMessage(content: string): string[] {
	const MAX_MESSAGE_LEN = 2000;
	const parts: string[] = [];

	let curMsg = '';
	content.split(' ').forEach(word => {
		if (curMsg.length + word.length < MAX_MESSAGE_LEN) {
			curMsg += ` ${word}`;
		} else {
			parts.push(curMsg);
			curMsg = word;
		}
	});
	parts.push(curMsg);

	return parts;
}
