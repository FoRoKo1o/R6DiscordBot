require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js'); // Dodaj import EmbedBuilder
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const token = process.env.DISCORD_TOKEN;

// Rejestracja komend
const commands = [
    new SlashCommandBuilder()
        .setName('stalker')
        .setDescription('Kacpians moment'),
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
                .setRequired(true)),
    new SlashCommandBuilder()
    .setName('instrukcja')
    .setDescription('Dla debila :)'),
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

// Funkcja scrapująca dane gracza
async function getPlayerStats(nicknameWithId) {
    try {
        const url = `https://stats.cc/pl/siege/${nicknameWithId}`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(response.data);

        // Wyciąganie danych
        const lastPlayed = $('section[aria-labelledby="Ostatnio grane"] span.text-xs.text-contrast-500').text().trim();
        const rankName = $('section[aria-labelledby="Bieżący sezon"] div.text-contrast-100.font-500').text().trim();
        const rp = $('section[aria-labelledby="Bieżący sezon"] div.text-primary-100.text-size-base').text().trim();

        return {
            nicknameWithId,
            lastPlayed,
            rankName,
            rp
        };
    } catch (error) {
        console.error(`Błąd podczas scrapowania danych dla gracza ${nicknameWithId}:`, error);
        return null;
    }
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
    if (interaction.commandName === 'instrukcja') {
        const embed = new EmbedBuilder()
            .setTitle("Jak zostać stalkerem?")
            .setDescription("Klepnij /stalker")
            .addFields(
                {
                name: "/dodaj",
                value: "1. Wchodzisz tutaj https://stats.cc/pl/siege\n2. Szukasz grajka, tak o normalnie\n3. Jak znajdziesz to kopiujesz to co w URL\n4. Klepiesz /dodaj i uzupełniasz\n5. Prościej się nie da",
                inline: false
                },
                {
                name: "/usun",
                value: "1. wpisujesz nick i się usuwa.\n2. WAŻNE: wielkośc liter ma znaczenie",
                inline: false
                },
                {
                name: "/instrukcja",
                value: "Wyświetla tą wiadomość",
                inline: false
                },
            )
            .setColor("#00f529");

        await interaction.reply({ embeds: [embed] });
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
                const nicknameWithId = `${player.nickname}/${player.id}`;
                const stats = await getPlayerStats(nicknameWithId);

                if (stats) {
                    const lastCheckedDate = player.lastChecked ? new Date(player.lastChecked) : null;
                    const currentDate = new Date();
                    const rpChange = player.rp ? parseInt(stats.rp.replace(/,/g, '')) - parseInt(player.rp.replace(/,/g, '')) : null;
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
                    player.lastPlayed = stats.lastPlayed;
                    player.rankName = stats.rankName;
                    player.rp = stats.rp;
                    player.lastChecked = currentDate.toISOString();

                    // Tworzenie embeda
                    const embed = new EmbedBuilder()
                        .setColor(embedColor)
                        .setTitle(`Statystyki gracza: ${player.nickname}`)
                        .addFields(
                            { name: 'Ostatnio grane', value: stats.lastPlayed || 'Brak danych', inline: true },
                            { name: 'Ranga', value: stats.rankName || 'Brak danych', inline: true },
                            { name: 'RP', value: stats.rp || 'Brak danych', inline: true },
                            { name: 'Zmiana RP', value: rpChange !== null ? `${rpChange > 0 ? '+' : ''}${rpChange} RP` : 'Brak danych', inline: true },
                            { name: 'Czas od ostatniego sprawdzenia', value: timeSinceLastCheck, inline: true }
                        )
                        .setTimestamp();

                    embeds.push(embed);
                } else {
                    console.log(`Nie udało się pobrać danych dla ${nicknameWithId}`);
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