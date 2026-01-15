const fs = require('fs');
const axios = require('axios');
const ytdl = require('ytdl-core');
const { spawn } = require('child_process');

// ======== إعدادات (Render) ========
const BOT_TOKEN = process.env.BOT_TOKEN; // لا تعدل
const ROOM_ID = process.env.ROOM_ID;     // لا تعدل
const API_URL = 'https://api.highrise.game/bot';

// 👑 حط IDs الأدمن وصاحب الغرفة هنا
const ADMINS = [
    'Mm0.7', // صاحب الغرفة
    'Aa1.6',
    'mo_20'// أدمن
];

// ======== بيانات ========
let songList = [];
let users = {};

if (fs.existsSync('songs.json')) {
    songList = JSON.parse(fs.readFileSync('songs.json'));
}

if (fs.existsSync('users.json')) {
    users = JSON.parse(fs.readFileSync('users.json'));
}

function saveData() {
    fs.writeFileSync('songs.json', JSON.stringify(songList, null, 2));
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

// ======== أدوات ========
async function sendMessage(userId, message) {
    try {
        await axios.post(`${API_URL}/users/${userId}/message`, {
            token: BOT_TOKEN,
            message
        });
    } catch (e) {}
}

function isAdmin(userId) {
    return ADMINS.includes(userId);
}

function isVip(userId) {
    return users[userId]?.vipUntil && Date.now() < users[userId].vipUntil;
}

// ======== اشتراك عادي ========
function subscribe(userId) {
    if (!users[userId]) users[userId] = { gold: 0, tickets: 0 };

    if (users[userId].gold < 10) {
        sendMessage(userId, '❌ لا تملك ذهب كافي');
        return;
    }

    users[userId].gold -= 10;
    users[userId].tickets += 4;
    saveData();

    sendMessage(userId, '✅ حصلت على 4 تذاكر 🎫');
}

// ======== اشتراك VIP ========
function subscribeVip(userId) {
    if (!users[userId]) users[userId] = { gold: 0, tickets: 0 };

    if (users[userId].gold < 500) {
        sendMessage(userId, '❌ تحتاج 500 ذهب للاشتراك VIP');
        return;
    }

    users[userId].gold -= 500;
    users[userId].vipUntil = Date.now() + (7 * 24 * 60 * 60 * 1000);
    saveData();

    sendMessage(userId, '⭐ VIP مفعل أسبوع كامل + أولوية + غير محدود');
}

// ======== صلاحية التشغيل ========
function canPlaySong(userId) {
    if (isAdmin(userId) || isVip(userId)) return true;

    if (!users[userId] || users[userId].tickets < 1) {
        sendMessage(
            userId,
            '❌ تحتاج تذكرة 🎫 أو VIP\n!subscribe / !vip'
        );
        return false;
    }

    users[userId].tickets -= 1;
    saveData();
    return true;
}

// ======== تشغيل ========
async function playSong(url) {
    try {
        const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
        const ffmpeg = spawn('ffmpeg', ['-i', 'pipe:0', '-f', 'mp3', 'pipe:1']);
        stream.pipe(ffmpeg.stdin);

        ffmpeg.stdout.on('data', async chunk => {
            try {
                await axios.post(`${API_URL}/rooms/${ROOM_ID}/stream`, chunk, {
                    headers: {
                        Authorization: `Bearer ${BOT_TOKEN}`,
                        'Content-Type': 'audio/mpeg'
                    }
                });
            } catch (e) {}
        });

        ffmpeg.on('close', playNext);
    } catch (e) {
        playNext();
    }
}

// ======== القائمة (أولوية) ========
function addToList(url, userId) {
    if (isAdmin(userId) && songList.length > 0) {
        songList.unshift(url); // أعلى أولوية
    } else if (isVip(userId) && songList.length > 0) {
        songList.splice(1, 0, url); // بعد الأدمن
    } else {
        songList.push(url);
    }
    saveData();
}

let isPlaying = false;

async function playNext() {
    if (isPlaying || !songList.length) return;
    isPlaying = true;

    const next = songList.shift();
    saveData();
    await playSong(next);

    isPlaying = false;
}

// ======== أوامر ========
async function handleHighriseCommand(userId, command, args) {
    if (!users[userId]) users[userId] = { gold: 0, tickets: 0 };

    switch (command) {
        case 'play':
            if (!args[0]) {
                sendMessage(userId, '❌ حط رابط YouTube');
                break;
            }

            if (!canPlaySong(userId)) break;

            addToList(args[0], userId);

            sendMessage(
                userId,
                isAdmin(userId)
                    ? '👑 أضيفت الأغنية بأولوية الأدمن'
                    : isVip(userId)
                        ? '⭐ أضيفت الأغنية بأولوية VIP'
                        : '🎵 أضيفت الأغنية (تم خصم 🎫)'
            );

            if (songList.length === 1) playNext();
            break;

        case 'vip':
            subscribeVip(userId);
            break;

        case 'subscribe':
            subscribe(userId);
            break;

        case 'balance':
            sendMessage(
                userId,
                `💰 ذهب: ${users[userId].gold}
🎫 تذاكر: ${users[userId].tickets}
⭐ VIP: ${isVip(userId) ? 'مفعل' : 'غير مفعل'}
👑 أدمن: ${isAdmin(userId) ? 'نعم' : 'لا'}`
            );
            break;

        case 'list':
            sendMessage(
                userId,
                `📃 القائمة:\n${songList.length ? songList.join('\n') : 'فارغة'}`
            );
            break;

        case 'skip':
            if (!isAdmin(userId)) {
                sendMessage(userId, '❌ التخطي للأدمن فقط');
                break;
            }
            playNext();
            break;

        case 'stop':
            if (!isAdmin(userId)) {
                sendMessage(userId, '❌ الإيقاف للأدمن فقط');
                break;
            }
            songList = [];
            saveData();
            sendMessage(userId, '🛑 تم إيقاف التشغيل');
            break;

        case 'help':
            sendMessage(
                userId,
`🎶 أوامر البوت:
!play <رابط>
!subscribe
!vip
!balance
!list
!skip (أدمن)
!stop (أدمن)`
            );
            break;
    }
}

// ======== استماع ========
setInterval(async () => {
    try {
        const { data } = await axios.get(
            `${API_URL}/rooms/${ROOM_ID}/commands?token=${BOT_TOKEN}`
        );
        for (const cmd of data) {
            await handleHighriseCommand(cmd.userId, cmd.command, cmd.args);
        }
    } catch (e) {}
}, 2000);

console.log('🔥 بوت Highrise يعمل بنجاح');
