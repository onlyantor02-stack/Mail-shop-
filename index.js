const http = require("http");
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const XLSX = require("xlsx");

const TOKEN = "8750812368:AAGlU5SdbBzkuNspz0jdwRDy7r9g3hcGTCs";
const ADMIN_ID = "6705979177";

const bot = new TelegramBot(TOKEN, { polling: true });

bot.on("polling_error", (err) => console.log("Polling Error:", err.message));

const DB_FILE = "database.json";
const TMP_DIR = path.join(__dirname, "tmp_files");

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

let state = {};
let db = {
  users: {},
  products: {},
  deposits: [],
  orders: [],
  usedTxnIds: [],
  settings: {
    channelId: "-1003933137706",
    channelLink: "https://t.me/osmmailshopupdate",
    supportLink: "https://t.me/mrantor07",
    paymentMethods: {
      bkash: { name: "bKash", number: "018XXXXXXXX" },
      nagad: { name: "Nagad", number: "017XXXXXXXX" },
      rocket: { name: "Rocket", number: "019XXXXXXXX" }
    }
  }
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      if (!db.usedTxnIds) db.usedTxnIds = [];
      if (!db.settings) {
        db.settings = {
          channelId: "-1003933137706",
          channelLink: "https://t.me/osmmailshopupdate",
          supportLink: "https://t.me/mrantor07",
          paymentMethods: {
            bkash: { name: "bKash", number: "018XXXXXXXX" },
            nagad: { name: "Nagad", number: "017XXXXXXXX" },
            rocket: { name: "Rocket", number: "019XXXXXXXX" }
          }
        };
      }
    }
  } catch (e) {
    console.log("DB error:", e.message);
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.log("Save DB error:", e.message);
  }
}

loadDB();

function isAdmin(id) {
  return String(id) === String(ADMIN_ID);
}

async function isJoined(chatId) {
  if (isAdmin(chatId)) return true;
  if (!db.settings.channelId) return true; 
  try {
    const member = await bot.getChatMember(db.settings.channelId, chatId);
    const status = member.status;
    return status === "creator" || status === "administrator" || status === "member";
  } catch (err) {
    console.log("Join Check Error:", err.message);
    return false;
  }
}

async function sendJoinMessage(chatId) {
  return bot.sendMessage(
    chatId,
    "📢 **You must join our update channel first!**\n\nTo use this bot, please join the channel using the button below and then click on the '✅ Check Status' button.",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 Join Channel", url: db.settings.channelLink || "https://t.me" }],
          [{ text: "✅ Check Status", callback_data: "check_join_status" }]
        ]
      }
    }
  );
}

function ensureUser(msg) {
  const id = String(msg.chat.id);
  if (!db.users[id]) {
    db.users[id] = {
      id,
      name: msg.from?.first_name || "User",
      username: msg.from?.username || "none",
      balance: 0,
      joined: new Date().toLocaleString(),
      orders: 0,
      banned: false
    };
    saveDB();
  }
  return db.users[id];
}

function checkBan(chatId) {
  if (db.users[chatId] && db.users[chatId].banned) {
    bot.sendMessage(chatId, "⛔ You are banned from using this bot.").catch(() => {});
    return true;
  }
  return false;
}

function userMenu() {
  return {
    reply_markup: {
      keyboard: [
        ["🛒 Buy Product"],
        ["👤 My Profile", "💰 Deposit"],
        ["📦 My Orders", "☎ Support"]
      ],
      resize_keyboard: true
    }
  };
}

function adminMenu() {
  const totalUsers = Object.keys(db.users).length;
  return {
    caption_text: `👑 **Welcome Admin Panel**\n\n👥 Total Users: ${totalUsers}`,
    reply_markup: {
      keyboard: [
        ["📦 Product Management", "📥 Add Stock"],
        ["📊 Live Stock", "💰 Edit Balance"],
        ["💳 Deposit Requests", "📜 Deposit History"],
        ["📲 Change Payment", "⚙️ Settings"],
        ["🔙 User Menu"]
      ],
      resize_keyboard: true
    }
  };
}

function cancelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: "❌ Cancel Operation", callback_data: "cancel_action" }]]
    }
  };
}

