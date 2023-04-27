/*******************************************************************************
 * This file is part of Sentinel, a ban sharing Discord bot.
 * Copyright (C) 2023 Mimickal (Mia Moretti).
 *
 * Sentinel is free software under the GNU Affero General Public License v3.0.
 * See LICENSE or <https://www.gnu.org/licenses/agpl-3.0.en.html>
 * for more information.
 ******************************************************************************/
import { readFileSync } from 'fs';

import { GuildMember } from 'discord.js';
import * as yaml from 'js-yaml';

interface MinMax {
	min: number;
	max: number;
}

interface Rule {
	path: string;
	value: boolean | number | string | MinMax;
	score: number | MinMax;
}

interface Config {
	version: number;
	rules: Rule[];
}

export default class Suspicion {
	#_configFile: string;
	#_version: number;
	#_rules: Rule[];
	#_maxScore: number;

	constructor(path: string) {
		this.#_configFile = path;
		const config = Suspicion.#loadConfigFromFile(path);

		this.#validateConfig(config);

		this.#_version  = config.version;
		this.#_rules    = config.rules;
		this.#_maxScore = Suspicion.#sumMaxScores(config.rules);
	}

	get version(): number {
		return this.#_version;
	}

	/** Scores a member's suspicion as a percentage. */
	scoreMember(member: GuildMember): number {
		const score = this.#_rules.reduce((sum, rule) => (
			sum + this.#applyRule(member, rule)
		), 0);

		return (score / this.#_maxScore) * 100;
	}

	#applyRule(member: GuildMember, rule: Rule): number {
		return 0; // TODO
	}

	static #loadConfigFromFile(path: string): Config {
		const configContent = readFileSync(path, 'utf-8');
		const configData = yaml.load(configContent, { filename: path });
		return configData as Config;
	}

	static #sumMaxScores(rules: Rule[]): number {
		return rules.reduce<number>((sum, rule) => (
			sum + (typeof rule.score === 'number' ? rule.score : rule.score.max)
		), 0)
	}

	#validateConfig(config: Config): void {
		if (!config.version) this.#error('Missing key "version"');
		if (!config.rules) this.#error('Missing key "rules"');

		config.rules.forEach((rule, idx) => this.#validateRule(rule, idx));
	}

	#validateRule(rule: Rule, idx: number): void {
		if (!rule.path) this.#error(`Missing key "path"`, idx);

		// I would like to do a more complete check that the given path can be
		// translated to a call on GuildMember, but discord.js does something
		// weird that makes some properties not always exist (like "user").
		if (!rule.path.startsWith('member.'))
			this.#error('"path" must start with "member"', idx);

		if (typeof rule.value === 'object') {
			if (typeof rule.value.min !== 'number') this.#error('MinMax "value.min" must be a number', idx);
			if (typeof rule.value.max !== 'number') this.#error('MinMax "value.max" must be a number', idx);
		} else if (rule.value == null) { // Note: Intentionally using loose equality
			this.#error(`"value" must be defined`, idx);
		}

		if (typeof rule.score === 'object') {
			if (typeof rule.score.min !== 'number') this.#error('MinMax "score.min" must be a number', idx);
			if (typeof rule.score.max !== 'number') this.#error('MinMax "score.max" must be a number', idx);

			if (typeof rule.value !== 'object') this.#error('Must use MinMax "value" when using MinMax "score"', idx);
		} else if (typeof rule.score !== 'number') this.#error('"score" must be a number or MinMax', idx);
	}

	#error(reason: string, idx?: number) {
		throw new Error(`${this.#_configFile} ${
			idx === undefined ? 'top-level' : `rules[${idx}]`
		}: ${reason}`);
	}
}
