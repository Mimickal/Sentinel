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
	Colors,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	GuildBan,
} from 'discord.js';

export class BanButton extends ActionRowBuilder {
	static ID = 'ban';

	constructor() {
		super();
		this.addComponents(new ButtonBuilder()
			.setCustomId(BanButton.ID)
			.setLabel('Ban')
			.setStyle(ButtonStyle.Danger)
		);
	}
}

interface BanEmbedProps {
	ban: GuildBan;
	timestamp: Date;
};

export class BanEmbed extends EmbedBuilder {

	constructor({ ban, timestamp}: BanEmbedProps) {
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
			})
			.setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined })
			.setTimestamp(timestamp);

		if (ban.reason) {
			this.addFields({ name: 'Reason', value: ban.reason });
		}
	}
}
