require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js'); // Dodaj import EmbedBuilder
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const token = process.env.DISCORD_TOKEN;

// Rejestracja komend
const commands = [
    new SlashCommandBuilder()
        .setName('stalker')
        .setDescription('Wyświetla statystyki graczy z nicknames.json'),
    new SlashCommandBuilder()
        .setName('dodaj')
        .setDescription('Dodaje nowego gracza do listy')
        .addStringOption(option =>
            option.setName('nickname')
                .setDescription('Nickname gracza')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('id')
                .setDescription('ID gracza')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('usun')
        .setDescription('Usuwa gracza z listy')
        .addStringOption(option =>
            option.setName('nickname')
                .setDescription('Nickname gracza')
                .setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Rejestracja komend aplikacji...');
        await rest.put(
            Routes.applicationCommands('1364165159567753247'),
            { body: commands }
        );
        console.log('Pomyślnie zarejestrowano komendy.');
    } catch (error) {
        console.error(error);
    }
})();

client.on('ready', () => {
    console.log(`Zalogowano jako ${client.user.tag}`);
});

// Funkcja scrapująca dane gracza za pomocą curl
async function getPlayerStatsWithCurl(nickname) {
    return new Promise((resolve, reject) => {
        const url = `https://r6.tracker.network/r6siege/profile/ubi/7ead0857-ae2b-4eeb-b733-c9da04a057cb/overview`;
        const command = `curl -A "Mozilla/5.0" "${url}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                const errorMessage = `Błąd podczas uruchamiania curl: ${error.message}`;
                console.error(errorMessage);
                fs.appendFileSync('output1.txt', `${errorMessage}\n`);
                reject(error);
                return;
            }

            if (stderr && !stdout) {
                const stderrMessage = `Błąd curl: ${stderr}`;
                console.error(stderrMessage);
                fs.appendFileSync('output1.txt', `${stderrMessage}\n`);
                reject(stderr);
                return;
            }

            // Zapis pełnej odpowiedzi do pliku
            fs.appendFileSync('output1.txt', `${stdout}`);

            const $ = cheerio.load(stdout);

            try {
                // Wyciąganie pierwszej sekcji v3-card__body
                const cardBody = $('.v3-card.season-card').first();
                const cardBodyHtml = cardBody.html(); // Pobranie zawartości HTML sekcji

                console.log(`Zawartość pierwszej sekcji v3-card__body dla ${nickname}:`);
                console.log(cardBodyHtml);

                // Parsowanie zawartości cardBodyHtml
                const $$ = cheerio.load(cardBodyHtml);

                // Wyciąganie rank-points
                const rankPoints = $$('.rank-points').text().trim();

                resolve({
                    nickname,
                    rankPoints
                });
            } catch (parseError) {
                const parseErrorMessage = `Błąd podczas parsowania danych: ${parseError.message}`;
                console.error(parseErrorMessage);
                fs.appendFileSync('output1.txt', `${parseErrorMessage}\n`);
                reject(parseError);
            }
        });
    });
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'dodaj') {
        try {
            const nickname = interaction.options.getString('nickname');
            const id = interaction.options.getString('id');

            const players = JSON.parse(fs.readFileSync('nicknames.json', 'utf-8'));

            // Sprawdź, czy gracz już istnieje
            if (players.some(player => player.nickname === nickname)) {
                await interaction.reply(`Gracz ${nickname} już istnieje na liście.`);
                return;
            }

            // Dodaj nowego gracza
            players.push({
                nickname,
                id,
                lastPlayed: null,
                rankName: null,
                rp: null,
                lastChecked: null
            });

            fs.writeFileSync('nicknames.json', JSON.stringify(players, null, 4), 'utf-8');
            await interaction.reply(`Gracz ${nickname} został dodany do listy.`);
        } catch (error) {
            console.error(error);
            await interaction.reply('Wystąpił błąd podczas dodawania gracza.');
        }
    }

    if (interaction.commandName === 'usun') {
        try {
            const nickname = interaction.options.getString('nickname');

            let players = JSON.parse(fs.readFileSync('nicknames.json', 'utf-8'));

            // Filtruj graczy, aby usunąć wskazanego
            const initialLength = players.length;
            players = players.filter(player => player.nickname !== nickname);

            if (players.length === initialLength) {
                await interaction.reply(`Gracz ${nickname} nie został znaleziony na liście.`);
                return;
            }

            fs.writeFileSync('nicknames.json', JSON.stringify(players, null, 4), 'utf-8');
            await interaction.reply(`Gracz ${nickname} został usunięty z listy.`);
        } catch (error) {
            console.error(error);
            await interaction.reply('Wystąpił błąd podczas usuwania gracza.');
        }
    }

    if (interaction.commandName === 'stalker') {
        try {
            const players = JSON.parse(fs.readFileSync('nicknames.json', 'utf-8'));
            const embeds = [];

            for (const player of players) {
                const nickname = `${player.nickname}`;
                const stats = await getPlayerStatsWithCurl(nickname);

                if (stats) {
                    const lastCheckedDate = player.lastChecked ? new Date(player.lastChecked) : null;
                    const currentDate = new Date();
                    const rpChange = player.rp ? parseInt(stats.rankPoints.replace(/,/g, '')) - parseInt(player.rp.replace(/,/g, '')) : null;
                    const timeSinceLastCheck = lastCheckedDate
                        ? `${Math.floor((currentDate - lastCheckedDate) / (1000 * 60 * 60))} godzin temu`
                        : 'Nigdy';

                    // Ustawienie koloru na podstawie zmiany RP
                    let embedColor = '#0099ff'; // Domyślnie niebieski
                    if (rpChange > 0) {
                        embedColor = '#00ff00'; // Zielony
                    } else if (rpChange < 0) {
                        embedColor = '#ff0000'; // Czerwony
                    }

                    // Aktualizacja danych gracza
                    player.rankName = stats.rankName;
                    player.rp = stats.rankPoints;
                    player.lastChecked = currentDate.toISOString();

                    // Tworzenie embeda
                    const embed = new EmbedBuilder()
                        .setColor(embedColor)
                        .setTitle(`Statystyki gracza: ${player.nickname}`)
                        .addFields(
                            { name: 'Ranga', value: stats.rankName || 'Brak danych', inline: true },
                            { name: 'Punkty', value: stats.rankPoints || 'Brak danych', inline: true },
                            { name: 'Zmiana RP', value: rpChange !== null ? `${rpChange > 0 ? '+' : ''}${rpChange} RP` : 'Brak danych', inline: true },
                            { name: 'Czas od ostatniego sprawdzenia', value: timeSinceLastCheck, inline: true }
                        )
                        .setTimestamp();

                    embeds.push(embed);
                } else {
                    console.log(`Nie udało się pobrać danych dla ${nickname}`);
                }
            }

            // Zapisz zaktualizowane dane do pliku JSON
            fs.writeFileSync('nicknames.json', JSON.stringify(players, null, 4), 'utf-8');

            // Wyślij embedy na czat
            if (embeds.length > 0) {
                await interaction.reply({ embeds });
            } else {
                await interaction.reply('Nie udało się pobrać danych dla żadnego gracza.');
            }
        } catch (error) {
            console.error(error);
            await interaction.reply('Wystąpił błąd podczas pobierania danych.');
        }
    }
});

client.login(token);