bot.onText(/\/start/, async (msg) => {
  const chatId = String(msg.chat.id);
  state[chatId] = null;
  const user = ensureUser(msg);

  if (isAdmin(chatId)) {
    const menu = adminMenu();
    return bot.sendMessage(chatId, menu.caption_text, { reply_markup: menu.reply_markup.reply_markup });
  }

  if (user.banned) {
    return bot.sendMessage(chatId, "⛔ You are banned from using this bot.");
  }

  const joined = await isJoined(chatId);
  if (!joined) {
    return sendJoinMessage(chatId);
  }

  return bot.sendMessage(chatId, "Welcome to OSM Mail Shop Bot", userMenu());
});

bot.on("message", async (msg) => {
  const chatId = String(msg.chat.id);
  const text = msg.text || "";
  ensureUser(msg);

  if (text.startsWith("/")) return;

  if (!isAdmin(chatId) && checkBan(chatId)) {
    return;
  }

  if (!isAdmin(chatId)) {
    const joined = await isJoined(chatId);
    if (!joined) {
      state[chatId] = null;
      return sendJoinMessage(chatId);
    }
  }

  if (msg.photo && state[chatId]?.type === "depositScreenshot") {
    return handleDepositScreenshot(msg);
  }

  if (isAdmin(chatId) && msg.document && state[chatId]?.type === "stockTokens") {
    return handleStockXlsx(msg);
  }

  const allButtons = [
    "📦 Product Management", "📥 Add Stock", "📊 Live Stock", "💰 Edit Balance",
    "💳 Deposit Requests", "📜 Deposit History", "📲 Change Payment", "⚙️ Settings", "🔙 User Menu",
    "🛒 Buy Product", "👤 My Profile", "💰 Deposit", "📦 My Orders", "☎ Support",
    "🟣 Change bKash", "🟠 Change Nagad", "🔵 Change Rocket"
  ];

  if (allButtons.includes(text)) {
    state[chatId] = null;
  }

  if (state[chatId] && text !== "") {
    return handleState(msg);
  }

  // Admin Commands
  if (isAdmin(chatId)) {
    if (text === "📦 Product Management") {
      return bot.sendMessage(chatId, "📦 **Product Management Menu**\nSelect an option below:", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "➕ Add New Product", callback_data: "pm_add" }],
            [{ text: "🎉 Set Product Price", callback_data: "pm_price" }],
            [{ text: "✏️ Rename Product", callback_data: "pm_rename" }],
            [{ text: "🗑️ Delete Product", callback_data: "pm_delete" }]
          ]
        }
      });
    }
    if (text === "📥 Add Stock") {
      state[chatId] = { type: "stockProduct" };
      return bot.sendMessage(chatId, "Send product name:", cancelKeyboard());
    }
    if (text === "📊 Live Stock") {
      return sendStockList(chatId);
    }
    if (text === "💰 Edit Balance") {
      state[chatId] = { type: "editBalance" };
      return bot.sendMessage(chatId, "Send target details in this format:\n\n`UserID | Amount`\n\n💡 _Tip: Use negative numbers to deduct (e.g. 12345 | -50)_", { parse_mode: "Markdown", ...cancelKeyboard() });
    }
    if (text === "💳 Deposit Requests") {
      return sendDepositRequests(chatId);
    }
    if (text === "📜 Deposit History") {
      return sendDepositHistory(chatId);
    }
    if (text === "📲 Change Payment") {
      return bot.sendMessage(chatId, "Select payment method to modify:", {
        reply_markup: {
          keyboard: [
            ["🟣 Change bKash"],
            ["🟠 Change Nagad"],
            ["🔵 Change Rocket"]
          ],
          resize_keyboard: true
        }
      });
    }
    if (text === "🟣 Change bKash") {
      state[chatId] = { type: "changeBkash" };
      return bot.sendMessage(chatId, "Send new bKash number:", cancelKeyboard());
    }
    if (text === "🟠 Change Nagad") {
      state[chatId] = { type: "changeNagad" };
      return bot.sendMessage(chatId, "Send new Nagad number:", cancelKeyboard());
    }
    if (text === "🔵 Change Rocket") {
      state[chatId] = { type: "changeRocket" };
      return bot.sendMessage(chatId, "Send new Rocket number:", cancelKeyboard());
    }
    if (text === "⚙️ Settings") {
      return bot.sendMessage(chatId, "⚙️ **Global Configuration Control Panel**\nChoose a setting to modify dynamically:", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📢 Force Channel ID", callback_data: "set_f_id" }, { text: "🔗 Channel Link", callback_data: "set_f_link" }],
            [{ text: "☎️ Support Link", callback_data: "set_s_link" }],
            [{ text: "👥 Complete User List", callback_data: "view_u_list" }],
            [{ text: "⛔ Ban / Unban User", callback_data: "set_u_ban" }, { text: "💬 User Details", callback_data: "view_u_info" }],
            [{ text: "📩 Send Direct Message", callback_data: "send_u_msg" }, { text: "📢 Global Broadcast", callback_data: "send_b_cast" }]
          ]
        }
      });
    }
    if (text === "🔙 User Menu") {
      return bot.sendMessage(chatId, "Switching to User Menu view...", userMenu());
    }
  }

  // User Panel Commands
  if (text === "👤 My Profile") {
    const user = db.users[chatId];
    return bot.sendMessage(chatId, `👤 **My Profile**\n\nName: ${user.name}\nUsername: @${user.username}\nUser ID: \`${user.id}\`\nBalance: ${user.balance}৳\nTotal Orders: ${user.orders}\nJoined: ${user.joined}`, { parse_mode: "Markdown" });
  }
  if (text === "💰 Deposit") {
    return bot.sendMessage(chatId, "Select your preferred Payment Method:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🟣 bKash", callback_data: "deposit_bkash" }],
          [{ text: "🟠 Nagad", callback_data: "deposit_nagad" }],
          [{ text: "🔵 Rocket", callback_data: "deposit_rocket" }]
        ]
      }
    });
  }
  if (text === "🛒 Buy Product") {
    return sendProductList(chatId);
  }
  if (text === "📦 My Orders") {
    const myOrders = db.orders.filter((o) => o.userId === chatId);
    if (!myOrders.length) {
      return bot.sendMessage(chatId, "No purchase history found.");
    }
    return bot.sendMessage(chatId, myOrders
      .slice(-20)
      .map((o) => `📦 ${o.product}\nQuantity: ${o.quantity}\nTotal Price: ${o.total}৳\nDate: ${o.date}`)
      .join("\n\n")
    );
  }
  if (text === "☎ Support") {
    const support = db.settings.supportLink || "https://t.me/mrantor07";
    return bot.sendMessage(chatId, "📩 Click the button below to reach our support agent directly:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "☎️ Contact Support", url: support }]
        ]
      }
    });
  }
});

