const http = require("http");
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "8750812368:AAGlU5SdbBzkuNspz0jdwRDy7r9g3hcGTCs";
const ADMIN_ID = "6705979177";

const bot = new TelegramBot(TOKEN, { polling: true });

let productName = "Outlook.fr Mail Service";
let price = "499৳";
let paymentNumber = "01XXXXXXXXX";
let pendingOrders = [];

function userMenu() {
  return {
    reply_markup: {
      keyboard: [
        ["🛒 Buy Mail", "💰 Price List"],
        ["📦 My Orders", "☎ Support"]
      ],
      resize_keyboard: true
    }
  };
}

function adminMenu() {
  return {
    reply_markup: {
      keyboard: [
        ["➕ Update Product", "💵 Change Price"],
        ["📲 Change Payment", "📋 Product Info"],
        ["📦 Pending Orders", "🔙 User Menu"]
      ],
      resize_keyboard: true
    }
  };
}

bot.onText(/\/start/, (msg) => {
  const chatId = String(msg.chat.id);

  if (chatId === ADMIN_ID) {
    bot.sendMessage(chatId, "👑 Welcome Admin\nOSM Mail Shop Bot", adminMenu());
  } else {
    bot.sendMessage(chatId, "Welcome to OSM Mail Shop Bot", userMenu());
  }
});

bot.onText(/\/setproduct (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== ADMIN_ID) return;
  productName = match[1];
  bot.sendMessage(ADMIN_ID, "✅ Product updated:\n" + productName);
});

bot.onText(/\/setprice (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== ADMIN_ID) return;
  price = match[1];
  bot.sendMessage(ADMIN_ID, "✅ Price updated:\n" + price);
});

bot.onText(/\/setpayment (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== ADMIN_ID) return;
  paymentNumber = match[1];
  bot.sendMessage(ADMIN_ID, "✅ Payment number updated:\n" + paymentNumber);
});

bot.onText(/\/approve (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== ADMIN_ID) return;

  const userId = match[1];
  pendingOrders = pendingOrders.filter(o => o.userId !== userId);

  bot.sendMessage(userId, `✅ Payment Approved!

Product: ${productName}

Admin will deliver/setup your service shortly.`);

  bot.sendMessage(ADMIN_ID, "✅ Order approved.");
});

bot.onText(/\/reject (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== ADMIN_ID) return;

  const userId = match[1];
  pendingOrders = pendingOrders.filter(o => o.userId !== userId);

  bot.sendMessage(userId, "❌ Payment rejected. Please send correct payment screenshot.");
  bot.sendMessage(ADMIN_ID, "❌ Order rejected.");
});

bot.on("message", async (msg) => {
  const chatId = String(msg.chat.id);
  const text = msg.text || "";

  if (text.startsWith("/")) return;

  if (text === "🔙 User Menu") {
    return bot.sendMessage(chatId, "User menu opened.", userMenu());
  }

  if (chatId === ADMIN_ID) {
    if (text === "➕ Update Product") {
      return bot.sendMessage(chatId, "Send command:\n/setproduct Outlook.fr Mail Service");
    }

    if (text === "💵 Change Price") {
      return bot.sendMessage(chatId, "Send command:\n/setprice 499৳");
    }

    if (text === "📲 Change Payment") {
      return bot.sendMessage(chatId, "Send command:\n/setpayment 01XXXXXXXXX");
    }

    if (text === "📋 Product Info") {
      return bot.sendMessage(chatId, `📋 Product Info

Product: ${productName}
Price: ${price}
Payment: ${paymentNumber}`);
    }

    if (text === "📦 Pending Orders") {
      if (pendingOrders.length === 0) {
        return bot.sendMessage(chatId, "No pending orders.");
      }

      return bot.sendMessage(
        chatId,
        pendingOrders.map(o =>
          `User ID: ${o.userId}
Name: ${o.name}

Approve:
/approve ${o.userId}

Reject:
/reject ${o.userId}`
        ).join("\n\n")
      );
    }
  }

  if (text === "🛒 Buy Mail") {
    return bot.sendMessage(chatId, `🛍 Product: ${productName}

💰 Price: ${price}

📲 Payment Number:
${paymentNumber}

After payment, send screenshot here.`);
  }

  if (text === "💰 Price List") {
    return bot.sendMessage(chatId, `💰 Price List

${productName}
Price: ${price}`);
  }

  if (text === "📦 My Orders") {
    return bot.sendMessage(chatId, "Send payment screenshot here. Admin will verify.");
  }

  if (text === "☎ Support") {
    return bot.sendMessage(chatId, "Support: Admin will contact you soon.");
  }

  if (msg.photo) {
    const user = msg.from;
    const photoId = msg.photo[msg.photo.length - 1].file_id;

    pendingOrders.push({
      userId: chatId,
      name: user.first_name || "Unknown"
    });

    await bot.sendPhoto(ADMIN_ID, photoId, {
      caption: `📥 New Payment Screenshot

👤 Name: ${user.first_name || "Unknown"}
🆔 User ID: ${chatId}
📛 Username: @${user.username || "none"}

Approve:
/approve ${chatId}

Reject:
/reject ${chatId}`
    });

    return bot.sendMessage(chatId, "✅ Screenshot received. Admin will verify your payment.");
  }
});

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OSM Mail Shop Bot is running");
}).listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

console.log("OSM Mail Shop Bot Running...");
