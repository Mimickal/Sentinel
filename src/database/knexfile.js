/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
const { join, resolve } = require('path');

const sharedSqliteSettings = {
	client: 'sqlite3',
	useNullAsDefault: true,
	migrations: {
		directory: './migrations',
	},
};
const sqlite3Connection = (filename) => ({connection: { filename }});

/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {
	development: {
		...sharedSqliteSettings,
		...sqlite3Connection(join(__dirname, '..', '..', 'dev.sqlite3')),
		// Catches dangling transactions in dev
		pool: {
			min: 1,
			max: 1,
		},
	},

	production: {
		...sharedSqliteSettings,
		...sqlite3Connection(process.env.SENTINEL_DATABASE
				? resolve(process.env.SENTINEL_DATABASE)
				: '/srv/discord/sentinel.sqlite3'
		),
	},
};