bot.on("callback_query", async (q) => {
  const chatId = String(q.message.chat.id);
  const data = q.data;

  if (data === "check_join_status") {
    const joined = await isJoined(chatId);
    await bot.answerCallbackQuery(q.id);
    if (joined) {
      await bot.sendMessage(chatId, "🎉 Thank you! You have successfully joined our channel.", userMenu());
      try { await bot.deleteMessage(chatId, q.message.message_id); } catch {}
    } else {
      await bot.sendMessage(chatId, "❌ Verification failed! Please join the channel first.");
    }
    return;
  }

  if (!isAdmin(chatId)) {
    const joined = await isJoined(chatId);
    if (!joined) {
      await bot.answerCallbackQuery(q.id, { text: "Please join our channel first!" });
      return sendJoinMessage(chatId);
    }
  }

  if (data === "cancel_action") {
    state[chatId] = null;
    await bot.answerCallbackQuery(q.id, { text: "Operation Cancelled" });
    const menu = adminMenu();
    return bot.sendMessage(chatId, "❌ Action cancelled successfully.", isAdmin(chatId) ? { reply_markup: menu.reply_markup.reply_markup } : userMenu());
  }

  // Dynamic Settings callback handles
  if (isAdmin(chatId)) {
    if (data === "set_f_id") {
      state[chatId] = { type: "setForceId" };
      await bot.sendMessage(chatId, `Current Channel ID: \`${db.settings.channelId}\`\n\nSend new Channel ID:`, { parse_mode: "Markdown", ...cancelKeyboard() });
    }
    else if (data === "set_f_link") {
      state[chatId] = { type: "setForceLink" };
      await bot.sendMessage(chatId, `Current Channel Link: ${db.settings.channelLink}\n\nSend new complete URL link:`, cancelKeyboard());
    }
    else if (data === "set_s_link") {
      state[chatId] = { type: "setSupportLink" };
      await bot.sendMessage(chatId, `Current Support Link: ${db.settings.supportLink}\n\nSend new complete Telegram username link or profile link:`, cancelKeyboard());
    }
    else if (data === "view_u_list") {
      const uKeys = Object.keys(db.users);
      if (!uKeys.length) return bot.sendMessage(chatId, "No registered users found.");
      let output = "👥 **Registered Users List:**\n\n";
      uKeys.forEach((k) => {
        const u = db.users[k];
        output += `• ID: \`${u.id}\` | Name: ${u.name} | Balance: ${u.balance}৳\n`;
      });
      await bot.sendMessage(chatId, output, { parse_mode: "Markdown" });
    }
    else if (data === "set_u_ban") {
      state[chatId] = { type: "banUser" };
      await bot.sendMessage(chatId, "Send User ID to toggle Ban status:", cancelKeyboard());
    }
    else if (data === "view_u_info") {
      state[chatId] = { type: "userInfo" };
      await bot.sendMessage(chatId, "Send target User ID:", cancelKeyboard());
    }
    else if (data === "send_u_msg") {
      state[chatId] = { type: "userMessageId" };
      await bot.sendMessage(chatId, "Send target User ID:", cancelKeyboard());
    }
    else if (data === "send_b_cast") {
      state[chatId] = { type: "broadcast" };
      await bot.sendMessage(chatId, "Send content message for global broadcast:", cancelKeyboard());
    }
  }

  if (data.startsWith("pm_")) {
    if (!isAdmin(chatId)) return bot.answerCallbackQuery(q.id, { text: "Access Denied" });
    const action = data.replace("pm_", "");

    if (action === "add") {
      state[chatId] = { type: "addMail" };
      await bot.sendMessage(chatId, "Send structure:\n\n`Product Name | Price`\n\nExample:\n`Hotmail Fresh | 120`", { parse_mode: "Markdown", ...cancelKeyboard() });
    } else if (action === "price") {
      state[chatId] = { type: "setPrice" };
      await bot.sendMessage(chatId, "Send structure:\n\n`Product Name | New Price`", { parse_mode: "Markdown", ...cancelKeyboard() });
    } else if (action === "rename") {
      state[chatId] = { type: "renameProduct" };
      await bot.sendMessage(chatId, "Send structure:\n\n`Old Name | New Name`", { parse_mode: "Markdown", ...cancelKeyboard() });
    } else if (action === "delete") {
      state[chatId] = { type: "deleteProduct" };
      await bot.sendMessage(chatId, "Send exact Product Name to wipe out:", cancelKeyboard());
    }
    return bot.answerCallbackQuery(q.id);
  }

  if (data.startsWith("deposit_")) {
    const method = data.replace("deposit_", "");
    state[chatId] = { type: "depositAmount", method };
    return bot.sendMessage(chatId, "Enter target deposit amount:\n\n⚠️ Minimum limit: 20৳", cancelKeyboard());
  }

  if (data.startsWith("buy:")) {
    const productName = data.replace("buy:", "");
    const product = db.products[productName];
    if (!product) {
      return bot.answerCallbackQuery(q.id, { text: "Product not found" });
    }
    if (product.stock.length <= 0) {
      return bot.answerCallbackQuery(q.id, { text: "Out of stock configuration" });
    }
    state[chatId] = { type: "buyQuantity", product: productName };
    await bot.sendMessage(chatId, `📦 **${product.name}**\nPrice per item: ${product.price}৳\nAvailable Stock: ${product.stock.length}\n\nEnter required quantity:`, { parse_mode: "Markdown", ...cancelKeyboard() });
    return bot.answerCallbackQuery(q.id);
  }
});

