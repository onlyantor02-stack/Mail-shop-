const http = require("http");
const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "8750812368:AAGlU5SdbBzkuNspz0jdwRDy7r9g3hcGTCs";
const ADMIN_ID = "6705979177";

const bot = new TelegramBot(TOKEN, { polling: true });
const DB_FILE = "database.json";

let state = {};

let db = {
  users: {},
  products: {},
  deposits: [],
  orders: [],
  settings: {
    paymentNumber: "01XXXXXXXXX"
  }
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    }
  } catch (e) {
    console.log("DB load error:", e.message);
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
      orders: 0
    };
    saveDB();
  }

  return db.users[id];
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
        ["➕ Add Product", "💵 Change Price"],
        ["📥 Add Stock", "📋 Stock List"],
        ["💰 Deposit Requests", "📦 Orders"],
        ["📲 Change Payment", "🔙 User Menu"]
      ],
      resize_keyboard: true
    }
  };
}

bot.onText(/\/start/, (msg) => {
  ensureUser(msg);

  if (isAdmin(msg.chat.id)) {
    return bot.sendMessage(
      msg.chat.id,
      "👑 Welcome Admin\nOSM Token Shop Bot",
      adminMenu()
    );
  }

  return bot.sendMessage(
    msg.chat.id,
    "Welcome to OSM Token Shop Bot",
    userMenu()
  );
});

bot.on("message", async (msg) => {
  const chatId = String(msg.chat.id);
  const text = msg.text || "";
  const user = ensureUser(msg);

  if (text.startsWith("/")) return;

  if (msg.photo && state[chatId]?.type === "depositScreenshot") {
    return handleDepositScreenshot(msg);
  }

  if (state[chatId]) {
    return handleState(msg);
  }

  if (isAdmin(chatId)) {
    if (text === "➕ Add Product") {
      state[chatId] = { type: "addProduct" };
      return bot.sendMessage(
        chatId,
        "Send product like this:\n\nProduct Name | Price\n\nExample:\nNetflix Token | 100"
      );
    }

    if (text === "💵 Change Price") {
      state[chatId] = { type: "changePrice" };
      return bot.sendMessage(
        chatId,
        "Send like this:\n\nProduct Name | New Price\n\nExample:\nNetflix Token | 150"
      );
    }

    if (text === "📥 Add Stock") {
      state[chatId] = { type: "stockProduct" };
      return bot.sendMessage(
        chatId,
        "Send product name first:\n\nExample:\nNetflix Token"
      );
    }

    if (text === "📋 Stock List") {
      return sendStockList(chatId);
    }

    if (text === "💰 Deposit Requests") {
      return sendDepositRequests(chatId);
    }

    if (text === "📦 Orders") {
      return sendOrders(chatId);
    }

    if (text === "📲 Change Payment") {
      state[chatId] = { type: "changePayment" };
      return bot.sendMessage(chatId, "Send new payment number:");
    }

    if (text === "🔙 User Menu") {
      return bot.sendMessage(chatId, "User menu opened.", userMenu());
    }
  }

  if (text === "🛒 Buy Product") {
    return sendProductList(chatId);
  }

  if (text === "👤 My Profile") {
    return bot.sendMessage(chatId, `👤 My Profile

Name: ${user.name}
Username: @${user.username}
User ID: ${user.id}
Balance: ${user.balance}৳
Total Orders: ${user.orders}
Joined: ${user.joined}`);
  }

  if (text === "💰 Deposit") {
    state[chatId] = { type: "depositAmount" };
    return bot.sendMessage(chatId, "Enter deposit amount:");
  }

  if (text === "📦 My Orders") {
    const orders = db.orders.filter(o => o.userId === chatId);

    if (!orders.length) {
      return bot.sendMessage(chatId, "No orders yet.");
    }

    return bot.sendMessage(
      chatId,
      orders.slice(-10).map(o =>
        `Product: ${o.product}\nPrice: ${o.price}৳\nDate: ${o.date}`
      ).join("\n\n")
    );
  }

  if (text === "☎ Support") {
    return bot.sendMessage(chatId, "Support: admin will contact you soon.");
  }
});

