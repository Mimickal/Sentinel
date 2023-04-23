/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
const {
	bold,
	Colors,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	GuildBan,
} = require('discord.js');
const { formatDistance } = require('date-fns');

class BanButton extends ActionRowBuilder {
	static ID = 'ban';

	constructor() {
		super().addComponents(new ButtonBuilder()
			.setCustomId(BanButton.ID)
			.setLabel('Ban')
			.setStyle(ButtonStyle.Danger)
		);
	}
}

class BanEmbed extends EmbedBuilder {
	/**
	 * @param {{
	 *     ban: GuildBan,
	 *     timestamp: Date,
	 * }} data
	 */
	constructor({ ban, timestamp }) {
		const { guild, user } = ban;
		super()
			.setColor(Colors.Red)
			.setAuthor({
				name: `${user.username}#${user.discriminator}`,
				iconURL: user.displayAvatarURL(),
			})
			.setDescription(bold(`${user} was banned`))
			.addFields({
				name: 'Account Age',
				value: formatDistance(Date.now(), user.createdAt),
			})
			.setFooter({ text: guild.name, iconURL: guild.iconURL() })
			.setTimestamp(timestamp);

		if (ban.reason) {
			this.addFields({ name: 'Reason', value: ban.reason })
		}
	}
}

module.exports = {
	BanButton,
	BanEmbed,
};
