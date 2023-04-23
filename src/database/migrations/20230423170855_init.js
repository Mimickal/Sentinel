/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/

const GUILDS = 'guilds';
const USERS = 'users';
const BANS = 'bans';

/** Length of Discord ID. */
const ID_LEN = 20;

/**
 * Sets up initial tables.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
	await knex.schema.createTable(GUILDS, table => {
		table.string   ('id',               ID_LEN).primary();
		table.string   ('name',             100   ).notNullable();
		table.string   ('alert_channel_id', ID_LEN).nullable();
		table.timestamp('joined_at'               ).defaultTo(knex.fn.now());
		table.timestamp('left_at'                 ).nullable();
	});

	await knex.schema.createTable(USERS, table => {
		table.string   ('id', ID_LEN).primary();
		table.boolean  ('deleted'   ).notNullable().defaultTo(false);
		table.timestamp('created_at').notNullable();
	});

	await knex.schema.createTable(BANS, table => {
		table.increments('id'               ).primary();
		table.string    ('user_id',   ID_LEN).references('id').inTable(USERS);
		table.string    ('guild_id',  ID_LEN).references('id').inTable(GUILDS);
		table.string    ('banned_by', ID_LEN).nullable();
		table.string    ('reason',    512   ).nullable();
		table.timestamp ('banned_at'        ).defaultTo(knex.fn.now());
	});
};

/**
 * Drops initial tables. Essentially returns us to a clean slate.
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
	await knex.schema.dropTable(BANS);
	await knex.schema.dropTable(USERS);
	await knex.schema.dropTable(GUILDS);
};
