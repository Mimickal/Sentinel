/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
// All that effort writing the registration script in discord-command-registry
// just to need to do this anyway because TypeScript. lol.
import commands from './commands';
import { Env } from './config';

commands.registerCommands({
	application_id: Env.app,
	guild: Env.guild,
	token: Env.token,
})
.then((got: unknown) => console.log('Success!', got))
.catch((err: Error) => console.error(err));
