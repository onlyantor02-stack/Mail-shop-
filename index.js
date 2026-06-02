const TelegramBot = require("node-telegram-bot-api");
const http = require("http");

const TOKEN = "8617643107:AAEin47UB0A2js38mLCrPJrZlmaPkd77K8U";
const ADMIN_ID = "6705979177";

const bot = new TelegramBot(TOKEN, { polling: true });

let productName = "Outlook.fr Mail Setup Service";
let price = "499৳";
let paymentNumber = "01XXXXXXXXX";
let productInfo = "Admin will complete your mail setup after payment verification.";
let pendingOrders = [];

function mainMenu() {
  return {
    reply_markup: {
      keyboard: [
        ["🛒 Buy Mail Service", "💰 Price List"],
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
        ["📋 Product Info", "📦 Pending Orders"],
        ["📢 Broadcast", "🔙 User Menu"]
      ],
      resize_keyboard: true
    }
  };
}

bot.onText(/\/start/, (msg) => {
  const id = String(msg.chat.id);

  if (id === ADMIN_ID) {
    bot.sendMessage(id, "👑 Welcome Admin\nOSM Mail Shop Bot", adminMenu());
  } else {
    bot.sendMessage(id, "Welcome to OSM Mail Shop Bot", mainMenu());
  }
});

bot.on("message", async (msg) => {
  const chatId = String(msg.chat.id);
  const text = msg.text || "";

  if (text === "🔙 User Menu") {
    return bot.sendMessage(chatId, "User menu opened.", mainMenu());
  }

  if (text === "🛒 Buy Mail Service") {
    return bot.sendMessage(chatId, `🛍 Product: ${productName}

💰 Price: ${price}

📲 Payment Number:
${paymentNumber}

After payment, send screenshot here.`);
  }

  if (text === "💰 Price List") {
    return bot.sendMessage(chatId, `💰 Current Price

${productName}
Price: ${price}`);
  }

  if (text === "📦 My Orders") {
    return bot.sendMessage(chatId, "Send your payment screenshot. Admin will verify your order.");
  }

  if (text === "☎ Support") {
    return bot.sendMessage(chatId, "Support: Admin will contact you soon.");
  }

  if (chatId === ADMIN_ID) {
    if (text === "➕ Update Product") {
      return bot.sendMessage(chatId, "Use:\n/setproduct Product name here");
    }

    if (text === "💵 Change Price") {
      return bot.sendMessage(chatId, "Use:\n/setprice 499৳");
    }

    if (text === "📋 Product Info") {
      return bot.sendMessage(chatId, `📋 Product Info

Name: ${productName}
Price: ${price}
Payment: ${paymentNumber}
Info: ${productInfo}`);
    }

    if (text === "📦 Pending Orders") {
      if (pendingOrders.length === 0) {
        return bot.sendMessage(chatId, "No pending orders.");
      }

      return bot.sendMessage(
        chatId,
        pendingOrders.map(o =>
          `User ID: ${o.userId}\nName: ${o.name}\nApprove: /approve ${o.userId}\nReject: /reject ${o.userId}`
        ).join("\n\n")
      );
    }

    if (text === "📢 Broadcast") {
      return bot.sendMessage(chatId, "Use:\n/broadcast Your message");
    }
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

Your order for ${productName} is confirmed.
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

bot.onText(/\/broadcast (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== ADMIN_ID) return;
  bot.sendMessage(ADMIN_ID, "Broadcast feature needs database to send all users.");
});

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OSM Mail Shop Bot is running");
}).listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

console.log("OSM Mail Shop Bot Running...");      "Support er jonno admin shortly reply korbe."
    );
  }

  // Payment Screenshot
  if (msg.photo) {
    const user = msg.from;
    const photoId = msg.photo[msg.photo.length - 1].file_id;

    await bot.sendPhoto(
      ADMIN_ID,
      photoId,
      {
        caption: `📥 New Payment Screenshot

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

bot.onText(/\/approve (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== String(ADMIN_ID)) return;

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
});

bot.onText(/\/reject (.+)/, (msg, match) => {
  if (String(msg.chat.id) !== String(ADMIN_ID)) return;

  const userId = match[1];

  bot.sendMessage(
    userId,
    "❌ Payment rejected. Correct screenshot send korun."
  );

  bot.sendMessage(
    ADMIN_ID,
    "❌ User rejected."
  );
});

console.log("Bot Running...");

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running");
}).listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
