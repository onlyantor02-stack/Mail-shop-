const http = require("http");
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const XLSX = require("xlsx");

const TOKEN = "8750812368:AAGlU5SdbBzkuNspz0jdwRDy7r9g3hcGTCs";
const ADMIN_ID = "6705979177";
const CHANNEL_ID = "-1003933137706"; 
const CHANNEL_LINK = "https://t.me/osmmailshopupdate";
const SUPPORT_LINK = "https://t.me/mrantor07";

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
    paymentMethods: {
      bkash: { name: "bKash", number: "01833878871" },
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
  try {
    const member = await bot.getChatMember(CHANNEL_ID, chatId);
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
    "📢 **আপনাকে অবশ্যই আমাদের আপডেট চ্যানেলে জয়েন করতে হবে!**\n\nচ্যানেলে জয়েন না করলে বটের কোনো ফিচার ব্যবহার করতে পারবেন না। নিচে বাটনে ক্লিক করে জয়েন করুন, তারপর `✅ চেক করুন` বাটনে চাপুন।",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📢 আমাদের চ্যানেল", url: CHANNEL_LINK }],
          [{ text: "✅ চেক করুন", callback_data: "check_join_status" }]
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
  return {
    reply_markup: {
      keyboard: [
        ["📦 Product Management", "📥 Add Stock"],
        ["📊 Live Stock", "💰 Edit Balance"],
        ["💳 Deposit Requests", "📜 Deposit History"],
        ["📲 Change Payment", "👤 User Info"],
        ["👤 User Message", "✏️ Send Broadcast"],
        ["⛔ Ban / Unban", "📦 Orders"],
        ["📁 Backup DB", "📥 Restore DB"],
        ["🔙 User Menu"]
      ],
      resize_keyboard: true
    }
  };
}

function cancelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: "❌ Cancel", callback_data: "cancel_action" }]]
    }
  };
}

