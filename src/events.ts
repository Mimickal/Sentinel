/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import {
	BaseInteraction,
	ButtonInteraction,
	Client,
	DiscordAPIError,
	Guild,
	GuildBan,
	Snowflake,
	TextBasedChannel,
	userMention,
} from 'discord.js';
import { detail, GlobalLogger } from '@mimickal/discord-logging';

import {
	banCameFromThisBot,
	banGuildHasBroadcastingEnabled,
	banUser,
	recordUserBan,
	recordUserUnban,
	unbanUser,
} from './ban';
import commands from './commands';
import {
	BanEmbed,
	BanButton,
	DisabledButton,
	ErrorMsg,
	GoodMsg,
	InfoMsg,
	WarnMsg,
	UnbanEmbed,
	UnbanButton,
} from './components';
import { APP_NAME, GuildConfig } from './config';
import * as database from './database';
import { GuildRow, RowId } from './database';
import { fetchAll, ignoreError } from './util';

interface BanAlert {
	ban: GuildBan;
	guildRow: GuildRow;
	timestamp: Date;
	banId?: RowId;
}

const logger = GlobalLogger.logger;

/**
 * Event handler for when the bot is logged in.
 * Logs the bot user we logged in as.
 */
export async function onReady(client: Client): Promise<void> {
	logger.info(`Logged in as ${client.user?.tag} (${client.user?.id})`);
}

/**
 * Event handler for joining a Guild.
 *
 * If the Guild is on the whitelist (aka we have a record for it):
 *   - Set joined_at date
 *   - Set up initial config
 *   - Load all of its existing bans into the database.
 *
 * If the Guild is not on the whitelist, leave immediately.
 */
export async function onGuildJoin(guild: Guild): Promise<void> {
	logger.info(`Joined ${detail(guild)}`);
	await guild.fetch();

	const guildRow = await database.getGuild(guild.id);
	if (!guildRow) {
		logger.warn(`${detail(guild)} is not on the whitelist`);
		await guild.leave();
		return;
	}

	try {
		await database.upsertGuild({
			id: guild.id, // Should match guildRow.id
			joined_at: guild.joinedAt,
			name: guild.name,
		});
		await GuildConfig.setAlertChannel(guild.id, null);
		await GuildConfig.setBroadcast(guild.id, true);
	} catch (err) {
		logger.error(`Failed to add ${detail(guild)} to database`, err);
	}

	for await (const ban of fetchAll<GuildBan>(guild.bans)) {
		try {
			await recordUserBan({
				guildId: ban.guild.id,
				user: ban.user,
				reason: ban.reason,
				// bannedAt intentionally left undefined because we don't know ban time.
			});
		} catch (err) {
			logger.error(`Failed to add ${detail(ban)} to database`, err);
		}
	}
}

/**
 * Event handler for leaving a Guild.
 * Clears all recorded data for the Guild.
 */
export async function onGuildLeave(guild: Guild): Promise<void> {
	logger.info(`Left ${detail(guild)}`);
	try {
		await database.clearDataForGuild(guild.id);
	} catch (err) {
		logger.error(`Failed to remove ${detail(guild)} from database`, err);
	}
}

/**
 * Event handler for receiving some kind of interaction.
 * Logs the interaction and passes it on to the command handler.
 */
export async function onInteraction(interaction: BaseInteraction): Promise<void> {
	logger.info(`Received ${detail(interaction)}`);

	try {
		if (interaction.isButton()) {
			await handleButtonInteraction(interaction);
		} else {
			await commands.execute(interaction);
		}
	} catch (err) {
		logger.info(`${detail(interaction)} error fell through:`, err);
	}
}

