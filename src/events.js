/**
 * Event handler for when the bot is logged in.
 *
 * Logs the bot user we logged in as.
 */
async function onReady(client) {
	console.info(`Logged in as ${client.user.tag} (${client.user.id})`);
}

module.exports = {
	onReady,
};