async function handleState(msg) {
  const chatId = String(msg.chat.id);
  const text = msg.text || "";
  const st = state[chatId];
  if (!st) return;

  const menu = adminMenu();

  if (st.type === "setForceId") {
    db.settings.channelId = text.trim();
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Channel ID configured successfully.", { reply_markup: menu.reply_markup.reply_markup });
  }

  if (st.type === "setForceLink") {
    db.settings.channelLink = text.trim();
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Verification Channel URL updated.", { reply_markup: menu.reply_markup.reply_markup });
  }

  if (st.type === "setSupportLink") {
    db.settings.supportLink = text.trim();
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Support agent direct URL redirection modified.", { reply_markup: menu.reply_markup.reply_markup });
  }

  if (st.type === "addMail") {
    const parts = text.split("|").map((x) => x.trim());
    const name = parts[0];
    const price = Number(parts[1]);
    if (!name || !price) {
      return bot.sendMessage(chatId, "Wrong configuration format input.", cancelKeyboard());
    }
    db.products[name] = { name, price, stock: [] };
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Product registered successfully.", { reply_markup: menu.reply_markup.reply_markup });
  }

  if (st.type === "setPrice") {
    const parts = text.split("|").map((x) => x.trim());
    const name = parts[0];
    const price = Number(parts[1]);
    if (!db.products[name]) {
      return bot.sendMessage(chatId, "Target product not matched.", cancelKeyboard());
    }
    db.products[name].price = price;
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Product cost adjusted.", { reply_markup: menu.reply_markup.reply_markup });
  }

  if (st.type === "renameProduct") {
    const parts = text.split("|").map((x) => x.trim());
    const oldName = parts[0];
    const newName = parts[1];
    if (!db.products[oldName] || !newName) {
      return bot.sendMessage(chatId, "Error structure process matching.", cancelKeyboard());
    }
    db.products[newName] = { ...db.products[oldName], name: newName };
    delete db.products[oldName];
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, `✅ Product successfully labeled to: ${newName}`, { reply_markup: menu.reply_markup.reply_markup });
  }

  if (st.type === "deleteProduct") {
    if (!db.products[text]) {
      return bot.sendMessage(chatId, "Target name invalid selection mismatch:", cancelKeyboard());
    }
    delete db.products[text];
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, `🗑️ Product configuration completely terminated.`, { reply_markup: menu.reply_markup.reply_markup });
  }

  if (st.type === "stockProduct") {
    if (!db.products[text]) {
      return bot.sendMessage(chatId, "Product not cataloged inside database.", cancelKeyboard());
    }
    state[chatId] = { type: "stockTokens", product: text };
    return bot.sendMessage(chatId, `Send data inventory for: **${text}**\n\nOptions:\n✅ Plain inline text (Line break parsed)\n✅ Standard .xlsx file data structure`, { parse_mode: "Markdown", ...cancelKeyboard() });
  }

  if (st.type === "stockTokens") {
    const tokens = msg.text.split(/\r?\n/).filter(Boolean);
    if (!db.products[st.product]) return bot.sendMessage(chatId, "Product structure broken context mismatch error.");
    db.products[st.product].stock.push(...tokens);
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, `✅ Raw stock bulk upload processed: ${tokens.length} items logged.`, { reply_markup: menu.reply_markup.reply_markup });
  }

  if (st.type === "buyQuantity") {
    const quantity = Number(text);
    if (!quantity || quantity <= 0) {
      return bot.sendMessage(chatId, "Enter valid numerical value quantity.", cancelKeyboard());
    }
    const user = db.users[chatId];
    const product = db.products[st.product];
    if (!product) {
      state[chatId] = null;
      return bot.sendMessage(chatId, "Product matching context dropped.", userMenu());
    }
    const total = product.price * quantity;

    if (product.stock.length < quantity) {
      return bot.sendMessage(chatId, "Insufficient supply pool selection size.", cancelKeyboard());
    }
    if (user.balance < total) {
      return bot.sendMessage(chatId, `❌ Transaction blocked: Insufficient funds.\nRequired cost: ${total}৳\nYour current wallet: ${user.balance}৳`, cancelKeyboard());
    }

    const bought = product.stock.splice(0, quantity);
    user.balance -= total;
    user.orders += quantity;
    db.orders.push({ userId: chatId, product: product.name, quantity, total, date: new Date().toLocaleString() });
    saveDB();
    state[chatId] = null;

    await bot.sendMessage(chatId, `🛒 **Purchase Successful**\nProduct: ${product.name}\nRemaining Wallet Balance: ${user.balance}৳\n\n📋 **Your Delivered Items:**`);

    if (quantity < 5) {
      for (const token of bought) {
        await bot.sendMessage(chatId, `\`${token}\``, { parse_mode: "Markdown" });
      }
    } else {
      const filePath = createXlsxFile(bought, chatId);
      try {
        await bot.sendDocument(chatId, filePath);
      } catch (err) {
        console.log("File delivery terminal pipe error:", err.message);
      } finally {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
    return bot.sendMessage(ADMIN_ID, `📦 **Alert: New Order Dispatched**\nUser UID: \`${chatId}\`\nCategory item: ${product.name}\nQuantity size: ${quantity}\nGross billing: ${total}৳`, { parse_mode: "Markdown" }).catch(() => {});
  }

  if (st.type === "depositAmount") {
    const amount = Number(text);
    if (!amount || amount < 20) {
      return bot.sendMessage(chatId, "❌ Request denied: Minimum threshold value requirement is 20৳.", cancelKeyboard());
    }
    const payment = db.settings.paymentMethods[st.method];
    state[chatId] = { type: "depositTxnId", amount, method: st.method };
    return bot.sendMessage(chatId, `💳 Send exactly **${amount}৳** using 'Send Money' transfer route to:\n\n• **${payment.name}**: \`${payment.number}\`\n\nOnce money transfer transaction completes, copy and paste the string Transaction ID (TxnID) below:`, { parse_mode: "Markdown", ...cancelKeyboard() });
  }

  if (st.type === "depositTxnId") {
    const txnId = text.trim();
    if (db.usedTxnIds.includes(txnId)) {
      return bot.sendMessage(chatId, "❌ Core Error: Fraud block verification matching failed. Duplicate Transaction ID detected. Provide valid unused ID:", cancelKeyboard());
    }
    state[chatId] = { type: "depositScreenshot", amount: st.amount, method: st.method, txnId: txnId };
    return bot.sendMessage(chatId, "✅ Transaction validation text recorded.\n\nNow, upload a clear visual media payment screenshot proof interface below:", cancelKeyboard());
  }

  if (st.type === "changeBkash") {
    db.settings.paymentMethods.bkash.number = text.trim();
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ bKash routing gateway configuration modified.", { reply_markup: menu.reply_markup.reply_markup });
  }
  if (st.type === "changeNagad") {
    db.settings.paymentMethods.nagad.number = text.trim();
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Nagad routing gateway configuration modified.", { reply_markup: menu.reply_markup.reply_markup });
  }
  if (st.type === "changeRocket") {
    db.settings.paymentMethods.rocket.number = text.trim();
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Rocket routing gateway configuration modified.", { reply_markup: menu.reply_markup.reply_markup });
  }

  if (st.type === "editBalance") {
    const parts = text.split("|").map((x) => x.trim());
    const uid = parts[0];
    const amount = Number(parts[1]);
    if (!db.users[uid] || isNaN(amount)) {
      return bot.sendMessage(chatId, "Validation structural mismatch: User not matching index or incorrect mathematical amount structure layout.", cancelKeyboard());
    }
    
    db.users[uid].balance += amount;
    saveDB();
    state[chatId] = null;
    
    bot.sendMessage(uid, `🔔 Wallet Notification: Your accounting balance was manually adjusted by **${amount}৳**. Current balance status: **${db.users[uid].balance}৳**`).catch(() => {});
    return bot.sendMessage(chatId, `✅ Accounting adjustments completed successfully.\nTarget User ID: \`${uid}\`\nNet Balance Change: ${amount}৳\nNew balance total: ${db.users[uid].balance}৳`, { parse_mode: "Markdown", reply_markup: menu.reply_markup.reply_markup });
  }

  if (st.type === "userInfo") {
    const u = db.users[text.trim()];
    if (!u) {
      return bot.sendMessage(chatId, "User registry index miss. Enter valid database profile matching string ID:", cancelKeyboard());
    }
    state[chatId] = null;
    return bot.sendMessage(chatId, `👤 **Database Registry Information Query:**\n\n• Name Label: ${u.name}\n• Contact Handle: @${u.username}\n• Core Unique ID: \`${u.id}\`\n• Cash Vault: ${u.balance}৳\n• Complete Deliveries: ${u.orders}\n• Blacklisted Blocked: ${u.banned}`, { parse_mode: "Markdown", reply_markup: menu.reply_markup.reply_markup });
  }

  if (st.type === "userMessageId") {
    state[chatId] = { type: "userMessageText", uid: text.trim() };
    return bot.sendMessage(chatId, "Send text message context to deliver to user:", cancelKeyboard());
  }
  if (st.type === "userMessageText") {
    try {
      await bot.sendMessage(st.uid, `📩 **Direct message from Store Admin:**\n\n${text}`);
      bot.sendMessage(chatId, "✅ Core Message successfully channeled.", { reply_markup: menu.reply_markup.reply_markup });
    } catch {
      bot.sendMessage(chatId, "❌ Protocol communication block error: (Did user revoke bot pairing interface?).", { reply_markup: menu.reply_markup.reply_markup });
    }
    state[chatId] = null;
    return;
  }

  if (st.type === "broadcast") {
    const users = Object.keys(db.users);
    let sent = 0;
    bot.sendMessage(chatId, "📢 Global structural notification broadcast framework pipeline executing...");
    for (const uid of users) {
      try {
        await bot.sendMessage(uid, text);
        sent++;
      } catch {}
    }
    state[chatId] = null;
    return bot.sendMessage(chatId, `✅ Global broadcast transmission terminated successfully. Accounts targeted: ${sent}`, { reply_markup: menu.reply_markup.reply_markup });
  }

  if (st.type === "banUser") {
    const uid = text.trim();
    if (!db.users[uid]) {
      return bot.sendMessage(chatId, "Profile target lookup failed. Provide structural valid unique identifier:", cancelKeyboard());
    }
    db.users[uid].banned = !db.users[uid].banned;
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, db.users[uid].banned ? "✅ Security configuration: Profile added to blacklist firewall." : "✅ Profile unbanned from network access.", { reply_markup: menu.reply_markup.reply_markup });
  }
}

