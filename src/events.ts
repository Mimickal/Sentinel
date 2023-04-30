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
	Message,
	userMention,
} from 'discord.js';

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


/**
 * Event handler for when the bot is logged in.
 * Logs the bot user we logged in as.
 */
export async function onReady(client: Client): Promise<void> {
	console.info(`Logged in as ${client.user?.tag} (${client.user?.id})`);
}

/**
 * Event handler for joining a Guild.
 * Creates a record for the Guild in the database.
 */
export async function onGuildJoin(guild: Guild): Promise<void> {
	console.log('Joined Guild');

	const alertChannel = guild.systemChannel;
	if (!alertChannel) {
		console.warn('Guild has no alert channel and will not receive alerts.');
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
		console.error('Failed to add Guild to database', err);
	}
}

/**
 * Event handler for leaving a Guild.
 * Updates the database row for this Guild with the time of leaving.
 */
export async function onGuildLeave(guild: Guild): Promise<void> {
	console.log('Left Guild');
	try {
		await database.setGuildLeft({
			id: guild.id,
			left_at: new Date(Date.now()),
		});
	} catch (err) {
		console.error('Failed to remove Guild from database', err);
	}
}

/**
 * Event handler for receiving some kind of interaction.
 * Logs the interaction and passes it on to the command handler.
 */
export async function onInteraction(interaction: BaseInteraction): Promise<void> {
	//console.info(`Received ${detail(interaction)}`);
	console.info('Received interaction');

	try {
		if (interaction.isButton()) {
			await handleButtonInteraction(interaction);
		} else {
			await commands.execute(interaction);
		}
	} catch (err) {
		//logger.error(`${detail(interaction)} error fell through:`, err);
		console.info('Interaction error fell through:', err);
	}
}

/** Event handler for a User being banned. */
export async function onUserBanned(ban: GuildBan): Promise<void> {
	console.info('Guild banned User');
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
			console.warn('Failed to send ban alert to Guild', err);
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
	console.info('Guild unbanned User');

	try {
		await database.removeBan({
			guild_id: ban.guild.id,
			user_id: ban.user.id,
		});
	} catch (err) {
		console.error('Failed to remove ban from database', err);
	}
	// TODO do we want to alert other servers?
}

/** Handler for a button press. */
async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
	if (!BanButton.isButtonId(interaction.customId)) {
		console.warn('Unrecognized button interaction:', interaction.customId);
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

	console.log('Button banning User in Guild');
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

/** This is for testing, because sending a message is much easier than banning. */
export async function testMessage(message: Message): Promise<void> {
	if (
		message.channel.id !== '186930896606199808' ||
		message.author.id !== '139881327469002752'
	) return;
	console.log('Running test event');


}

// Going to save each thing we test down here, so we can integrate them later.

