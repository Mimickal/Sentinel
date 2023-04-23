/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { bold, CommandInteraction } from 'discord.js';
import { SlashCommandRegistry } from 'discord-command-registry';

const PACKAGE = require('../package.json');

// Ok guys, I get it. I'll port this library to TypeScript soon (TM).
export default new SlashCommandRegistry()
	.addCommand(command => command
		.setName('info')
		.setDescription(
			'Prints description, version, and link to source code for the bot'
		)
		.setHandler(cmdInfo)
	);

/**
 * Replies with info about this bot, including a link to the source code to be
 * compliant with the AGPLv3 this bot is licensed under.
 */
async function cmdInfo(interaction: CommandInteraction) {
	return interaction.reply([
		PACKAGE.description,
		`${bold('Running version:')} ${PACKAGE.version}`,
		`${bold('Source code:')} ${PACKAGE.homepage}`,
	].join('\n'));
}
