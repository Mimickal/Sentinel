/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import setupKnex from 'knex';
// @ts-ignore We only use this here where type information is known.
import knexfile from './knexfile';

const config = knexfile[process.env.NODE_ENV ?? 'development'];

/** Knex instance initialized with the config for the current {@link NODE_ENV}. */
const knex = setupKnex(config);
export default knex;