async function handleState(msg) {
  const chatId = String(msg.chat.id);
  const text = msg.text || "";
  const st = state[chatId];

  if (st.type === "addProduct") {
    const parts = text.split("|").map(x => x.trim());
    const name = parts[0];
    const price = Number(parts[1]);

    if (!name || !price) {
      return bot.sendMessage(
        chatId,
        "Wrong format.\nUse:\nProduct Name | Price"
      );
    }

    if (!db.products[name]) {
      db.products[name] = {
        name,
        price,
        stock: []
      };
    } else {
      db.products[name].price = price;
    }

    saveDB();
    delete state[chatId];

    return bot.sendMessage(
      chatId,
      `✅ Product saved\n\nProduct: ${name}\nPrice: ${price}৳`,
      adminMenu()
    );
  }

  if (st.type === "changePrice") {
    const parts = text.split("|").map(x => x.trim());
    const name = parts[0];
    const price = Number(parts[1]);

    if (!name || !price) {
      return bot.sendMessage(
        chatId,
        "Wrong format.\nUse:\nProduct Name | New Price"
      );
    }

    if (!db.products[name]) {
      return bot.sendMessage(chatId, "Product not found. Add product first.");
    }

    db.products[name].price = price;
    saveDB();
    delete state[chatId];

    return bot.sendMessage(
      chatId,
      `✅ Price updated\n\nProduct: ${name}\nPrice: ${price}৳`,
      adminMenu()
    );
  }

  if (st.type === "stockProduct") {
    if (!db.products[text]) {
      return bot.sendMessage(
        chatId,
        "Product not found. Product name exactly same hote hobe.\n\nExample:\nNetflix Token"
      );
    }

    state[chatId] = {
      type: "stockTokens",
      product: text
    };

    return bot.sendMessage(
      chatId,
      `Now paste tokens for ${text}\n\n1 token per line:\n\nTOKEN-1\nTOKEN-2\nTOKEN-3`
    );
  }

  if (st.type === "stockTokens") {
    const tokens = text
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    if (!tokens.length) {
      return bot.sendMessage(chatId, "No token found. Paste 1 token per line.");
    }

    db.products[st.product].stock.push(...tokens);
    saveDB();
    delete state[chatId];

    return bot.sendMessage(
      chatId,
      `✅ Stock added\n\nProduct: ${st.product}\nAdded: ${tokens.length}\nTotal Stock: ${db.products[st.product].stock.length}`,
      adminMenu()
    );
  }

  if (st.type === "changePayment") {
    db.settings.paymentNumber = text.trim();
    saveDB();
    delete state[chatId];

    return bot.sendMessage(
      chatId,
      "✅ Payment number updated:\n" + db.settings.paymentNumber,
      adminMenu()
    );
  }

  if (st.type === "depositAmount") {
    const amount = Number(text);

    if (!amount || amount <= 0) {
      return bot.sendMessage(chatId, "Enter valid amount.");
    }

    state[chatId] = {
      type: "depositScreenshot",
      amount
    };

    return bot.sendMessage(chatId, `Send ${amount}৳ to:

${db.settings.paymentNumber}

Then send payment screenshot here.`);
  }
}

async function handleDepositScreenshot(msg) {
  const chatId = String(msg.chat.id);
  const st = state[chatId];

  if (!st || st.type !== "depositScreenshot") return;

  const photoId = msg.photo[msg.photo.length - 1].file_id;

  const dep = {
    id: Date.now(),
    userId: chatId,
    amount: st.amount,
    status: "pending"
  };

  db.deposits.push(dep);
  saveDB();
  delete state[chatId];

  await bot.sendPhoto(ADMIN_ID, photoId, {
    caption: `💰 New Deposit Request

User ID: ${chatId}
Amount: ${dep.amount}৳

Approve:
/approveDeposit ${dep.id}

Reject:
/rejectDeposit ${dep.id}`
  });

  return bot.sendMessage(
    chatId,
    "✅ Deposit screenshot received. Wait for admin approval."
  );
}

function sendProductList(chatId) {
  const products = Object.values(db.products);

  if (!products.length) {
    return bot.sendMessage(chatId, "No product available.");
  }

  return bot.sendMessage(chatId, "Select product:", {
    reply_markup: {
      inline_keyboard: products.map(p => [
        {
          text: `${p.name} - ${p.price}৳ | Stock: ${p.stock.length}`,
          callback_data: `buy:${p.name}`
        }
      ])
    }
  });
}