async function handleDepositScreenshot(msg) {
  const chatId = String(msg.chat.id);
  const st = state[chatId];
  if (!st) return;
  
  const dep = { 
    id: Date.now(), 
    userId: chatId, 
    amount: st.amount, 
    method: st.method, 
    txnId: st.txnId, 
    status: "pending" 
  };
  
  db.deposits.push(dep);
  db.usedTxnIds.push(st.txnId);
  saveDB();
  state[chatId] = null;
  
  const photo = msg.photo[msg.photo.length - 1].file_id;
  await bot.sendPhoto(ADMIN_ID, photo, { 
    caption: `💰 **Incoming Ledger Verification Request**\nUser Account: \`${chatId}\`\nGateway: ${dep.method.toUpperCase()}\nSum Amount: ${dep.amount}৳\nUnique Txn ID: \`${dep.txnId}\`\n\nApprove command: \`/approve ${dep.id}\`\nReject command: \`/reject ${dep.id}\``,
    parse_mode: "Markdown"
  }).catch(() => {});
  
  return bot.sendMessage(chatId, "✅ Verification evidence successfully delivered. Wallet updating pending ledger evaluation auditing.", userMenu());
}

function sendProductList(chatId) {
  const products = Object.values(db.products);
  if (!products.length) {
    return bot.sendMessage(chatId, "No active product configurations listed inside shop.");
  }
  return bot.sendMessage(chatId, "Select product category profile below:", {
    reply_markup: {
      inline_keyboard: products.map((p) => [
        { text: `${p.name} | Cost: ${p.price}৳ | Available: ${p.stock.length}`, callback_data: `buy:${p.name}` }
      ])
    }
  });
}

