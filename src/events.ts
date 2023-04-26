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
} from 'discord.js';

import commands from './commands';
import { BanEmbed, BanButton } from './components';
import * as database from './database';
import { GuildRow } from './database';

/**
 * Event handler for when the bot is logged in.
 *
 * Logs the bot user we logged in as.
 */
export async function onReady(client: Client) {
	console.info(`Logged in as ${client.user?.tag} (${client.user?.id})`);
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

	await addBannedUser({ ban, bannedAt });

	// Don't broadcast bans initiated by this bot. Kind of a hack, but it works.
	if (ban.reason?.startsWith('Sentinel')) return;

	const guilds = await database.getGuilds();
	for await (const guild of guilds) {
		try {
			await sendBanAlert({
				ban, bannedAt, guild,
			});
		} catch (err) {
			console.warn('Failed to send ban alert to Guild', err);
		}
	}
}

async function addBannedUser({ ban, bannedAt }: {
	ban: GuildBan;
	bannedAt: Date;
}): Promise<void> {
	try {
		await database.addUser({
			id: ban.user.id,
			created_at: bannedAt,
			deleted: false,
		});

		await database.addBan({
			banned_at: bannedAt,
			guild_id: ban.guild?.id,
			reason: ban.reason,
			user_id: ban.user?.id,
		});
	} catch (err) {
		console.error('Failed to add ban to database', err);
	}
}

async function sendBanAlert({ ban, bannedAt, guild }: {
	ban: GuildBan;
	bannedAt: Date;
	guild: GuildRow;
}): Promise<void> {
	// Don't sent alert to the guild the ban came from.
	if (guild.id === ban.guild.id) return;
	if (!guild.alert_channel_id) return;

	const existingBan = await database.getUserBan({
		guild_id: guild.id,
		user_id: ban.user.id
	});
	if (existingBan) return;

	const channel = await ban.client.channels.fetch(guild.alert_channel_id);
	if (!channel?.isTextBased()) {
		throw new Error(`Invalid channel ${guild.alert_channel_id}`);
	}

	await channel.send({
		embeds: [new BanEmbed({
			ban: ban,
			timestamp: bannedAt,
		})],
		// @ts-ignore TODO ask djs support why this type isn't playing nice.
		components: [new BanButton()],
	});
}

/** Event handler for a Guild Member being unbanned. */
export async function onMemberUnbanned(ban: GuildBan) {

}

/** Handler for a button press. */
async function handleButtonInteraction(interaction: ButtonInteraction) {
	if (interaction.customId !== BanButton.ID) return;

	console.log('Pressed the button');
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

async function testGuildRemove(message: Message) {
	const guild = message.guild!;

	console.log('Left Guild');
	try {
		await database.setGuildLeft({
			id: guild.id,
			left_at: new Date(Date.now()),
		});
	} catch (err) {
		console.error('Failed to remove Guild from database', (err as Error));
	}
}

async function testGuildAdd(message: Message) {
	const guild = message.guild!;

	console.log('Joined Guild');

	const alertChannel = guild.systemChannel;
	if (!alertChannel){
		console.log('Guild has no alert channel and will not receive alerts.');
	}

	try {
		await database.upsertGuild({
			alert_channel_id: guild.systemChannel?.id,
			id: guild.id,
			joined_at: guild.joinedAt,
			left_at: null,
			name: guild.name,
		});
	} catch (err) {
		console.error('Failed to add Guild to database', (err as Error));
	}
}