bot.onText(/\/start/, async (msg) => {
  const chatId = String(msg.chat.id);
  state[chatId] = null;
  const user = ensureUser(msg);

  if (isAdmin(chatId)) {
    return bot.sendMessage(chatId, "👑 Welcome Admin", adminMenu());
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

  // স্ক্রিনশট রিসিভার স্টেট চেক (শুধুমাত্র বাটন ক্লিকের পরেই কাজ করবে)
  if (msg.photo && state[chatId]?.type === "depositWaitScreenshot") {
    return handleDepositScreenshot(msg);
  }

  // এক্সেল স্টক ফাইল রিসিভার স্টেট চেক
  if (isAdmin(chatId) && msg.document && state[chatId]?.type === "stockTokens") {
    return handleStockXlsx(msg);
  }

  // ব্যাকআপ JSON ফাইল রিসিভার স্টেট চেক
  if (isAdmin(chatId) && msg.document && state[chatId]?.type === "restoreDBFile") {
    return handleRestoreDB(msg);
  }

  const allButtons = [
    "📦 Product Management", "📥 Add Stock", "📊 Live Stock", "💰 Edit Balance",
    "💳 Deposit Requests", "📜 Deposit History", "📲 Change Payment", "👤 User Info",
    "👤 User Message", "✏️ Send Broadcast", "⛔ Ban / Unban", "📦 Orders", "🔙 User Menu",
    "🛒 Buy Product", "👤 My Profile", "💰 Deposit", "📦 My Orders", "☎ Support",
    "🟣 Change bKash", "🟠 Change Nagad", "🔵 Change Rocket", "📁 Backup DB", "📥 Restore DB"
  ];

  if (allButtons.includes(text)) {
    state[chatId] = null;
  }

  if (state[chatId] && text !== "") {
    return handleState(msg);
  }

  // Admin Panel
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
    if (text === "📁 Backup DB") {
      return sendDatabaseBackup(chatId);
    }
    if (text === "📥 Restore DB") {
      state[chatId] = { type: "restoreDBFile" };
      return bot.sendMessage(chatId, "⚠️ Please upload your backup `database.json` file here:", cancelKeyboard());
    }
    if (text === "🔙 User Menu") {
      return bot.sendMessage(chatId, "User menu", userMenu());
    }
  }

  // User Panel
  if (text === "👤 My Profile") {
    const user = db.users[chatId];
    return bot.sendMessage(chatId, `👤 My Profile\n\nName: ${user.name}\nUsername: @${user.username}\nUser ID: ${user.id}\nBalance: ${user.balance}৳\nTotal Orders: ${user.orders}\nJoined: ${user.joined}`);
  }
  if (text === "💰 Deposit") {
    // 1000006625.jpg অনুযায়ী ডিজাইন
    return bot.sendMessage(chatId, "📱 **Deposit**\n\nSelect payment method:", {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔴 bKash", callback_data: "deposit_bkash" },
            { text: "🟠 Nagad", callback_data: "deposit_nagad" }
          ],
          [
            { text: "🟣 Rocket", callback_data: "deposit_rocket" }
          ]
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
    return bot.sendMessage(chatId, "☎ **আমাদের সাপোর্ট টিম**\n\nআপনার যেকোনো সমস্যা বা জিজ্ঞাসার জন্য নিচের বাটনে ক্লিক করে সরাসরি আমাদের সাথে যোগাযোগ করুন।", {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "💬 Contact Admin", url: SUPPORT_LINK }]
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
      await bot.sendMessage(chatId, "🎉 ধন্যবাদ! আপনি সফলভাবে জয়েন করেছেন।", userMenu());
      try { await bot.deleteMessage(chatId, q.message.message_id); } catch {}
    } else {
      await bot.sendMessage(chatId, "❌ আপনি এখনো জয়েন করেননি! দয়া করে আগে জয়েন করুন।");
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
    try { await bot.deleteMessage(chatId, q.message.message_id); } catch {}
    return bot.sendMessage(chatId, "❌ Action cancelled successfully.", isAdmin(chatId) ? adminMenu() : userMenu());
  }

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

  // 1000006626.jpg অনুযায়ী ডিজাইন (মিনিমাম ১০ টাকা)
  if (data.startsWith("deposit_")) {
    const method = data.replace("deposit_", "");
    let displayMethod = method === "bkash" ? "bKash" : method === "nagad" ? "Nagad" : "Rocket";
    state[chatId] = { type: "depositAmount", method };
    
    try { await bot.deleteMessage(chatId, q.message.message_id); } catch {}
    
    return bot.sendMessage(chatId, `🔴 **${displayMethod}**\n\nEnter deposit amount in BDT:\n*(Minimum: 10 BDT)*`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "cancel_action" }]]
      }
    });
  }

  // 1000006628.jpg অনুযায়ী ডিজাইন (✅ Paid বাটনে ক্লিক করলে TrxID চাওয়া হবে)
  if (data.startsWith("paid_")) {
    const parts = data.split("_");
    const method = parts[1];
    const amount = parts[2];
    let displayMethod = method === "bkash" ? "bKash" : method === "nagad" ? "Nagad" : "Rocket";
    
    state[chatId] = { type: "depositTxnId", amount, method };
    try { await bot.deleteMessage(chatId, q.message.message_id); } catch {}
    
    return bot.sendMessage(chatId, `🔖 **Enter Transaction ID**\n\nAmount: **${Number(amount).toFixed(2)} BDT** via **${displayMethod}**\n\nSend the TrxID from your payment SMS\n*(e.g. DF27TNVV17)*`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "cancel_action" }]]
      }
    });
  }

  // 1000006630.jpg অনুযায়ী স্ক্রিনশটের স্টেট অন করা হবে
  if (data.startsWith("get_screenshot_")) {
    const txnId = data.replace("get_screenshot_", "");
    const currentDep = db.deposits.find(d => d.txnId === txnId);
    if (!currentDep) {
      return bot.answerCallbackQuery(q.id, { text: "Session Expired" });
    }
    
    state[chatId] = { type: "depositWaitScreenshot", txnId: txnId };
    try { await bot.deleteMessage(chatId, q.message.message_id); } catch {}
    
    return bot.sendMessage(chatId, `Payment এর screenshot পাঠান –\nAdmin শীঘ্রই verify করবে।`, {
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "cancel_action" }]]
      }
    });
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
    const tokens = msg.text.split(/\r?\n/).filter(Boolean);
    if (!db.products[st.product]) return bot.sendMessage(chatId, "Product context lost.");
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
        await bot.sendMessage(chatId, `\`${token}\``, { parse_mode: "Markdown" });
      }
    } else {
      const filePath = createXlsxFile(bought, chatId);
      try {
        await bot.sendDocument(chatId, filePath);
      } catch (err) {
        console.log("Error sending generated file:", err.message);
      } finally {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
    return;
  }

  // 1000006627.jpg অনুযায়ী ডিজাইন (পেমেন্ট ইনস্ট্রাকশন ও কপি করার জন্য কোড টেক্সট)
  if (st.type === "depositAmount") {
    const amount = Number(text);
    if (!amount || amount < 10) {
      return bot.sendMessage(chatId, "❌ Minimum deposit amount is 10 BDT.", cancelKeyboard());
    }
    const payment = db.settings.paymentMethods[st.method];
    let displayMethod = st.method === "bkash" ? "bKash" : st.method === "nagad" ? "Nagad" : "Rocket";
    
    state[chatId] = null; // টেম্পোরারি স্টেট অফ, বাটন হ্যান্ডেল করবে পরে
    
    return bot.sendMessage(chatId, `📱 **${displayMethod}**\n\nSend **${amount.toFixed(2)} BDT** to:\n\`${payment.number}\`\n\n*Tap the number above to copy*\n\nAfter sending, tap Paid below:`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Paid", callback_data: `paid_${st.method}_${amount}` }],
          [{ text: "❌ Cancel", callback_data: "cancel_action" }]
        ]
      }
    });
  }

  // 1000006629.jpg অনুযায়ী ডিজাইন (TrxID সাবমিট করার পর)
  if (st.type === "depositTxnId") {
    const txnId = text.trim();
    if (db.usedTxnIds.includes(txnId)) {
      return bot.sendMessage(chatId, "❌ This Transaction ID has already been used. Send a valid one:", cancelKeyboard());
    }
    
    let displayMethod = st.method === "bkash" ? "bKash" : st.method === "nagad" ? "Nagad" : "Rocket";
    
    // ডেটাবেজে পেন্ডিং রিকোয়েস্ট তৈরি করে রাখা হচ্ছে
    const dep = { 
      id: Date.now(), 
      userId: chatId, 
      amount: Number(st.amount), 
      method: st.method, 
      txnId: txnId, 
      status: "pending",
      hasScreenshot: false
    };
    db.deposits.push(dep);
    db.usedTxnIds.push(txnId);
    saveDB();
    
    state[chatId] = null; // বাটন ক্লিক না করা পর্যন্ত ফটো রিসিভ করবে না
    
    return bot.sendMessage(chatId, `📥 **TrxID রেকর্ড করা হয়েছে।**\n\n🔖 TrxID : \`${txnId}\`\n💰 Amount : **${Number(st.amount)} BDT**\n\nPayment-এর SMS আসামাত্রই আপনার deposit স্বয়ংক্রিয়ভাবে confirm হয়ে যাবে — অপেক্ষা করুন।\n\nচাইলে আবার TrxID পাঠাতে পারেন, অথবা screenshot দিন:`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📸 Screenshot দিন", callback_data: `get_screenshot_${txnId}` }],
          [{ text: "❌ Cancel", callback_data: "cancel_action" }]
        ]
      }
    });
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
    if (!db.users[uid] || isNaN(amount)) {
      return bot.sendMessage(chatId, "User not found or invalid amount format.", cancelKeyboard());
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
    try {
      await bot.sendMessage(st.uid, text);
      bot.sendMessage(chatId, "✅ Message sent.", adminMenu());
    } catch {
      bot.sendMessage(chatId, "❌ Failed to send message.", adminMenu());
    }
    state[chatId] = null;
    return;
  }

  if (st.type === "broadcast") {
    const users = Object.keys(db.users);
    let sent = 0;
    bot.sendMessage(chatId, "📢 Broadcasting started...");
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

// 1000006630.jpg অনুযায়ী স্ক্রিনশট রিসিভ করার ফাইনাল কনফার্মেশন
async function handleDepositScreenshot(msg) {
  const chatId = String(msg.chat.id);
  const st = state[chatId];
  if (!st) return;
  
  const dep = db.deposits.find(d => d.txnId === st.txnId);
  if (dep) {
    dep.hasScreenshot = true;
    saveDB();
  }
  
  state[chatId] = null;
  
  const photo = msg.photo[msg.photo.length - 1].file_id;
  await bot.sendPhoto(ADMIN_ID, photo, { 
    caption: `💰 New Deposit Request (With Screenshot)\nUser: ${chatId}\nMethod: ${dep ? dep.method.toUpperCase() : "N/A"}\nAmount: ${dep ? dep.amount : "N/A"}৳\nTxn ID: ${st.txnId}\n\nApprove: /approve ${dep ? dep.id : ""}\nReject: /reject ${dep ? dep.id : ""}` 
  }).catch(() => {});
  
  return bot.sendMessage(chatId, `⏱ **Payment sent for review!**\n\nAdmin will verify shortly.`, userMenu());
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
  if (!st || !db.products[st.product]) {
    state[chatId] = null;
    return bot.sendMessage(chatId, "Session error or missing selected product.");
  }
  
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
    return bot.sendMessage(chatId, `✅ XLSX Stock Added\nProduct: ${st.product}\nAdded: ${tokens.length}`, adminMenu());
  } catch (err) {
    console.log(err);
    return bot.sendMessage(chatId, "❌ Failed to parse Excel file.", adminMenu());
  }
}

