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
	ActionRowBuilder,
	BaseMessageOptions,
	bold,
	ButtonBuilder,
	ButtonStyle,
	Colors,
	EmbedBuilder,
	GuildBan,
	InteractionReplyOptions,
	MessageEditOptions,
	Snowflake,
} from 'discord.js';

export interface BanIds {
	userId: Snowflake;
	banId?: number;
}

type IdString = `${string}-${string}` | `${string}-${string}-${string}`;

/**
 * A button for performing an action on a user.
 *
 * In the interaction event for this button, information about the ban can be
 * retrieved using {@link Button.getBanIds}.
 *
 * Rationale:
 * It could be many hours (or even days) between displaying this button and an
 * admin clicking it, if they ever click it at all. Because of this, we need to
 * embed information about the ban in the button itself. The only way to do this
 * is through its ID.
 *
 * I guess an alternative would be using a database or something, but I'm not
 * setting up a whole-ass database when this works fine (albeit a little weird).
 */
export abstract class Button extends ActionRowBuilder {
	static ID_PREFIX: string;

	/** Determines if the given string is any valid button ID format. */
	private static hasIds(id: string): id is IdString {
		const ids = id.split('-');
		return (
			ids[1].length >= 18 && // Snowflake length
			2 <= ids.length     &&
			3 >= ids.length
		);
	}

	/**
	 * Determines if the given string is an ID for this button.
	 * Subclasses inherit this and override {@link ID_PREFIX}.
	 */
	static isButtonId(id: string): id is IdString {
		const ids = id.split('-');
		return ids[0] === this.ID_PREFIX && this.hasIds(id);
	}

	/** Extracts ban IDs from the given string. */
	static getBanIds(id: IdString): BanIds;
	static getBanIds(id: string): BanIds | undefined;
	static getBanIds(id: string | IdString): BanIds | undefined {
		if (!this.hasIds(id)) return;

		const ids = id.split('-');
		return {
			// Ignore prefix id[0]
			userId: ids[1],
			banId: ids[2] ? Number.parseInt(ids[2]) : undefined,
		};
	}

	static makeBtnId({ userId, banId }: BanIds): string {
		return `${this.ID_PREFIX}-${userId}${banId ? `-${banId}` : ''}`;
	}
}

/** A button for banning a user. */
export class BanButton extends Button {
	static ID_PREFIX = 'ban';

	constructor({ userId, banId }: BanIds) {
		super();
		this.addComponents(new ButtonBuilder()
			.setCustomId(BanButton.makeBtnId({ userId, banId }))
			.setLabel('Ban')
			.setStyle(ButtonStyle.Danger)
		);
	}
}

/** A generic disabled button. */
export class DisabledButton extends ActionRowBuilder {
	constructor(label: string) {
		super();
		this.addComponents(new ButtonBuilder()
			.setCustomId('Ignored')
			.setDisabled(true)
			.setLabel(label)
			.setStyle(ButtonStyle.Secondary)
		);
	}
}

/** A button for unbanning a user. */
export class UnbanButton extends Button {
	static ID_PREFIX = 'unban';

	constructor({ userId, banId }: BanIds) {
		super();
		this.addComponents(new ButtonBuilder()
			.setCustomId(UnbanButton.makeBtnId({ userId, banId }))
			.setLabel('Unban')
			.setStyle(ButtonStyle.Success)
		);
	}
}

export const ErrorMsg = (content: string): BaseMessageOptions => ({
	content: `:x: ${content}`,
});

export const InfoMsg = (content: string): BaseMessageOptions => ({
	content: `:information_source: ${content}`,
});

export const WarnMsg = (content: string): BaseMessageOptions => ({
	content: `:warning: ${content}`,
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

interface MemberEventEmbedProps {
	ban: GuildBan;
	timestamp: Date;
}

/** Common config for displaying a guild member in an embed. */
abstract class MemberEventEmbed extends EmbedBuilder {
	constructor({ ban, timestamp }: MemberEventEmbedProps) {
		super();

		const { guild, user } = ban;
		this.setAuthor({
				name: `${user.username}#${user.discriminator}`,
				iconURL: user.displayAvatarURL(),
			})
			.addFields({
				name: 'Account Age',
				value: formatDistance(Date.now(), user.createdAt),
				inline: true,
			})
			.addFields({ name: 'User ID', value: user.id, inline: true })
			.setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined })
			.setTimestamp(timestamp);
	}
}

type BanEmbedProps = MemberEventEmbedProps & { inGuildSince?: Date };

/** An embed explaining why a guild member was banned. */
export class BanEmbed extends MemberEventEmbed {
	constructor({ ban, timestamp, inGuildSince }: BanEmbedProps) {
		super({ ban, timestamp });

		const { reason, user } = ban;
		this.setColor(Colors.Red)
			.setDescription(bold(`${user} was banned`))
			.addFields({
				name: `${inGuildSince ? '' : 'Not '} In Your Server`,
				value: inGuildSince ? formatDistance(Date.now(), inGuildSince) : ' ',
				inline: true,
			});

		if (reason) {
			this.addFields({ name: 'Reason', value: reason });
		}
	}
}

type UnbanEmbedProps = MemberEventEmbedProps & { bannedSince?: Date };

/** An embed informing that a guild member was unbanned. */
export class UnbanEmbed extends MemberEventEmbed {
	constructor({ ban, timestamp, bannedSince }: UnbanEmbedProps) {
		super({ ban, timestamp });

		const { user } = ban;
		this.setColor(Colors.Green)
			.setDescription(bold(`${user} was unbanned`))
			.addFields({
				name: `${bannedSince ? '' : 'Not '} Banned In Your Server`,
				value: bannedSince ? formatDistance(Date.now(), bannedSince) : ' ',
				inline: true,
			});
	}
}

// Handles optionally packing a raw string into BaseMessageOptions.
function packMessage(content?: string | BaseMessageOptions): BaseMessageOptions {
	return typeof content === 'object' ? content : { content };
}
