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
	userMention,
} from 'discord.js';
import { detail, GlobalLogger } from '@mimickal/discord-logging';

import { banUser, recordUserBan } from './ban';
import commands from './commands';
import {
	BanEmbed,
	BanButton,
	ErrorMsg,
	GoodMsg,
	InfoMsg,
	WarnMsg,
} from './components';
import { APP_NAME, GuildConfig } from './config';
import * as database from './database';
import { GuildRow, RowId } from './database';
import { fetchAll } from './util';

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
 * Creates a record for the Guild and all of its existing bans in the database.
 */
export async function onGuildJoin(guild: Guild): Promise<void> {
	logger.info(`Joined ${detail(guild)}`);

	const alertChannel = guild.systemChannel;
	if (!alertChannel) {
		logger.warn('Guild has no alert channel and will not receive alerts.');
	}

	try {
		await database.upsertGuild({
			id: guild.id,
			joined_at: guild.joinedAt,
			left_at: null,
			name: guild.name,
		});
		await GuildConfig.setAlertChannel(guild.id, alertChannel?.id);
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
 * Updates the database row for this Guild with the time of leaving.
 */
export async function onGuildLeave(guild: Guild): Promise<void> {
	logger.info(`Left ${detail(guild)}`);
	try {
		await database.setGuildLeft({
			id: guild.id,
			left_at: new Date(Date.now()),
		});
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
	logger.info(`${detail(ban.guild)} banned ${detail(ban.user)}`);
	await ban.fetch(); // Sometimes need to fetch to get reason

	// Ban doesn't have a timestamp, so we use our own. Close enough.
	const bannedAt = new Date(Date.now());
	const banId = await recordUserBan({
		bannedAt: bannedAt,
		guildId: ban.guild.id,
		reason: ban.reason,
		user: ban.user,
	});

	// Don't broadcast bans initiated by this bot. Kind of a hack, but it works.
	if (ban.reason?.startsWith(APP_NAME)) return;

	const guildRows = await database.getGuilds();
	for await (const guildRow of guildRows) {
		try {
			await sendBanAlert({ ban, bannedAt, banId, guildRow });
		} catch (err) {
			// Can't use detail because we only have the Guild ID here.
			logger.warn(`Failed to send ban alert to Guild ${guildRow.id}`, err);
		}
	}
}

async function sendBanAlert({ ban, bannedAt, banId, guildRow }: {
	ban: GuildBan;
	bannedAt: Date;
	guildRow: GuildRow;
	banId?: RowId;
}): Promise<void> {
	// Don't send alert to the guild the ban came from.
	if (guildRow.id === ban.guild.id) return;

	const guildConfig = await GuildConfig.for(guildRow.id);

	// Don't send alert if we, you know, can't.
	if (!guildConfig.alertChannelId) return;

	// Don't send alert if user is already banned in this guild.
	const existingBan = await database.getBan({
		guild_id: guildRow.id,
		user_id: ban.user.id,
	});
	if (existingBan) return;

	const channel = await ban.client.channels.fetch(guildConfig.alertChannelId);
	if (!channel?.isTextBased()) {
		throw new Error(`Invalid channel ${guildConfig.alertChannelId}`);
	}

	const guild = await ban.client.guilds.fetch(guildRow.id);
	let inGuildSince: Date | undefined;
	try {
		inGuildSince = (await guild.members.fetch(ban.user.id)).joinedAt ?? undefined;
	} catch {} // Throws an error if member is not in Guild.

	await channel.send({
		embeds: [new BanEmbed({
			ban: ban,
			timestamp: bannedAt,
			inGuildSince: inGuildSince,
		})],
		// @ts-ignore TODO ask djs support why this type isn't playing nice.
		components: [new BanButton({ userId: ban.user.id, banId })],
	});
}

/** Event handler for a User being unbanned. */
export async function onUserUnbanned(ban: GuildBan): Promise<void> {
	logger.info(`${detail(ban.guild)} unbanned ${detail(ban.user)}`);

	try {
		await database.removeBan({
			guild_id: ban.guild.id,
			user_id: ban.user.id,
		});
	} catch (err) {
		logger.error(`Failed to remove ${detail(ban)} from database`, err);
	}
	// TODO do we want to alert other servers?
}

/** Handler for a button press. */
async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
	if (!BanButton.isButtonId(interaction.customId)) {
		logger.warn(`Unrecognized button interaction: ${interaction.customId}`);
		return;
	}

	const guild = interaction.guild;
	if (!guild) return;

	const { userId, banId } = BanButton.getBanIds(interaction.customId)!;

	const existingBan = await database.getBan({
		guild_id: guild.id,
		user_id: userId,
	});
	if (existingBan) {
		await interaction.reply(InfoMsg('User already banned'));
		return;
	}

	logger.info(`Button banning User ${userId} in ${detail(guild)}`);
	const reason = `${APP_NAME}: Confirmed by admin`;

	try {
		// The ban event will also try to store the ban, but we won't have
		// access to the reference banId there, so just do the ban here.
		const user = await interaction.client.users.fetch(userId);
		await banUser({ guild, reason, user, refBanId: banId });
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
