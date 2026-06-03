const http = require("http");
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const XLSX = require("xlsx");

const TOKEN = "8750812368:AAGlU5SdbBzkuNspz0jdwRDy7r9g3hcGTCs";
const ADMIN_ID = "6705979177";
const bot = new TelegramBot(TOKEN, { polling: true });

const DB_FILE = "database.json";
const TMP_DIR = "tmp_files";

if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR);
}

let state = {};
let db = {
  users: {},
  products: {},
  deposits: [],
  orders: [],
  settings: {
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
    }
  } catch (e) {
    console.log("DB error:", e.message);
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

loadDB();

function isAdmin(id) {
  return String(id) === String(ADMIN_ID);
}

function ensureUser(msg) {
  const id = String(msg.chat.id);
  if (!db.users[id]) {
    db.users[id] = {
      id,
      name: msg.from.first_name || "User",
      username: msg.from.username || "none",
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
    bot.sendMessage(chatId, "⛔ You are banned from using this bot.");
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
  return {
    reply_markup: {
      keyboard: [
        ["📦 Product Management", "📥 Add Stock"],
        ["📊 Live Stock", "💰 Edit Balance"],
        ["💳 Deposit Requests", "📜 Deposit History"],
        ["📲 Change Payment", "👤 User Info"],
        ["👤 User Message", "✏️ Send Broadcast"],
        ["⛔ Ban / Unban", "📦 Orders"],
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

bot.onText(/\/start/, (msg) => {
  state[String(msg.chat.id)] = null;
  const user = ensureUser(msg);
  if (isAdmin(msg.chat.id)) {
    return bot.sendMessage(msg.chat.id, "👑 Welcome Admin", adminMenu());
  }
  if (user.banned) {
    return bot.sendMessage(msg.chat.id, "⛔ You are banned from using this bot.");
  }
  return bot.sendMessage(msg.chat.id, "Welcome to OSM Mail Shop Bot", userMenu());
});

// মেইন মেসেজ হ্যান্ডলার
bot.on("message", async (msg) => {
  const chatId = String(msg.chat.id);
  const text = msg.text || "";
  const user = ensureUser(msg);

  if (text.startsWith("/")) return;

  if (!isAdmin(chatId) && checkBan(chatId)) {
    return;
  }

  // ফাইল এবং স্ক্রিনশট হ্যান্ডলিং
  if (msg.photo && state[chatId]?.type === "depositScreenshot") {
    return handleDepositScreenshot(msg);
  }

  if (isAdmin(chatId) && msg.document && state[chatId]?.type === "stockTokens") {
    return handleStockXlsx(msg);
  }

  // গ্লোবাল কিবোর্ড বাটন প্রেস করলে আগের স্টেট অটোমেটিক ক্যানসেল হবে
  const allButtons = [
    "📦 Product Management", "📥 Add Stock", "📊 Live Stock", "💰 Edit Balance",
    "💳 Deposit Requests", "📜 Deposit History", "📲 Change Payment", "👤 User Info",
    "👤 User Message", "✏️ Send Broadcast", "⛔ Ban / Unban", "📦 Orders", "🔙 User Menu",
    "🛒 Buy Product", "👤 My Profile", "💰 Deposit", "📦 My Orders", "☎ Support",
    "🟣 Change bKash", "🟠 Change Nagad", "🔵 Change Rocket"
  ];

  if (allButtons.includes(text)) {
    state[chatId] = null;
  }

  // যদি কোনো অ্যাক্টিভ স্টেট থাকে, তবে স্টেট হ্যান্ডলার রান হবে
  if (state[chatId] && text !== "") {
    return handleState(msg);
  }

  // অ্যাডমিন প্যানেল কমান্ডস
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
      return bot.sendMessage(chatId, "Send:\n\nUserID | Amount", cancelKeyboard());
    }
    if (text === "💳 Deposit Requests") {
      return sendDepositRequests(chatId);
    }
    if (text === "📜 Deposit History") {
      return sendDepositHistory(chatId);
    }
    if (text === "📲 Change Payment") {
      return bot.sendMessage(chatId, "Select payment method", {
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
    if (text === "👤 User Info") {
      state[chatId] = { type: "userInfo" };
      return bot.sendMessage(chatId, "Send user ID:", cancelKeyboard());
    }
    if (text === "👤 User Message") {
      state[chatId] = { type: "userMessageId" };
      return bot.sendMessage(chatId, "Send user ID:", cancelKeyboard());
    }
    if (text === "✏️ Send Broadcast") {
      state[chatId] = { type: "broadcast" };
      return bot.sendMessage(chatId, "Send broadcast message:", cancelKeyboard());
    }
    if (text === "⛔ Ban / Unban") {
      state[chatId] = { type: "banUser" };
      return bot.sendMessage(chatId, "Send user ID:", cancelKeyboard());
    }
    if (text === "📦 Orders") {
      return sendOrders(chatId);
    }
    if (text === "🔙 User Menu") {
      return bot.sendMessage(chatId, "User menu", userMenu());
    }
  }

  // ইউজার প্যানেল কমান্ডস
  if (text === "👤 My Profile") {
    return bot.sendMessage(chatId, `👤 My Profile\n\nName: ${user.name}\nUsername: @${user.username}\nUser ID: ${user.id}\nBalance: ${user.balance}৳\nTotal Orders: ${user.orders}\nJoined: ${user.joined}`);
  }
  if (text === "💰 Deposit") {
    return bot.sendMessage(chatId, "Select Payment Method", {
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
      return bot.sendMessage(chatId, "No orders found.");
    }
    return bot.sendMessage(chatId, myOrders
      .slice(-20)
      .map((o) => `📦 ${o.product}\nQuantity: ${o.quantity}\nTotal: ${o.total}৳\nDate: ${o.date}`)
      .join("\n\n")
    );
  }
  if (text === "☎ Support") {
    return bot.sendMessage(chatId, "Contact admin for support.");
  }
});

bot.on("callback_query", async (q) => {
  const chatId = String(q.message.chat.id);
  const data = q.data;

  // গ্লোবাল ক্যানসেল হ্যান্ডলার
  if (data === "cancel_action") {
    state[chatId] = null;
    await bot.answerCallbackQuery(q.id, { text: "Operation Cancelled" });
    return bot.sendMessage(chatId, "❌ Action cancelled successfully.", isAdmin(chatId) ? adminMenu() : userMenu());
  }

  // Product Management ইনলাইন হ্যান্ডলার
  if (data.startsWith("pm_")) {
    if (!isAdmin(chatId)) return bot.answerCallbackQuery(q.id, { text: "Access Denied" });
    const action = data.replace("pm_", "");

    if (action === "add") {
      state[chatId] = { type: "addMail" };
      await bot.sendMessage(chatId, "Send:\n\nProduct Name | Price\n\nExample:\nNetflix Token | 120", cancelKeyboard());
    } else if (action === "price") {
      state[chatId] = { type: "setPrice" };
      await bot.sendMessage(chatId, "Send:\n\nProduct Name | New Price", cancelKeyboard());
    } else if (action === "rename") {
      state[chatId] = { type: "renameProduct" };
      await bot.sendMessage(chatId, "Send:\n\nOld Name | New Name", cancelKeyboard());
    } else if (action === "delete") {
      state[chatId] = { type: "deleteProduct" };
      await bot.sendMessage(chatId, "Send the exact Product Name you want to delete:", cancelKeyboard());
    }
    return bot.answerCallbackQuery(q.id);
  }

  if (data.startsWith("deposit_")) {
    const method = data.replace("deposit_", "");
    state[chatId] = { type: "depositAmount", method };
    return bot.sendMessage(chatId, "Enter deposit amount:\n\nMinimum deposit: 20৳", cancelKeyboard());
  }

  if (data.startsWith("buy:")) {
    const productName = data.replace("buy:", "");
    const product = db.products[productName];
    if (!product) {
      return bot.answerCallbackQuery(q.id, { text: "Product not found" });
    }
    if (product.stock.length <= 0) {
      return bot.answerCallbackQuery(q.id, { text: "Out of stock" });
    }
    state[chatId] = { type: "buyQuantity", product: productName };
    await bot.sendMessage(chatId, `📦 ${product.name}\nPrice: ${product.price}৳\nStock: ${product.stock.length}\n\nEnter quantity:`, cancelKeyboard());
    return bot.answerCallbackQuery(q.id, { text: "Enter quantity" });
  }
});

async function handleState(msg) {
  const chatId = String(msg.chat.id);
  const text = msg.text || "";
  const st = state[chatId];
  if (!st) return;

  if (st.type === "addMail") {
    const parts = text.split("|").map((x) => x.trim());
    const name = parts[0];
    const price = Number(parts[1]);
    if (!name || !price) {
      return bot.sendMessage(chatId, "Wrong format.\nUse:\nProduct Name | Price", cancelKeyboard());
    }
    db.products[name] = { name, price, stock: [] };
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Product Added Successfully", adminMenu());
  }

  if (st.type === "setPrice") {
    const parts = text.split("|").map((x) => x.trim());
    const name = parts[0];
    const price = Number(parts[1]);
    if (!db.products[name]) {
      return bot.sendMessage(chatId, "Product not found.", cancelKeyboard());
    }
    db.products[name].price = price;
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Price Updated", adminMenu());
  }

  if (st.type === "renameProduct") {
    const parts = text.split("|").map((x) => x.trim());
    const oldName = parts[0];
    const newName = parts[1];
    if (!db.products[oldName] || !newName) {
      return bot.sendMessage(chatId, "Wrong format or Product not found.\nUse: Old Name | New Name", cancelKeyboard());
    }
    db.products[newName] = { ...db.products[oldName], name: newName };
    delete db.products[oldName];
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, `✅ Product renamed to ${newName}`, adminMenu());
  }

  if (st.type === "deleteProduct") {
    if (!db.products[text]) {
      return bot.sendMessage(chatId, "Product not found. Enter exact name:", cancelKeyboard());
    }
    delete db.products[text];
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, `🗑️ Product "${text}" deleted successfully.`, adminMenu());
  }

  if (st.type === "stockProduct") {
    if (!db.products[text]) {
      return bot.sendMessage(chatId, "Product not found.", cancelKeyboard());
    }
    state[chatId] = { type: "stockTokens", product: text };
    return bot.sendMessage(chatId, `Send stock for: ${text}\n\nSupported:\n✅ Per line text\n✅ XLSX file\n\n1 line = 1 token`, cancelKeyboard());
  }

  if (st.type === "stockTokens") {
    const tokens = text.split(/\r?\n/).filter(Boolean);
    db.products[st.product].stock.push(...tokens);
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, `✅ Stock Added\nAdded: ${tokens.length}`, adminMenu());
  }

  if (st.type === "buyQuantity") {
    const quantity = Number(text);
    if (!quantity || quantity <= 0) {
      return bot.sendMessage(chatId, "Enter valid quantity.", cancelKeyboard());
    }
    const user = db.users[chatId];
    const product = db.products[st.product];
    if (!product) {
      state[chatId] = null;
      return bot.sendMessage(chatId, "Product not found.", userMenu());
    }
    const total = product.price * quantity;

    if (product.stock.length < quantity) {
      return bot.sendMessage(chatId, "Not enough stock.", cancelKeyboard());
    }
    if (user.balance < total) {
      return bot.sendMessage(chatId, `Not enough balance.\nNeed: ${total}৳\nYour Balance: ${user.balance}৳`, cancelKeyboard());
    }

    const bought = product.stock.splice(0, quantity);
    user.balance -= total;
    user.orders += quantity;
    db.orders.push({ userId: chatId, product: product.name, quantity, total, date: new Date().toLocaleString() });
    saveDB();
    state[chatId] = null;

    await bot.sendMessage(chatId, `📦 ${product.name}\nBalance: ${user.balance}৳`);

    if (quantity < 5) {
      for (const token of bought) {
        await bot.sendMessage(chatId, `\`${escapeMarkdown(token)}\``, { parse_mode: "MarkdownV2" });
      }
    } else {
      const filePath = createXlsxFile(bought, chatId);
      await bot.sendDocument(chatId, filePath);
      try { fs.unlinkSync(filePath); } catch {}
    }
    return bot.sendMessage(ADMIN_ID, `📦 New Order\nUser: ${chatId}\nProduct: ${product.name}\nQuantity: ${quantity}\nTotal: ${total}৳`);
  }

  if (st.type === "depositAmount") {
    const amount = Number(text);
    if (amount < 20) {
      return bot.sendMessage(chatId, "❌ Minimum deposit amount is 20৳.", cancelKeyboard());
    }
    const payment = db.settings.paymentMethods[st.method];
    state[chatId] = { type: "depositScreenshot", amount, method: st.method };
    return bot.sendMessage(chatId, `Please send money to the number below using Send Money.\n\n${payment.name}: ${payment.number}\n\nAfter payment, send your payment screenshot here.\n⚠️ Make sure the screenshot is clear.`, cancelKeyboard());
  }

  if (st.type === "changeBkash") {
    db.settings.paymentMethods.bkash.number = text;
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ bKash updated", adminMenu());
  }
  if (st.type === "changeNagad") {
    db.settings.paymentMethods.nagad.number = text;
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Nagad updated", adminMenu());
  }
  if (st.type === "changeRocket") {
    db.settings.paymentMethods.rocket.number = text;
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Rocket updated", adminMenu());
  }

  if (st.type === "editBalance") {
    const parts = text.split("|").map((x) => x.trim());
    const uid = parts[0];
    const amount = Number(parts[1]);
    if (!db.users[uid]) {
      return bot.sendMessage(chatId, "User not found.", cancelKeyboard());
    }
    db.users[uid].balance += amount;
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Balance Updated", adminMenu());
  }

  if (st.type === "userInfo") {
    const u = db.users[text];
    if (!u) {
      return bot.sendMessage(chatId, "User not found.", cancelKeyboard());
    }
    state[chatId] = null;
    return bot.sendMessage(chatId, `👤 User Info\n\nName: ${u.name}\nUsername: @${u.username}\nBalance: ${u.balance}৳\nOrders: ${u.orders}\nBanned: ${u.banned}`);
  }

  if (st.type === "userMessageId") {
    state[chatId] = { type: "userMessageText", uid: text };
    return bot.sendMessage(chatId, "Send message:", cancelKeyboard());
  }
  if (st.type === "userMessageText") {
    await bot.sendMessage(st.uid, text);
    state[chatId] = null;
    return bot.sendMessage(chatId, "✅ Message sent.", adminMenu());
  }

  if (st.type === "broadcast") {
    const users = Object.keys(db.users);
    let sent = 0;
    for (const uid of users) {
      try {
        await bot.sendMessage(uid, text);
        sent++;
      } catch {}
    }
    state[chatId] = null;
    return bot.sendMessage(chatId, `✅ Broadcast Sent\nUsers: ${sent}`, adminMenu());
  }

  if (st.type === "banUser") {
    const uid = text;
    if (!db.users[uid]) {
      return bot.sendMessage(chatId, "User not found.", cancelKeyboard());
    }
    db.users[uid].banned = !db.users[uid].banned;
    saveDB();
    state[chatId] = null;
    return bot.sendMessage(chatId, db.users[uid].banned ? "✅ User banned" : "✅ User unbanned", adminMenu());
  }
}

async function handleDepositScreenshot(msg) {
  const chatId = String(msg.chat.id);
  const st = state[chatId];
  const dep = { id: Date.now(), userId: chatId, amount: st.amount, method: st.method, status: "pending" };
  db.deposits.push(dep);
  saveDB();
  state[chatId] = null;
  const photo = msg.photo[msg.photo.length - 1].file_id;
  await bot.sendPhoto(ADMIN_ID, photo, { caption: `💰 New Deposit\nUser: ${chatId}\nAmount: ${dep.amount}৳\n\nApprove: /approve ${dep.id}\nReject: /reject ${dep.id}` });
  return bot.sendMessage(chatId, "✅ Screenshot received.", userMenu());
}

function sendProductList(chatId) {
  const products = Object.values(db.products);
  if (!products.length) {
    return bot.sendMessage(chatId, "No products available.");
  }
  return bot.sendMessage(chatId, "Select Product", {
    reply_markup: {
      inline_keyboard: products.map((p) => [
        { text: `${p.name} | ${p.price}৳ | Stock: ${p.stock.length}`, callback_data: `buy:${p.name}` }
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
  const filePath = await bot.downloadFile(msg.document.file_id, TMP_DIR);
  const workbook = XLSX.readFile(filePath);
  let tokens = [];
  workbook.SheetNames.forEach((sheet) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1 });
    rows.forEach((row) => {
      row.forEach((cell) => {
        if (cell) {
          tokens.push(String(cell));
        }
      });
    });
  });
  db.products[st.product].stock.push(...tokens);
  saveDB();
  state[chatId] = null;
  try { fs.unlinkSync(filePath); } catch {}
  return bot.sendMessage(chatId, `✅ XLSX Stock Added\nProduct: ${st.product}\nAdded: ${tokens.length}`, adminMenu());
}

function escapeMarkdown(text) {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

function sendStockList(chatId) {
  const products = Object.values(db.products);
  if (!products.length) {
    return bot.sendMessage(chatId, "No stock.");
  }
  return bot.sendMessage(chatId, products
    .map((p) => `${p.name} - Price: ${p.price}৳ | Stock: ${p.stock.length}`)
    .join("\n\n")
  );
}

function sendDepositRequests(chatId) {
  const pending = db.deposits.filter((d) => d.status === "pending");
  if (!pending.length) {
    return bot.sendMessage(chatId, "No pending deposits.");
  }
  return bot.sendMessage(chatId, pending
    .map((d) => `ID: ${d.id}\nUser: ${d.userId}\nAmount: ${d.amount}৳\n\nApprove: /approve ${d.id}\nReject: /reject ${d.id}`)
    .join("\n\n")
  );
}

function sendDepositHistory(chatId) {
  if (!db.deposits.length) {
    return bot.sendMessage(chatId, "No deposit history.");
  }
  return bot.sendMessage(chatId, db.deposits
    .slice(-20)
    .map((d) => `User: ${d.userId}\nAmount: ${d.amount}৳\nStatus: ${d.status}`)
    .join("\n\n")
  );
}

function sendOrders(chatId) {
  if (!db.orders.length) {
    return bot.sendMessage(chatId, "No orders.");
  }
  return bot.sendMessage(chatId, db.orders
    .slice(-20)
    .map((o) => `User: ${o.userId}\nProduct: ${o.product}\nQuantity: ${o.quantity}\nTotal: ${o.total}৳`)
    .join("\n\n")
  );
}

bot.onText(/\/approve (.+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;
  const dep = db.deposits.find((d) => String(d.id) === String(match[1]));
  if (!dep) return;
  
  dep.status = "approved";
  if (db.users[dep.userId]) {
    db.users[dep.userId].balance += dep.amount;
    bot.sendMessage(dep.userId, `✅ Deposit Approved!\nAmount: ${dep.amount}৳`);
  }
  saveDB();
  bot.sendMessage(ADMIN_ID, "✅ Approved successfully.");
});

bot.onText(/\/reject (.+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;
  const dep = db.deposits.find((d) => String(d.id) === String(match[1]));
  if (!dep) return;
  
  dep.status = "rejected";
  saveDB();
  bot.sendMessage(dep.userId, "❌ Your deposit request was rejected.");
  bot.sendMessage(ADMIN_ID, "❌ Rejected successfully.");
});

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OSM Bot Running");
}).listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

setInterval(() => {
  console.log("Keep Alive");
}, 60000);

console.log("OSM Mail Shop Bot Running...");
