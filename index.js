const TelegramBot = require("node-telegram-bot-api");

const TOKEN = process.env.8750812368:AAGlU5SdbBzkuNspz0jdwRDy7r9g3hcGTCs;
const ADMIN_ID = process.env.6705979177;
const bot = new TelegramBot(TOKEN, {
  polling: true
});

const PRICE = "499৳";
const BKASH = "01XXXXXXXXX";
const SERVICE_NAME = "Outlook Email Setup Service";

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Welcome to ${SERVICE_NAME}

Price: ${PRICE}

Choose an option below:`,
    {
      reply_markup: {
        keyboard: [
          ["🛒 Buy Service"],
          ["📦 My Order", "☎ Support"]
        ],
        resize_keyboard: true
      }
    }
  );
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "🛒 Buy Service") {
    bot.sendMessage(
      chatId,
      `🛍 Service: ${SERVICE_NAME}

💰 Price: ${PRICE}

📲 Payment Number:
${BKASH}

bKash/Nagad payment complete kore screenshot send korun.`
    );
  }

  if (text === "📦 My Order") {
    bot.sendMessage(
      chatId,
      "Payment screenshot send korle admin verify korbe."
    );
  }

  if (text === "☎ Support") {
    bot.sendMessage(
      chatId,
      "Support er jonno admin shortly reply korbe."
    );
  }

  // Payment Screenshot
  if (msg.photo) {
    const user = msg.from;
    const photoId =
      msg.photo[msg.photo.length - 1].file_id;

    await bot.sendPhoto(
      ADMIN_ID,
      photoId,
      {
        caption:
`📥 New Payment Screenshot

👤 Name:
${user.first_name || "Unknown"}

🆔 User ID:
${chatId}

📛 Username:
@${user.username || "none"}

Approve:
/approve ${chatId}

Reject:
/reject ${chatId}`
      }
    );

    bot.sendMessage(
      chatId,
      "✅ Screenshot received. Admin verify korbe."
    );
  }
});

bot.onText(
  /\/approve (.+)/,
  (msg, match) => {

    if (
      String(msg.chat.id) !==
      String(ADMIN_ID)
    ) return;

    const userId = match[1];

    bot.sendMessage(
      userId,
      `✅ Payment Approved!

Admin apnar Outlook setup service shortly start korbe.`
    );

    bot.sendMessage(
      ADMIN_ID,
      "✅ User approved."
    );
  }
);

bot.onText(
  /\/reject (.+)/,
  (msg, match) => {

    if (
      String(msg.chat.id) !==
      String(ADMIN_ID)
    ) return;

    const userId = match[1];

    bot.sendMessage(
      userId,
      "❌ Payment rejected. Correct screenshot send korun."
    );

    bot.sendMessage(
      ADMIN_ID,
      "❌ User rejected."
    );
  }
);

console.log("Bot Running...");
