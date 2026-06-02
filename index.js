const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ==========================================
// CONFIGURATION & ENVIRONMENT SETUP
// ==========================================
const TOKEN = "8750812368:AAGlU5SdbBzkuNspz0jdwRDy7r9g3hcGTCs";
const ADMIN_ID = "6705979177";
const PORT = process.env.PORT || 3000;

if (!TOKEN || !ADMIN_ID) {
    console.error("❌ CRITICAL ERROR: BOT_TOKEN and ADMIN_ID environment variables must be provided.");
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// Global Configuration (In-Memory default, overwritten by Admin)
let CONFIG = {
    paymentNumber: "Ekhono set kora hoy ni"
};

const userState = {};

// ==========================================
// WEB SERVER FOR RENDER HEALTH CHECKS
// ==========================================
const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'UP', timestamp: new Date() }));
    } else {
        res.writeHead(404);
        res.end();
    }
});
server.listen(PORT, () => {
    console.log(`🚀 Health check server running on port ${PORT}`);
});

// ==========================================
// DATABASE ENGINE (JSON)
// ==========================================
const FILE_PATHS = {
    users: path.join(__dirname, 'users.json'),
    products: path.join(__dirname, 'products.json'),
    orders: path.join(__dirname, 'orders.json'),
    deposits: path.join(__dirname, 'deposits.json')
};

function readData(key) {
    try {
        if (!fs.existsSync(FILE_PATHS[key])) {
            fs.writeFileSync(FILE_PATHS[key], JSON.stringify([]));
            return [];
        }
        const data = fs.readFileSync(FILE_PATHS[key], 'utf8');
        return JSON.parse(data || '[]');
    } catch (err) {
        console.error(`Error reading ${key} DB:`, err);
        return [];
    }
}

function writeData(key, data) {
    try {
        fs.writeFileSync(FILE_PATHS[key], JSON.stringify(data, null, 2));
    } catch (err) {
        console.error(`Error writing to ${key} DB:`, err);
    }
}

// Initialize JSON Data Files
Object.keys(FILE_PATHS).forEach(key => readData(key));

// ==========================================
// USER CONFIG MANAGER
// ==========================================
function getOrCreateUser(msg) {
    const users = readData('users');
    const userId = msg.from.id;
    let user = users.find(u => u.id === userId);

    if (!user) {
        user = {
            id: userId,
            firstName: msg.from.first_name || 'User',
            username: msg.from.username || 'N/A',
            balance: 0,
            totalOrders: 0,
            joinDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        };
        users.push(user);
        writeData('users', users);
    } else {
        let updated = false;
        if (msg.from.username && user.username !== msg.from.username) { user.username = msg.from.username; updated = true; }
        if (msg.from.first_name && user.firstName !== msg.from.first_name) { user.firstName = msg.from.first_name; updated = true; }
        if (updated) writeData('users', users);
    }
    return user;
}

function updateUserBalance(userId, amount) {
    const users = readData('users');
    const index = users.findIndex(u => u.id === userId);
    if (index !== -1) {
        users[index].balance = parseFloat((users[index].balance + amount).toFixed(2));
        writeData('users', users);
        return users[index];
    }
    return null;
}

// ==========================================
// UI KEYBOARDS
// ==========================================
const KEYBOARDS = {
    userMain: {
        reply_markup: {
            keyboard: [
                [{ text: '🛒 Buy Product' }, { text: '👤 My Profile' }],
                [{ text: '💰 Deposit' }, { text: '📦 My Orders' }],
                [{ text: '☎ Support' }]
            ],
            resize_keyboard: true
        }
    },
    adminMain: {
        reply_markup: {
            keyboard: [
                [{ text: '➕ Add Product' }, { text: '💵 Change Price' }],
                [{ text: '📥 Add Stock' }, { text: '📋 Stock List' }],
                [{ text: '💰 Deposit Requests' }, { text: '📦 Orders' }],
                [{ text: '📢 Broadcast' }, { text: '📲 Change Payment Number' }],
                [{ text: '🔙 User Menu' }]
            ],
            resize_keyboard: true
        }
    }
};