function createXlsxFile(tokens, userId) {
  const rows = tokens.map((token) => [token]);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tokens");
  const filePath = path.join(TMP_DIR, `${userId}_${Date.now()}.xlsx`);
  XLSX.writeFile(wb, filePath);
  return filePath;
}

async function handleStockXlsx(msg) {
  const chatId = String(msg.chat.id);
  const st = state[chatId];
  if (!st || !db.products[st.product]) {
    state[chatId] = null;
    return bot.sendMessage(chatId, "Lost environment session matching parameter context dropping error.");
  }
  
  const menu = adminMenu();
  try {
    const rawPath = await bot.downloadFile(msg.document.file_id, TMP_DIR);
    const realPath = path.isAbsolute(rawPath) ? rawPath : path.join(TMP_DIR, path.basename(rawPath));
    
    const workbook = XLSX.readFile(realPath);
    let tokens = [];
    workbook.SheetNames.forEach((sheet) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1 });
      rows.forEach((row) => {
        row.forEach((cell) => {
          if (cell !== undefined && cell !== null) {
            tokens.push(String(cell));
          }
        });
      });
    });
    
    db.products[st.product].stock.push(...tokens);
    saveDB();
    try { fs.unlinkSync(realPath); } catch {}
    state[chatId] = null;
    return bot.sendMessage(chatId, `✅ Inventory parsing complete. Stream verified: ${tokens.length} units embedded successfully inside ${st.product}`, { reply_markup: menu.reply_markup.reply_markup });
  } catch (err) {
    console.log(err);
    return bot.sendMessage(chatId, "❌ Structural parsing validation failure inside .xlsx compilation matrix.", { reply_markup: menu.reply_markup.reply_markup });
  }
}

