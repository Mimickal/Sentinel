/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { formatDistance } from 'date-fns';
import {
	bold,
	BaseMessageOptions,
	Colors,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	GuildBan,
	InteractionReplyOptions,
	MessageEditOptions,
} from 'discord.js';

interface BanIds {
	userId: string;
	banId?: number;
}

/**
 * A button for banning a user.
 *
 * In the interaction event for this button, information about the ban can be
 * retrieved using {@link BanButton.getBanIds}.
 *
 * Rationale:
 * It could be many hours (or even days) between displaying this button and an
 * admin clicking it, if they ever click it at all. Because of this, we need to
 * embed information about the ban in the button itself. The only way to do this
 * is through its ID.
 */
export class BanButton extends ActionRowBuilder {
	static ID_PREFIX = 'ban';

	static isButtonId(id: string): boolean {
		return id.startsWith(BanButton.ID_PREFIX);
	}

	static getBanIds(id: string): BanIds | undefined {
		if (BanButton.isButtonId(id)) {
			const ids = id.split('-');
			return {
				userId: ids[1],
				banId: ids[2] ? Number.parseInt(ids[2]) : undefined,
			};
		}
	}

	constructor({ userId, banId }: BanIds) {
		super();
		this.addComponents(new ButtonBuilder()
			.setCustomId(
				`${BanButton.ID_PREFIX}-${userId}${banId ? `-${banId}` : ''}`
			)
			.setLabel('Ban')
			.setStyle(ButtonStyle.Danger)
		);
	}
}

export const ErrorMsg = (content: string): BaseMessageOptions => ({
	content: `:x: ${content}`,
});

export const InfoMsg = (content: string): BaseMessageOptions => ({
	content: `:information_source: ${content}`,
});

export const GoodMsg = (content: string): BaseMessageOptions => ({
	content: `:white_check_mark: ${content}`,
});

export const EphemReply = (content: string | BaseMessageOptions): InteractionReplyOptions => ({
	...packMessage(content),
	ephemeral: true,
});

export const FileReply = ({ data, name, content }: {
	data: unknown;
	name: string;
	content?: string | BaseMessageOptions;
}): MessageEditOptions => ({
	...packMessage(content),
	files: [{
		name: name,
		attachment: Buffer.from(JSON.stringify(data, null, 2)),
	}],
});

interface BanEmbedProps {
	ban: GuildBan;
	timestamp: Date;
	inGuildSince?: Date;
};

export class BanEmbed extends EmbedBuilder {
	constructor({ ban, timestamp, inGuildSince }: BanEmbedProps) {
		super();

		const { guild, user } = ban;
		this.setColor(Colors.Red)
			.setAuthor({
				name: `${user.username}#${user.discriminator}`,
				iconURL: user.displayAvatarURL(),
			})
			.setDescription(bold(`${user} was banned`))
			.addFields({
				name: 'Account Age',
				value: formatDistance(Date.now(), user.createdAt),
				inline: true,
			})
			.addFields({ name: 'User ID', value: user.id, inline: true })
			.addFields({
				name: `${inGuildSince ? '' : 'Not '} In Your Server`,
				value: inGuildSince ? formatDistance(Date.now(), inGuildSince) : ' ',
				inline: true,
			})
			.setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined })
			.setTimestamp(timestamp);

		if (ban.reason) {
			this.addFields({ name: 'Reason', value: ban.reason });
		}
	}
}

// Handles optionally packing a raw string into BaseMessageOptions.
function packMessage(content?: string | BaseMessageOptions): BaseMessageOptions {
	return typeof content === 'object' ? content : { content };
}