// ==========================================
// INCOMING MESSAGE ROUTER
// ==========================================
bot.on('message', async (msg) => {
    if (!msg.text && !msg.photo) return;
    
    const userId = msg.from.id;
    const text = msg.text;
    const user = getOrCreateUser(msg);

    // Multi-step Wizard Input Handling
    if (userState[userId]) {
        handleWizardState(msg);
        return;
    }

    if (text === '/start' || text === '🔙 User Menu') {
        let welcomeMsg = `👋 *Welcome to our Digital Shop Bot, ${msg.from.first_name}!*\n\n🛒 Nicher menu theke apnar pochondonwji option select korun.`;
        if (userId === ADMIN_ID) {
            welcomeMsg += `\n\n⚡ _Admin Access Detected. /admin command use kore full control panel dekhte parben._`;
        }
        return bot.sendMessage(userId, welcomeMsg, { parse_mode: 'Markdown', ...KEYBOARDS.userMain });
    }

    if (text === '/admin') {
        if (userId !== ADMIN_ID) return bot.sendMessage(userId, "⛔ *Access Denied:* Apni ei bot er admin non.", { parse_mode: 'Markdown' });
        return bot.sendMessage(userId, "⚙️ *Welcome to Admin Dashboard.* Nicher menu theke action select korun:", { parse_mode: 'Markdown', ...KEYBOARDS.adminMain });
    }

    // --- USER ACTIONS ---
    switch (text) {
        case '👤 My Profile':
            const profileText = `👤 *YOUR ACCOUNT PROFILE*\n` +
                                `━━━━━━━━━━━━━━━━━━\n` +
                                `🏷️ *Name:* ${user.firstName}\n` +
                                `🌐 *Username:* @${user.username}\n` +
                                `🆔 *User ID:* \`${user.id}\`\n` +
                                `💰 *Balance:* $${user.balance.toFixed(2)}\n` +
                                `📦 *Total Orders:* ${user.totalOrders} item(s)\n` +
                                `📅 *Join Date:* ${user.joinDate}`;
            return bot.sendMessage(userId, profileText, { parse_mode: 'Markdown' });

        case '🛒 Buy Product':
            const products = readData('products');
            if (products.length === 0) {
                return bot.sendMessage(userId, "📭 Ekhono kono product add kora hoy ni. Kripoya pore chesta korun!");
            }
            
            const productButtons = products.map(p => [{ text: `🛍️ ${p.name} - $${p.price.toFixed(2)} (${p.stock.length} left)`, callback_data: `buy_${p.name}` }]);
            return bot.sendMessage(userId, "🛒 *Available Products:*
Kinnte chahile nicher product select korun:", {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: productButtons }
            });

        case '💰 Deposit':
            userState[userId] = { action: 'DEPOSIT_AMOUNT' };
            return bot.sendMessage(userId, "💰 *Add Balance*\nApni koto deposit korte chan shei amount lekhen (Example: 10 ba 25):", { parse_mode: 'Markdown' });

        case '📦 My Orders':
            const orders = readData('orders').filter(o => o.userId === userId);
            if (orders.length === 0) {
                return bot.sendMessage(userId, "📦 *No Purchases Found:* Apni ekhono kono product kinen ni.");
            }
            
            let ordersSummary = `📦 *Apnar Order History (${orders.length}):*\n\n`;
            orders.slice(-10).forEach((o) => {
                ordersSummary += `🔹 *Order ID:* \`${o.orderId}\` | *${o.productName}*\n💵 Price: $${o.price.toFixed(2)} | 📅 _${o.date}_\n🔑 *Delivered Product:*\n\`${o.item}\`\n━━━━━━━━━━━━━━━━━━\n`;
            });
            return bot.sendMessage(userId, ordersSummary, { parse_mode: 'Markdown' });

        case '☎ Support':
            return bot.sendMessage(userId, `☎ *Customer Support*\n━━━━━━━━━━━━━━━━━━\nKono shomoshya ba proshno thakle shortasorti admin er shathe jogajog korun:\n\n💬 *Admin Username:* @${(getOrCreateUser({from: {id: ADMIN_ID}})).username || 'Admin'}`, { parse_mode: 'Markdown' });
    }

    // --- ADMIN ACTIONS ---
    if (userId === ADMIN_ID) {
        switch (text) {
            case '➕ Add Product':
                userState[userId] = { action: 'ADD_PROD_NAME' };
                return bot.sendMessage(userId, "📝 Product er *Name* (naam) likhe pathan:", { parse_mode: 'Markdown' });

            case '💵 Change Price':
                const prods = readData('products');
                if (prods.length === 0) return bot.sendMessage(userId, "❌ Kono product nei.");
                const priceButtons = prods.map(p => [{ text: `${p.name} ($${p.price})`, callback_data: `editprice_${p.name}` }]);
                return bot.sendMessage(userId, "💵 Dam (Price) change korar jonno product select korun:", {
                    reply_markup: { inline_keyboard: priceButtons }
                });

            case '📥 Add Stock':
                const stockProds = readData('products');
                if (stockProds.length === 0) return bot.sendMessage(userId, "❌ Stock add korar moto kono product nei.");
                const stockButtons = stockProds.map(p => [{ text: `${p.name} (${p.stock.length} left)`, callback_data: `addstock_${p.name}` }]);
                return bot.sendMessage(userId, "📥 Jei product a stock token add korte chan sheti select korun:", {
                    reply_markup: { inline_keyboard: stockButtons }
                });

            case '📋 Stock List':
                const allProds = readData('products');
                if (allProds.length === 0) return bot.sendMessage(userId, "📁 Kono product add kora nei.");
                let inventoryState = "📋 *SYSTEM INVENTORY STOCK LIST:*\n━━━━━━━━━━━━━━━━━━\n";
                allProds.forEach(p => {
                    inventoryState += `📦 *Product:* ${p.name}\n💰 Price: $${p.price.toFixed(2)} | 🛒 Stock Left: *${p.stock.length} units*\n━━━━━━━━━━━━━━━━━━\n`;
                });
                return bot.sendMessage(userId, inventoryState, { parse_mode: 'Markdown' });

            case '💰 Deposit Requests':
                const deposits = readData('deposits').filter(d => d.status === 'PENDING');
                if (deposits.length === 0) return bot.sendMessage(userId, "✅ Kono pending deposit request nei.");
                
                for (const d of deposits) {
                    const depUIStr = `🔔 *PENDING DEPOSIT REQUEST*\n━━━━━━━━━━━━━━━━━━\n👤 User ID: \`${d.userId}\`\n💵 Amount: *$${d.amount.toFixed(2)}*\n🕒 Request ID: \`${d.id}\``;
                    await bot.sendPhoto(ADMIN_ID, d.photoFileId, {
                        caption: depUIStr,
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Approve', callback_data: `dep_app_${d.id}` }],
                                [{ text: '❌ Reject', callback_data: `dep_rej_${d.id}` }]
                            ]
                        }
                    });
                }
                return;

            case '📦 Orders':
                const allOrders = readData('orders');
                if (allOrders.length === 0) return bot.sendMessage(userId, "❌ Ekhono kono order hoy ni.");
                let historyStr = `📋 *All System Orders (Latest 15):*\n━━━━━━━━━━━━━━━━━━\n`;
                allOrders.slice(-15).reverse().forEach(o => {
                    historyStr += `🆔 Order: \`${o.orderId}\`\n👤 Buyer: \`${o.userId}\` | Item: *${o.productName}*\n💵 Price: $${o.price.toFixed(2)} | Date: _${o.date}_\n━━━━━━━━━━━━━━━━━━\n`;
                });
                return bot.sendMessage(userId, historyStr, { parse_mode: 'Markdown' });

            case '📢 Broadcast':
                userState[userId] = { action: 'BCAST_MSG' };
                return bot.sendMessage(userId, "📢 Shobai ke pathanor jonno message details likhen:");

            case '📲 Change Payment Number':
                userState[userId] = { action: 'SET_PAY_NUM' };
                return bot.sendMessage(userId, `📲 *Current Payment Number/Method:* \`${CONFIG.paymentNumber}\`\n\nNotun payment account/number pathan:`, { parse_mode: 'Markdown' });
        }
    }
});