function sendStockList(chatId) {
  const products = Object.values(db.products);
  if (!products.length) {
    return bot.sendMessage(chatId, "Database is completely empty of product nodes.");
  }
  return bot.sendMessage(chatId, products
    .map((p) => `📦 **${p.name}**\nPrice configuration: ${p.price}৳\nLogged data lines inside array: ${p.stock.length} units`)
    .join("\n\n"), { parse_mode: "Markdown" }
  );
}

function sendDepositRequests(chatId) {
  const pending = db.deposits.filter((d) => d.status === "pending");
  if (!pending.length) {
    return bot.sendMessage(chatId, "No pending audits found on ledger queue.");
  }
  return bot.sendMessage(chatId, pending
    .map((d) => `ID reference: \`${d.id}\`\nUser trace: \`${d.userId}\`\nDeposit target: ${d.amount}৳\nMatching Txn ID: \`${d.txnId || "N/A"}\`\n\nAction configuration execution:\n/approve ${d.id}\n/reject ${d.id}`)
    .join("\n\n"), { parse_mode: "Markdown" }
  );
}

function sendDepositHistory(chatId) {
  if (!db.deposits.length) {
    return bot.sendMessage(chatId, "Historical payment log stream is blank empty.");
  }
  return bot.sendMessage(chatId, db.deposits
    .slice(-20)
    .map((d) => `User account tracking: \`${d.userId}\`\nNet transaction: ${d.amount}৳\nIndexed dynamic string code: \`${d.txnId || "N/A"}\`\nAuditing status notation: [ ${d.status.toUpperCase()} ]`)
    .join("\n\n"), { parse_mode: "Markdown" }
  );
}

