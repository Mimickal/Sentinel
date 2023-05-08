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
	SnowflakeUtil,
	userMention,
} from 'discord.js';
// @ts-ignore
import { SlashCommandRegistry } from 'discord-command-registry';
import { detail, GlobalLogger } from '@mimickal/discord-logging';

import { banUser } from './ban';
import {
	banFileName,
	buildGuildBanItems,
	downloadGuildBanItems,
	GuildBanItem,
 } from './banlist';
import { EphemReply, ErrorMsg, FileReply, GoodMsg, InfoMsg, WarnMsg } from './components';
import { APP_NAME, GuildConfig, Package, UNKNOWN_ERR } from './config';
import * as database from './database';

const logger = GlobalLogger.logger;

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
		// @ts-ignore
		.addSubcommand(subcommand => subcommand
			.setName('broadcast')
			.setDescription("Enable or disable broadcasting this server's bans to other servers")
			.setHandler(requireInGuild(setBroadcast))
			// @ts-ignore
			.addBooleanOption(option => option
				.setName('enabled')
				.setDescription("Broadcast this server's bans?")
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
	)
	// @ts-ignore
	.addCommand(command => command
		.setName('whitelist')
		.setDescription('Change the bot server whitelist')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		// @ts-ignore
		.addSubcommand(subcommand => subcommand
			.setName('add')
			.setDescription('Adds a server to the bot whitelist')
			.setHandler(requireBotOwner(guildWhitelistAdd))
			// @ts-ignore
			.addStringOption(option => option
				.setName('server')
				.setDescription('The ID of the server to whitelist')
				.setRequired(true)
			)
		)
		// @ts-ignore
		.addSubcommand(subcommand => subcommand
			.setName('remove')
			.setDescription('Removes a server from the bot whitelist')
			.setHandler(requireBotOwner(guildWhitelistRemove))
			// @ts-ignore
			.addStringOption(option => option
				.setName('server')
				.setDescription('The ID of the server to remove from the whitelist')
				.setRequired(true)
			)
		)
	);

/** Middleware that ensures the interaction is being sent by the bot's owner. */
function requireBotOwner(func: Handler): Handler {
	return async (interaction) => {
		// Need to fetch to guarantee owner is defined
		await interaction.client.application.fetch();

		const botOwnerId = interaction.client.application.owner?.id;
		if (interaction.user.id === botOwnerId) {
			return func(interaction);
		} else {
			interaction.reply(EphemReply(InfoMsg(
				'Only the bot owner can use this command!'
			)));
		}
	};
}

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
	const channel = interaction.options.getChannel('channel', true);
	if (![
		ChannelType.GuildText,
		ChannelType.PrivateThread,
		ChannelType.PublicThread,
	].includes(channel.type)) {
		await interaction.reply(EphemReply(ErrorMsg(
			`Cannot use channel ${channel}! Please use a text channel.`
		)));
		return;
	}

	// requireInGuild decorator guarantees guild and channel are defined
	const guild = interaction.guild!;
	// TODO detail(channel) when supported
	logger.info(`Setting ${detail(guild)} alert channel to Channel ${channel.id}`);

	try {
		await GuildConfig.setAlertChannel(guild.id, channel.id)
	} catch (err) {
		logger.error(`Failed to set ${detail(guild)} alert channel in database`, err);
		await interaction.reply(EphemReply(ErrorMsg(
			`Failed to set alert channel. Try again?`,
		)));
		return;
	}

	await interaction.reply(GoodMsg(`Now sending alerts to ${channel}`));
}

/**
 * Configures whether or not to broadcast a Guild's bans to other Guilds.
 */
async function setBroadcast(interaction: ChatInputCommandInteraction): Promise<void> {
	const enabled = interaction.options.getBoolean('enabled', true);

	// requireInGuild decorator guarantees guild is defined
	const guild = interaction.guild!;
	logger.info(`Setting ${detail(guild)} broadcast to ${enabled}`);

	try {
		await GuildConfig.setBroadcast(guild.id, enabled);
	} catch (err) {
		logger.error(`Failed to set ${detail(guild)} broadcast enabled in database`, err);
		await interaction.reply(EphemReply(ErrorMsg(
			`Failed to set broadcast flag. Try again?`
		)));
		return;
	}

	await interaction.reply(GoodMsg(
		`Bans will ${enabled ? 'now' : 'no longer'} be broadcasted to other servers.`
	));
}

/**
 * Exports Bans for a Guild to a JSON file, then posts it in the Guild.
 */