// ==========================================
// WIZARD CONTEXT MULTI-STEP INPUTS
// ==========================================
function handleWizardState(msg) {
    const userId = msg.from.id;
    const state = userState[userId];
    const text = msg.text;

    if (text === '/start' || text === '🔙 User Menu') {
        delete userState[userId];
        return bot.sendMessage(userId, "🔄 Proriya cancel kora hoyeche.", { ...KEYBOARDS.userMain });
    }

    switch (state.action) {
        case 'ADD_PROD_NAME':
            state.pName = text.trim();
            state.action = 'ADD_PROD_PRICE';
            return bot.sendMessage(userId, `🏷️ Product Name: *${state.pName}*\nEbar product er daam (Price in USD $) likhen:`, { parse_mode: 'Markdown' });

        case 'ADD_PROD_PRICE':
            const basePrice = parseFloat(text);
            if (isNaN(basePrice) || basePrice < 0) return bot.sendMessage(userId, "⚠️ Sthik number likhen:");
            
            const products = readData('products');
            if (products.some(p => p.name.toLowerCase() === state.pName.toLowerCase())) {
                delete userState[userId];
                return bot.sendMessage(userId, "❌ Ei naame borabor product ase.");
            }
            
            products.push({ name: state.pName, price: basePrice, stock: [] });
            writeData('products', products);
            delete userState[userId];
            return bot.sendMessage(userId, `✅ *Success:* \`${state.pName}\` product add kora hoyeche $${basePrice.toFixed(2)} daame.`, { parse_mode: 'Markdown', ...KEYBOARDS.adminMain });

        case 'EDIT_PRICE_VAL':
            const newPrice = parseFloat(text);
            if (isNaN(newPrice) || newPrice < 0) return bot.sendMessage(userId, "⚠️ Sthik number likhen:");
            
            const prodsList = readData('products');
            const pIdx = prodsList.findIndex(p => p.name === state.targetProd);
            if (pIdx !== -1) {
                prodsList[pIdx].price = newPrice;
                writeData('products', prodsList);
                bot.sendMessage(userId, `✅ *${state.targetProd}* er daam change kore $${newPrice.toFixed(2)} kora hoyeche.`, { parse_mode: 'Markdown', ...KEYBOARDS.adminMain });
            }
            delete userState[userId];
            return;

        case 'ADD_STOCK_DATA':
            if (!text) return bot.sendMessage(userId, "⚠️ Kono valid text paoya jay ni.");
            const incomingTokens = text.split('\n').map(t => t.trim()).filter(t => t.length > 0);
            
            if (incomingTokens.length === 0) return bot.sendMessage(userId, "⚠️ Proti line a ekti kore token likhe pathan:");
            
            const pCatalog = readData('products');
            const targetIdx = pCatalog.findIndex(p => p.name === state.targetProd);
            if (targetIdx !== -1) {
                pCatalog[targetIdx].stock.push(...incomingTokens);
                writeData('products', pCatalog);
                bot.sendMessage(userId, `📥 *Stock Added Successfully!*\n*${incomingTokens.length}* ti stock item add kora hoyeche *${state.targetProd}* a.`, { parse_mode: 'Markdown', ...KEYBOARDS.adminMain });
            }
            delete userState[userId];
            return;

        case 'DEPOSIT_AMOUNT':
            const depAmt = parseFloat(text);
            if (isNaN(depAmt) || depAmt <= 0) return bot.sendMessage(userId, "⚠️ Sthik numerical number likhen:");
            
            state.amount = depAmt;
            state.action = 'DEPOSIT_PROOF';
            
            const instructions = `💳 *Payment Details:*\n━━━━━━━━━━━━━━━━━━\n` +
                                 `➡️ Apni *$${depAmt.toFixed(2)}* nicher payment account a send korun:\n\n` +
                                 `📥 Address / Number: \`${CONFIG.paymentNumber}\`\n\n` +
                                 `📸 *Note:* Taka pathano hole payment er screenshot/receipt ekhane photo hishebe upload korun.`;
            return bot.sendMessage(userId, instructions, { parse_mode: 'Markdown' });

        case 'DEPOSIT_PROOF':
            if (!msg.photo) return bot.sendMessage(userId, "⚠️ Bhul file format. Apnake payment er screenshot file (Photo) upload korte hobe:");
            
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const depositId = "DEP_" + Math.floor(100000 + Math.random() * 900000);
            
            const depositsLog = readData('deposits');
            depositsLog.push({
                id: depositId,
                userId: userId,
                amount: state.amount,
                photoFileId: fileId,
                status: 'PENDING',
                date: new Date().toLocaleString()
            });
            writeData('deposits', depositsLog);
            
            bot.sendMessage(userId, `⏳ *Screenshot Recieved!*\nApnar request ID \`${depositId}\` admin er kase review er jonno gese. Verify hole sathe sathe balance add hobe.`, { parse_mode: 'Markdown', ...KEYBOARDS.userMain });
            bot.sendMessage(ADMIN_ID, `🔔 *Deposit Alert:* ID \`${userId}\` theke ekta deposit request ashse. "Deposit Requests" a giye check korun.`, { parse_mode: 'Markdown' });
            delete userState[userId];
            return;

        case 'BCAST_MSG':
            delete userState[userId];
            bot.sendMessage(userId, "🚀 Broadcast shuru hocche...", { ...KEYBOARDS.adminMain });
            const registry = readData('users');
            let successCount = 0;
            
            Promise.all(registry.map(async (u) => {
                try {
                    await bot.sendMessage(u.id, `📢 *BROADCAST MESSAGE:*\n━━━━━━━━━━━━━━━━━━\n${text}`, { parse_mode: 'Markdown' });
                    successCount++;
                } catch (e) {}
            })).then(() => {
                bot.sendMessage(ADMIN_ID, `📊 *Broadcast Done:* Total ${successCount}/${registry.length} jon user er kase message gese.`);
            });
            return;

        case 'SET_PAY_NUM':
            CONFIG.paymentNumber = text.trim();
            delete userState[userId];
            return bot.sendMessage(userId, `✅ Payment configuration change hoyeche:\n\`${CONFIG.paymentNumber}\``, { parse_mode: 'Markdown', ...KEYBOARDS.adminMain });
    }
}