/** Event handler for a User being banned. */
export async function onUserBanned(ban: GuildBan): Promise<void> {
	// Ban doesn't have a timestamp, so we use our own. Close enough.
	const timestamp = new Date(Date.now());
	logger.info(`${detail(ban.guild)} banned ${detail(ban.user)}`);

	await ban.fetch(); // Sometimes need to fetch to get reason

	const banId = await recordUserBan({
		bannedAt: timestamp,
		guildId: ban.guild.id,
		reason: ban.reason,
		user: ban.user,
	});

	if (banCameFromThisBot(ban)) return;
	if (!await banGuildHasBroadcastingEnabled(ban)) return;

	const guildRows = await database.getGuilds();
	for await (const guildRow of guildRows) {
		try {
			await sendBanAlert({ ban, banId, guildRow, timestamp });
		} catch (err) {
			// Can't use detail because we only have the Guild ID here.
			logger.warn(`Failed to send ban alert to Guild ${guildRow.id}`, err);
		}
	}
}

async function sendBanAlert({
	ban, banId, guildRow, timestamp,
}: BanAlert): Promise<void> {
	// Don't send alert to the guild the ban came from.
	if (guildRow.id === ban.guild.id) return;

	// Don't send alert if we, you know, can't.
	const alertChannel = await fetchGuildAlertChannel(ban.client, guildRow.id);
	if (!alertChannel) return;

	// Don't send alert if user is already banned in this guild.
	const existingBan = await database.getBan({
		guild_id: guildRow.id,
		user_id: ban.user.id,
	});
	if (existingBan) return;

	const guild = await ban.client.guilds.fetch(guildRow.id);
	const inGuildSince = await ignoreError(async () => (
		(await guild.members.fetch(ban.user.id)).joinedAt ?? undefined
	));

	await alertChannel.send({
		embeds: [new BanEmbed({ ban, timestamp, inGuildSince })],
		// @ts-expect-error TODO ask djs support why this type isn't playing nice.
		components: [new BanButton({ userId: ban.user.id, banId })],
	});
}

/** Event handler for a User being unbanned. */
export async function onUserUnbanned(ban: GuildBan): Promise<void> {
	// Ban doesn't have a timestamp, so we use our own. Close enough (still).
	const timestamp = new Date(Date.now());
	logger.info(`${detail(ban.guild)} unbanned ${detail(ban.user)}`);

	const banId = await recordUserUnban({
		guildId: ban.guild.id,
		userId: ban.user.id,
	});

	if (banCameFromThisBot(ban)) return;
	if (!(await banGuildHasBroadcastingEnabled(ban))) return;

	const guildRows = await database.getGuilds();
	for await (const guildRow of guildRows) {
		try {
			await sendUnBanAlert({ ban, banId, guildRow, timestamp });
		} catch (err) {
			// Can't use detail because we only have the Guild ID here.
			logger.warn(`Failed to send unban alert to Guild ${guildRow.id}`, err);
		}
	}
}

async function sendUnBanAlert({
	ban, banId, guildRow, timestamp
}: BanAlert): Promise<void> {
	// Don't send unban to the guild the unban game from.
	if (guildRow.id === ban.guild.id) return;

	// Don't send unban if we can't.
	const alertChannel = await fetchGuildAlertChannel(ban.client, guildRow.id);
	if (!alertChannel) return;

	// DO send unban alert even if the user isn't banned.
	// We need to correct any previous ban alert we may have sent.
	const existingBan = await database.getBan({
		guild_id: guildRow.id,
		user_id: ban.user.id,
	});
	const bannedSince = existingBan?.banned_at;

	await alertChannel.send({
		embeds: [new UnbanEmbed({ ban, bannedSince, timestamp })],
		// @ts-expect-error TODO ask djs support why this type isn't playing nice.
		components: [new UnbanButton({ userId: ban.user.id, banId })],
	});
}

/** Gets the configured alert channel for the given guild. */
async function fetchGuildAlertChannel(
	client: Client, guildId: Snowflake,
): Promise<TextBasedChannel | null> {
	const guildConfig = await GuildConfig.for(guildId);
	if (!guildConfig.alertChannelId) return null;

	// Verify this is a channel we can actually send messages to.
	const alertChannel = await client.channels.fetch(guildConfig.alertChannelId);
	if (!alertChannel?.isTextBased() || alertChannel.hasOwnProperty('send')) {
		throw new Error(`Invalid channel ${guildConfig.alertChannelId}`);
	}

	return alertChannel;
}