bot.onText(/\/approve (.+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;
  const dep = db.deposits.find((d) => String(d.id) === String(match[1]));
  if (!dep || dep.status !== "pending") return bot.sendMessage(ADMIN_ID, "Target ID transaction mismatch parameter error matching lookup configuration entry loop.");
  
  dep.status = "approved";
  if (db.users[dep.userId]) {
    db.users[dep.userId].balance += dep.amount;
    bot.sendMessage(dep.userId, `✅ **Wallet Deposit Verified Successfully**\nAdded: +${dep.amount}৳\nYour account net updated balance: ${db.users[dep.userId].balance}৳`).catch(() => {});
  }
  saveDB();
  bot.sendMessage(ADMIN_ID, "✅ Account ledger verification approval authorized successfully.");
});

bot.onText(/\/reject (.+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;
  const dep = db.deposits.find((d) => String(d.id) === String(match[1]));
  if (!dep || dep.status !== "pending") return bot.sendMessage(ADMIN_ID, "Audit queue sequence context missing error.");
  
  dep.status = "rejected";
  if (dep.txnId) {
    db.usedTxnIds = db.usedTxnIds.filter((id) => id !== dep.txnId);
  }
  saveDB();
  bot.sendMessage(dep.userId, "❌ **Deposit Verification Failed**\nYour payment tracking confirmation verification reference request was denied by store admin auditor evaluation system.").catch(() => {});
  bot.sendMessage(ADMIN_ID, "❌ Deposit request terminated execution cycle.");
});

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OSM Shop Core Online Dynamic Routing Active Process Node System");
}).listen(PORT);

setInterval(() => {
  console.log("Keep Alive Log");
}, 60000);

console.log("OSM Mail Shop Bot Running");
