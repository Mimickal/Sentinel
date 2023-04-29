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
	Guild,
	GuildBan,
	Message,
	userMention,
} from 'discord.js';

import commands from './commands';
import {
	BanEmbed,
	BanButton,
	ErrorMsg,
	GoodMsg,
	InfoMsg,
} from './components';
import { APP_NAME } from './config';
import * as database from './database';
import { GuildRow } from './database';
import GuildConfig from './guildconf';

/**
 * Event handler for when the bot is logged in.
 * Logs the bot user we logged in as.
 */
export async function onReady(client: Client) {
	console.info(`Logged in as ${client.user?.tag} (${client.user?.id})`);
}

/**
 * Event handler for joining a Guild.
 * Creates a record for the Guild in the database.
 */
export async function onGuildJoin(guild: Guild) {
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
export async function onGuildLeave(guild: Guild) {
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
export async function onInteraction(interaction: BaseInteraction) {
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

/** Event handler for a Guild Member being banned. */
export async function onMemberBanned(ban: GuildBan) {
	// Ban doesn't have a timestamp, so we use our own. Close enough.
	const bannedAt = new Date(Date.now());
	const banId = await addBannedUser({
		bannedAt,
		guildId: ban.guild.id,
		userId: ban.user.id,
		reason: ban.reason,
	});

	// Don't broadcast bans initiated by this bot. Kind of a hack, but it works.
	if (ban.reason?.startsWith(APP_NAME)) return;

	const guildRows = await database.getGuilds();
	for await (const guildRow of guildRows) {
		try {
			await sendBanAlert({
				ban, bannedAt, banId, guildRow,
			});
		} catch (err) {
			console.warn('Failed to send ban alert to Guild', err);
		}
	}
}

async function addBannedUser({ bannedAt, guildId, userId, reason, refId }: {
	bannedAt: Date;
	guildId: string;
	userId: string;
	reason?: string | null;
	refId?: number;
}): Promise<number | undefined> {
	try {
		await database.addUser({
			id: userId,
			created_at: bannedAt,
		});

		const banId = await database.addBan({
			banned_at: bannedAt,
			guild_id: guildId,
			reason: reason,
			user_id: userId,
			ref_ban_id: refId,
		});

		return banId;
	} catch (err) {
		console.error('Failed to add ban to database', err);
	}
}

async function sendBanAlert({ ban, bannedAt, banId, guildRow }: {
	ban: GuildBan;
	bannedAt: Date;
	banId: number | undefined;
	guildRow: GuildRow;
}): Promise<void> {
	// Don't send alert to the guild the ban came from.
	if (guildRow.id === ban.guild.id) return;

	const guildConfig = await GuildConfig.for(guildRow.id);

	// Don't send alert if we, you know, can't.
	if (!guildConfig.alertChannelId) return;

	// Don't send alert if user is already banned in this guild.
	const existingBan = await database.getUserBan({
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

/** Event handler for a Guild Member being unbanned. */
export async function onMemberUnbanned(ban: GuildBan) {
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
async function handleButtonInteraction(interaction: ButtonInteraction) {
	if (!BanButton.isButtonId(interaction.customId)) {
		console.warn('Unrecognized button interaction:', interaction.customId);
		return;
	}

	const guild = interaction.guild;
	if (!guild) return;

	const { userId, banId } = BanButton.getBanIds(interaction.customId)!;

	const existingBan = await database.getUserBan({
		guild_id: guild.id,
		user_id: userId,
	});
	if (existingBan) {
		return interaction.reply(InfoMsg('User already banned'));
	}

	console.log('Button banning User in Guild');
	const reason = `${APP_NAME}: Confirmed by admin`;

	try {
		await guild.bans.create(userId, { reason });
	} catch (err) {
		return interaction.reply(ErrorMsg('Cannot ban user. Do I have the right permissions?'));
	}

	// The ban event will also call this, but we need to set refId here.
	await addBannedUser({
		bannedAt: new Date(Date.now()),
		guildId: guild.id,
		reason: reason,
		refId: banId,
		userId: userId,
	});

	await interaction.reply(GoodMsg(`Banned user ${userMention(userId)}`));
}

/** This is for testing, because sending a message is much easier than banning. */
export async function testMessage(message: Message) {
	if (
		message.channel.id !== '186930896606199808' ||
		message.author.id !== '139881327469002752'
	) return;
	console.log('Running test event');


}

// Going to save each thing we test down here, so we can integrate them later.