/** Handler for a button press. */
async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
	if (BanButton.isButtonId(interaction.customId)) {
		handleBanButton(interaction);
	} else if (UnbanButton.isButtonId(interaction.customId)) {
		handleUnbanButton(interaction);
	} else {
		logger.warn(`Unrecognized button interaction: ${interaction.customId}`);
		return;
	}
}

/** Handler for ban button press. */
async function handleBanButton(interaction: ButtonInteraction): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return;

	const { userId, banId } = BanButton.getBanIds(interaction.customId)!;

	const existingDiscordBan = await ignoreError(() => guild.bans.fetch(userId));
	const existingBotBan = await database.getBan({
		guild_id: guild.id,
		user_id: userId,
	});

	if (existingDiscordBan && existingBotBan) {
		await interaction.reply(InfoMsg('User already banned'));
		await disableButton(interaction, 'Banned');
		return;
	}

	logger.info(`Button banning User ${userId} in ${detail(guild)}`);
	const reason = `${APP_NAME}: Ban confirmed by admin`;

	try {
		// The ban event will also try to store the ban, but we won't have
		// access to the reference banId there, so just do the ban here.
		const user = await interaction.client.users.fetch(userId);
		await banUser({ guild, reason, user, refBanId: banId });
		await disableButton(interaction, 'Banned');
	} catch (err) {
		if (err instanceof DiscordAPIError) {
			await interaction.reply(ErrorMsg(
				'Cannot ban user. Do I have the right permissions?'
			));
		} else {
			await interaction.reply(WarnMsg(
				'User was successfully banned in your server, but I failed ' +
				'to record it in my database. If you want to record this ' +
				'ban, click the ban button again.'
			));
		}
		return;
	}

	await interaction.reply(GoodMsg(`Banned user ${userMention(userId)}`));
}

/** Handler for unban button press. */
async function handleUnbanButton(interaction: ButtonInteraction): Promise<void> {
	const guild = interaction.guild;
	if (!guild) return;

	const { userId } = BanButton.getBanIds(interaction.customId)!;

	const existingDiscordBan = await ignoreError(() => guild.bans.fetch(userId));
	const existingBotBan = await database.getBan({
		guild_id: guild.id,
		user_id: userId,
	});

	if (!existingDiscordBan && !existingBotBan) {
		await interaction.reply(InfoMsg('User is not banned'));
		await disableButton(interaction, 'Not Banned');
		return;
	}

	logger.info(`Button unbanning User ${userId} in ${detail(guild)}`);
	const reason = `${APP_NAME}: Unban confirmed by admin`;

	try {
		// The ban event will also try to store the ban, but we won't have
		// access to the reference banId there, so just do the ban here.
		const user = await interaction.client.users.fetch(userId);
		await unbanUser({ guild, reason, userId: user.id });
		await disableButton(interaction, 'Not Banned');
	} catch (err) {
		if (err instanceof DiscordAPIError) {
			await interaction.reply(ErrorMsg(
				'Cannot unban user. Do I have the right permissions?'
			));
		} else {
			await interaction.reply(WarnMsg(
				'User was successfully unbanned in your server, but I failed ' +
				'to record it in my database. If you want to record this ' +
				'unban, click the unban button again.'
			));
		}
		return;
	}

	await interaction.reply(GoodMsg(`Unbanned user ${userMention(userId)}`));
}

async function disableButton(
	interaction: ButtonInteraction,
	label: string,
): Promise<void> {
	try {
		await interaction.message.edit({
			// @ts-expect-error TODO ask djs devs what's up
			components: [new DisabledButton(label)],
		});
	} catch (err) {
		// If we fail to disable this button, the worst thing that happens is
		// someone might click it again, which we account for. The ban already
		// happened, so just log this failure and move on.
		logger.warn(`Failed to disable ban button on ${detail(interaction.message)}`);
	}
}