async function sendDatabaseBackup(chatId) {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return bot.sendMessage(chatId, "❌ No database file found to backup.");
    }
    await bot.sendDocument(chatId, DB_FILE, { caption: `📁 **OSM Shop Live Backup**\n📅 Date: ${new Date().toLocaleString()}` });
  } catch (err) {
    console.log(err);
    bot.sendMessage(chatId, "❌ Failed to send backup file.");
  }
}

async function handleRestoreDB(msg) {
  const chatId = String(msg.chat.id);
  const st = state[chatId];
  if (!st || st.type !== "restoreDBFile") return;

  try {
    if (!msg.document.file_name.endsWith(".json")) {
      return bot.sendMessage(chatId, "❌ Invalid file! Please upload a valid JSON backup file.", cancelKeyboard());
    }

    const rawPath = await bot.downloadFile(msg.document.file_id, TMP_DIR);
    const realPath = path.isAbsolute(rawPath) ? rawPath : path.join(TMP_DIR, path.basename(rawPath));
    
    const fileData = fs.readFileSync(realPath, "utf8");
    const parsedData = JSON.parse(fileData);

    if (!parsedData.users || !parsedData.products || !parsedData.deposits || !parsedData.orders) {
      try { fs.unlinkSync(realPath); } catch {}
      return bot.sendMessage(chatId, "❌ Failed to restore! Key fields are missing.", cancelKeyboard());
    }

    fs.writeFileSync(DB_FILE, JSON.stringify(parsedData, null, 2));
    db = parsedData;

    try { fs.unlinkSync(realPath); } catch {}
    state[chatId] = null;
    return bot.sendMessage(chatId, "📥 **Database Restored Successfully!**\nAll users, stock, and configs are now updated.", adminMenu());
  } catch (err) {
    console.log(err);
    return bot.sendMessage(chatId, "❌ Failed to apply the backup file.", adminMenu());
  }
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
    .map((d) => `ID: ${d.id}\nUser: ${d.userId}\nAmount: ${d.amount}৳\nTxn ID: ${d.txnId || "N/A"}\n\nApprove: /approve ${d.id}\nReject: /reject ${d.id}`)
    .join("\n\n")
  );
}

