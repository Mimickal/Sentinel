/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { resolve } from 'path';

interface Config {
	app: string;
	token: string;
	database?: string;
	guild?: string;
	logfile?: string;
}

const REQUIRED_KEYS: (keyof Config)[] = ['app', 'token'];
const OPTIONAL_KEYS: (keyof Config)[] = ['database', 'guild', 'logfile'];
const ALL_KEYS = new Set([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);

const configFile = process.argv[2];
if (!configFile) {
	console.log('Usage: npm start <config.json>');
	process.exit(0);
}
const config = require(resolve(configFile));

// Defined in database/knexfile.js
config['database'] = process.env.SENTINEL_DATABASE;

REQUIRED_KEYS.forEach(key => {
	if (config[key] == null)
		throw new Error(`Missing required config key "${key}"`);
});

const extraKeys = Object.keys(config).filter(key => (
	!ALL_KEYS.has(key as keyof Config)
));
if (extraKeys.length > 0)
	console.warn('Extra config keys given:', extraKeys);

export const APP_NAME = 'Sentinel';
export const UNKNOWN_ERR = "Odd. That wasn't supposed to happen.";

// Can do this goofy typecast because we validate all these keys exist above.
export const Env: Config = Array.from(ALL_KEYS).reduce(
	(obj: Partial<Config>, key) => {
	obj[key] = config[key];
	return obj;
}, {}) as Config;