async function exportGuildBans(interaction: ChatInputCommandInteraction): Promise<void> {
	const filter = interaction.options.getString('pattern') ?? undefined;
	const guild = interaction.guild!; // Above check guarantees this value.

	logger.info(`Building ban list for ${detail(guild)}`);
	await interaction.reply(InfoMsg('Building ban list...'));

	try {
		const banData = await buildGuildBanItems(guild, filter);

		await interaction.editReply(FileReply({
			content: GoodMsg('Ban list successfully exported'),
			name: banFileName(guild),
			data: banData,
		}));
	} catch (err) {
		logger.warn(`Failed to build ban list in ${detail(guild)}`, err);
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

	logger.info(`Loading ban list into ${detail(interaction.guild)}`);
	await interaction.reply(InfoMsg('Loading ban list...'));

	let banItems: GuildBanItem[];
	try {
		banItems = await downloadGuildBanItems(banList.url);
	} catch (err) {
		logger.warn(`Downloaded bad banlist ${banList.url}`, err);
		await interaction.editReply(ErrorMsg(
			`Cannot load banlist!\nReason: ${(err as Error).message}`
		));
		return;
	}

	// requireInGuild decorator guarantees this value is defined
	const guild = interaction.guild!;
	const reason = `${APP_NAME}: Imported from list`;

	let processed = 0;
	const successBans: Snowflake[] = [];
	const failedBans: Snowflake[] = [];

	for await (const item of banItems) {
		try {
			const user = await interaction.client.users.fetch(item.user_id);
			// TODO can we get "already banned" here?
			await banUser({
				guild, user, reason,
				refBanId: item.init_ban_id ?? item.ban_id,
			});
			successBans.push(item.user_id);
		} catch (err) {
			if (err instanceof DiscordAPIError) {
				logger.warn(`Failed to ban User ${item.user_id} in ${detail(guild)}`, err);
			} else {
				logger.error('Failed to add ban to database', err);
			}
			failedBans.push(item.user_id)
		}

		processed++;

		// Give progress updates for large ban lists
		if (processed % 10 === 0) {
			await interaction.editReply(InfoMsg(
				`Loading ban list (${processed}/${banItems.length})...`
			));
		}
	}

	logger.info(`Finished loading banlist into ${detail(interaction.guild)}`);

	// This ridiculous block of code is just building a message to notify
	// which bans were successful and which were not.
	let msgText = '';

	if (failedBans.length > 0) {
		msgText += `Failed to ban ${
			failedBans.length === banItems.length
				? `all ${banItems.length}`
				: `${failedBans.length} / ${banItems.length}`
		} users. I may be missing permissions.\n${
			failedBans.map(userMention).join(' ')
		}\n\n`;
	}

	if (successBans.length > 0) {
		msgText += `Successfully banned ${
			successBans.length === banItems.length
				? `all ${banItems.length}`
				: `${successBans.length} / ${banItems.length}`
		} users.\n${
			successBans.map(userMention).join(' ')
		}`;
	}

	const messages = splitLongMessage(msgText);
	const Decorate = failedBans.length > 0 ? WarnMsg : GoodMsg;
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

/**
 * Adds the given Guild to the bot's whitelist.
 * This will allow the bot to join a guild without immediately leaving.
 */
async function guildWhitelistAdd(interaction: ChatInputCommandInteraction): Promise<void> {
	// TODO sure would be nice if we had a getServerOption helper
	const guildId = interaction.options.getString('server', true);
	try {
		SnowflakeUtil.decode(guildId); // Throws SyntaxError if invalid

		logger.info(`Adding Guild ${guildId} to whitelist`);

		await database.upsertGuild({ id: guildId });
		await interaction.reply(GoodMsg(`Added Guild ${guildId} to the whitelist.`));
	} catch (err) {
		if (err instanceof SyntaxError) {
			logger.warn(`Invalid whitelist server ID "${guildId}"`);
		} else {
			logger.error(`Something went wrong adding Server ${guildId} to whitelist`, err);
		}

		await interaction.reply(EphemReply(ErrorMsg(
			err instanceof SyntaxError ? 'Invalid server ID' : UNKNOWN_ERR
		)));
	}
}

/**
 * Removes the given Guild from the bot's whitelist.
 * If the bot is already in that Guild, it will leave the Guild and delete any
 * Guild data it is storing.
 */
async function guildWhitelistRemove(interaction: ChatInputCommandInteraction): Promise<void> {
	const guildId = interaction.options.getString('server', true);
	try {
		SnowflakeUtil.decode(guildId); // Throws SyntaxError if invalid

		logger.info(`Removing Guild ${guildId} from whitelist`);

		await database.clearDataForGuild(guildId);
	} catch (err) {
		if (err instanceof SyntaxError) {
			logger.warn(`Invalid whitelist server ID "${guildId}"`);
		} else {
			logger.error(`Something went wrong removing Server ${guildId} from whitelist`, err);
		}

		await interaction.reply(EphemReply(ErrorMsg(
			err instanceof SyntaxError ? 'Invalid server ID' : UNKNOWN_ERR
		)));
		return;
	}

	let left = false;
	try {
		const guild = await interaction.client.guilds.fetch(guildId);
		await guild.leave();
		left = true;
	} catch (err) {
		logger.warn(`Didn't leave Guild ${guildId}`);
	}

	await interaction.reply(WarnMsg(
		`Removed Guild ${guildId} from the whitelist. ${left ? 'Bot left guild.': ''}`
	));
}
