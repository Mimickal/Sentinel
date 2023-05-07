/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/

// Table names
const GUILDS = 'guilds';
/** Length of Discord ID. */
const ID_LEN = 20;

/**
 * Make {@link GUILDS}.joined_at nullable and remove default value.
 *
 * SQLite3 does not support alter table statements,
 * so we need to make a new table and copy the old data over.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
	const GUILDS_OLD = `${GUILDS}_old`;

	await knex.schema.renameTable(GUILDS, GUILDS_OLD);

	// Same as old table, except joined_at is nullable with no default.
	await knex.schema.createTable(GUILDS, table => {
		table.string   ('id', ID_LEN).primary();
		table.string   ('name',  100).notNullable();
		table.timestamp('joined_at' ).nullable();
		table.timestamp('left_at'   ).nullable();
	});

	// Copy all the data over to the new table
	await knex(GUILDS).insert(
		await knex(GUILDS_OLD).select()
	);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
	throw new Error("I'm not writing a down migration for this");
};