// ==========================================
// INLINE INLINE KEYBOARD ACTIONS (CALLBACKS)
// ==========================================
bot.on('callback_query', async (query) => {
    const qData = query.data;
    const userId = query.from.id;
    const messageId = query.message.message_id;

    // --- BUY SYSTEM LOGIC ---
    if (qData.startsWith('buy_')) {
        await bot.answerCallbackQuery(query.id);
        const prodName = qData.replace('buy_', '');
        
        const freshProducts = readData('products');
        const pTargetIdx = freshProducts.findIndex(p => p.name === prodName);
        const freshUsers = readData('users');
        const uTargetIdx = freshUsers.findIndex(u => u.id === userId);

        if (pTargetIdx === -1) return bot.sendMessage(userId, "❌ Ei product ti ekhon r database a nei.");
        const pNode = freshProducts[pTargetIdx];
        const user = freshUsers[uTargetIdx];

        if (user.balance < pNode.price) {
            return bot.sendMessage(userId, `❌ *Insufficient Balance:* Product er daam $${pNode.price.toFixed(2)}, kintu apnar account a ase $${user.balance.toFixed(2)}. Age deposit korun.`, { parse_mode: 'Markdown' });
        }
        
        if (pNode.stock.length === 0) {
            return bot.sendMessage(userId, `❌ *Out of Stock:* \`${pNode.name}\` ekhon shesh hoye gese. Admin restock korle notification paben.`, { parse_mode: 'Markdown' });
        }

        // Deliver Token Safely
        const deliveredToken = freshProducts[pTargetIdx].stock.shift();
        const absolutePrice = freshProducts[pTargetIdx].price;

        freshUsers[uTargetIdx].balance = parseFloat((freshUsers[uTargetIdx].balance - absolutePrice).toFixed(2));
        freshUsers[uTargetIdx].totalOrders += 1;

        const trackingOrderId = "ORD_" + Math.floor(100000 + Math.random() * 900000);
        const ordersLog = readData('orders');
        ordersLog.push({
            orderId: trackingOrderId,
            userId: userId,
            productName: prodName,
            price: absolutePrice,
            item: deliveredToken,
            date: new Date().toLocaleString()
        });

        writeData('products', freshProducts);
        writeData('users', freshUsers);
        writeData('orders', ordersLog);

        const customerReceipt = `🎉 *PURCHASE SUCCESSFUL!*\n━━━━━━━━━━━━━━━━━━\n` +
                                `📦 *Product:* ${prodName}\n` +
                                `🆔 *Order ID:* \`${trackingOrderId}\`\n` +
                                `💵 *Price Debited:* -$${absolutePrice.toFixed(2)}\n\n` +
                                `🔑 *YOUR TOKEN/DATA:*\n` +
                                `\`${deliveredToken}\`\n\n` +
                                `⚠️ _Token ti copy kore shurokkhito rakhun. Order history thekeo eti pore dekhte parben._`;
        
        await bot.sendMessage(userId, customerReceipt, { parse_mode: 'Markdown' });
        bot.sendMessage(ADMIN_ID, `📈 *New Sale Announcement:* User \`${userId}\` successfully purchased \`${prodName}\` for $${absolutePrice.toFixed(2)}.`, { parse_mode: 'Markdown' });
        return;
    }

    if (qData.startsWith('editprice_')) {
        if (userId !== ADMIN_ID) return;
        await bot.answerCallbackQuery(query.id);
        const pName = qData.replace('editprice_', '');
        userState[userId] = { action: 'EDIT_PRICE_VAL', targetProd: pName };
        return bot.sendMessage(ADMIN_ID, `💵 *${pName}* er notun price (Daam USD $) pathan:`, { parse_mode: 'Markdown' });
    }

    if (qData.startsWith('addstock_')) {
        if (userId !== ADMIN_ID) return;
        await bot.answerCallbackQuery(query.id);
        const pName = qData.replace('addstock_', '');
        userState[userId] = { action: 'ADD_STOCK_DATA', targetProd: pName };
        return bot.sendMessage(ADMIN_ID, `📥 *Stock Load:* ${pName}\n\nProti line a 1 ti kore token likhe pathan. Example:\nTOKEN1\nTOKEN2\nTOKEN3`, { parse_mode: 'Markdown' });
    }

    // --- DEPOSIT RESOLUTIONS ---
    if (qData.startsWith('dep_app_')) {
        if (userId !== ADMIN_ID) return;
        await bot.answerCallbackQuery(query.id);
        const depId = qData.replace('dep_app_', '');
        
        const depRegistry = readData('deposits');
        const dIdx = depRegistry.findIndex(d => d.id === depId);
        
        if (dIdx !== -1 && depRegistry[dIdx].status === 'PENDING') {
            const ticket = depRegistry[dIdx];
            ticket.status = 'APPROVED';
            writeData('deposits', depRegistry);
            
            const updatedUserNode = updateUserBalance(ticket.userId, ticket.amount);
            
            await bot.editMessageCaption(`✅ *DEPOSIT APPROVED*\n━━━━━━━━━━━━━━━━━━\n👤 User ID: \`${ticket.userId}\`\n💰 Amount: +$${ticket.amount.toFixed(2)} wallet balance a jog hoyeche.`, {
                chat_id: ADMIN_ID,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
            
            if (updatedUserNode) {
                bot.sendMessage(ticket.userId, `💳 *Deposit Approved!*\nApnar payment verified hoyeche. *$${ticket.amount.toFixed(2)}* apnar account balance a add kora hoyeche.`, { parse_mode: 'Markdown' });
            }
        }
        return;
    }

    if (qData.startsWith('dep_rej_')) {
        if (userId !== ADMIN_ID) return;
        await bot.answerCallbackQuery(query.id);
        const depId = qData.replace('dep_rej_', '');
        
        const depRegistry = readData('deposits');
        const dIdx = depRegistry.findIndex(d => d.id === depId);
        
        if (dIdx !== -1 && depRegistry[dIdx].status === 'PENDING') {
            const ticket = depRegistry[dIdx];
            ticket.status = 'REJECTED';
            writeData('deposits', depRegistry);
            
            await bot.editMessageCaption(`❌ *DEPOSIT REJECTED*\n━━━━━━━━━━━━━━━━━━\n👤 User ID: \`${ticket.userId}\`\nStatus: Rejected / Cancelled.`, {
                chat_id: ADMIN_ID,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
            
            bot.sendMessage(ticket.userId, `⛔ *Deposit Rejected:* Apnar screenshot ba payment details review kore kono transaction praman paoya jay ni. Kripoya details check kore abar try korun.`, { parse_mode: 'Markdown' });
        }
        return;
    }
});

// Prevent crash on unhandled errors
process.on('uncaughtException', (err) => console.error('System Crash Protected:', err));
process.on('unhandledRejection', (reason) => console.error('Promise Rejection Protected:', reason));