bot.on("callback_query", async (q) => {
  const chatId = String(q.message.chat.id);
  const data = q.data;
  const user = db.users[chatId];

  if (!data.startsWith("buy:")) return;

  const name = data.replace("buy:", "");
  const product = db.products[name];

  if (!product) {
    return bot.answerCallbackQuery(q.id, {
      text: "Product not found"
    });
  }

  if (product.stock.length <= 0) {
    return bot.answerCallbackQuery(q.id, {
      text: "Out of stock"
    });
  }

  if (user.balance < product.price) {
    return bot.answerCallbackQuery(q.id, {
      text: "Not enough balance"
    });
  }

  const token = product.stock.shift();

  user.balance -= product.price;
  user.orders += 1;

  db.orders.push({
    userId: chatId,
    product: name,
    price: product.price,
    token,
    date: new Date().toLocaleString()
  });

  saveDB();

  await bot.sendMessage(chatId, `✅ Purchase Successful

Product: ${name}
Price: ${product.price}৳

Your Token:
${token}

Balance left: ${user.balance}৳`);

  await bot.sendMessage(ADMIN_ID, `📦 New Order

User ID: ${chatId}
Product: ${name}
Price: ${product.price}৳`);

  return bot.answerCallbackQuery(q.id, {
    text: "Purchased"
  });
});

function sendStockList(chatId) {
  const products = Object.values(db.products);

  if (!products.length) {
    return bot.sendMessage(chatId, "No products found.");
  }

  return bot.sendMessage(
    chatId,
    products.map(p =>
      `📦 ${p.name}\nPrice: ${p.price}৳\nStock: ${p.stock.length}`
    ).join("\n\n")
  );
}

function sendDepositRequests(chatId) {
  const deps = db.deposits.filter(d => d.status === "pending");

  if (!deps.length) {
    return bot.sendMessage(chatId, "No pending deposits.");
  }

  return bot.sendMessage(
    chatId,
    deps.map(d =>
      `ID: ${d.id}\nUser: ${d.userId}\nAmount: ${d.amount}৳\n\nApprove:\n/approveDeposit ${d.id}\n\nReject:\n/rejectDeposit ${d.id}`
    ).join("\n\n")
  );
}

function sendOrders(chatId) {
  if (!db.orders.length) {
    return bot.sendMessage(chatId, "No orders.");
  }

  return bot.sendMessage(
    chatId,
    db.orders.slice(-20).map(o =>
      `User: ${o.userId}\nProduct: ${o.product}\nPrice: ${o.price}৳\nDate: ${o.date}`
    ).join("\n\n")
  );
}

bot.onText(/\/approveDeposit (.+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;

  const id = Number(match[1]);
  const dep = db.deposits.find(d => d.id === id && d.status === "pending");

  if (!dep) {
    return bot.sendMessage(ADMIN_ID, "Deposit not found.");
  }

  if (!db.users[dep.userId]) {
    db.users[dep.userId] = {
      id: dep.userId,
      name: "User",
      username: "none",
      balance: 0,
      joined: new Date().toLocaleString(),
      orders: 0
    };
  }

  db.users[dep.userId].balance += dep.amount;
  dep.status = "approved";
  saveDB();

  bot.sendMessage(
    dep.userId,
    `✅ Deposit approved: ${dep.amount}৳\nNew balance: ${db.users[dep.userId].balance}৳`
  );

  return bot.sendMessage(ADMIN_ID, "✅ Deposit approved.");
});

bot.onText(/\/rejectDeposit (.+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;

  const id = Number(match[1]);
  const dep = db.deposits.find(d => d.id === id && d.status === "pending");

  if (!dep) {
    return bot.sendMessage(ADMIN_ID, "Deposit not found.");
  }

  dep.status = "rejected";
  saveDB();

  bot.sendMessage(dep.userId, "❌ Deposit rejected.");
  return bot.sendMessage(ADMIN_ID, "❌ Deposit rejected.");
});

bot.onText(/\/cancel/, (msg) => {
  const chatId = String(msg.chat.id);
  delete state[chatId];
  return bot.sendMessage(chatId, "Cancelled.", isAdmin(chatId) ? adminMenu() : userMenu());
});

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });
  res.end("OSM Token Shop Bot running");
}).listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

console.log("OSM Token Shop Bot Running...");