function sendDepositHistory(chatId) {
  if (!db.deposits.length) {
    return bot.sendMessage(chatId, "No deposit history.");
  }
  return bot.sendMessage(chatId, db.deposits
    .slice(-20)
    .map((d) => `User: ${d.userId}\nAmount: ${d.amount}৳\nTxn ID: ${d.txnId || "N/A"}\nStatus: ${d.status}`)
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
  if (!dep || dep.status !== "pending") return bot.sendMessage(ADMIN_ID, "Deposit not found or already processed.");
  
  dep.status = "approved";
  if (db.users[dep.userId]) {
    db.users[dep.userId].balance += dep.amount;
    bot.sendMessage(dep.userId, `✅ Deposit Approved!\nAmount: ${dep.amount}৳`).catch(() => {});
  }
  saveDB();
  bot.sendMessage(ADMIN_ID, "✅ Approved successfully.");
});

bot.onText(/\/reject (.+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;
  const dep = db.deposits.find((d) => String(d.id) === String(match[1]));
  if (!dep || dep.status !== "pending") return bot.sendMessage(ADMIN_ID, "Deposit not found or already processed.");
  
  dep.status = "rejected";
  if (dep.txnId) {
    db.usedTxnIds = db.usedTxnIds.filter((id) => id !== dep.txnId);
  }
  saveDB();
  bot.sendMessage(dep.userId, "❌ Your deposit request was rejected.").catch(() => {});
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
  console.log("Keep Alive Log");
}, 60000);

console.log("OSM Mail Shop Bot Running...");
