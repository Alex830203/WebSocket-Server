const express = require('express');
const { Server } = require('ws');

const PORT = process.env.PORT || 8080;

// 建立 express 物件並用來監聽指定 port
const server = express().listen(PORT, () => {
    console.log(`[Server] Listening on http://localhost:${PORT}`);
});

// 建立 WebSocket 服務
const wss = new Server({ server });
const clients = {}; // 用來追蹤所有用戶的 ID 和暱稱

wss.on('connection', (ws, req) => {
    ws.id = req.headers['sec-websocket-key'].substring(0, 8);
    ws.nickname = `User_${ws.id}`;
    ws.isAlive = true;

    clients[ws.id] = ws.nickname;

    console.log(`[Client ${ws.id}] connected (${req.socket.remoteAddress})`);

    // 向連線的客戶端發送其 ID
    ws.send(JSON.stringify({ type: 'init', payload: { id: ws.id, nickname: ws.nickname } }));

    broadcast('join', { id: ws.id, msg: `${ws.nickname} 進入聊天室` }, ws);
    updateClientList();

    ws.on('pong', () => (ws.isAlive = true));

    ws.on('message', rawData => {
        let parsedData;
        try {
            parsedData = JSON.parse(rawData);
        } catch (error) {
            console.error('[Invalid JSON]', rawData);
            ws.send(JSON.stringify({ type: 'error', msg: 'Invalid message format.' }));
            return;
        }

        if (parsedData.type === 'setNickname') {
            const { nickname } = parsedData.payload;
            if (nickname) {
                ws.nickname = nickname;
                clients[ws.id] = nickname;
                console.log(`[Client ${ws.id}] changed nickname to ${nickname}`);
                updateClientList();
            }
        } else if (parsedData.type === 'message') {
            broadcast('message', { id: ws.id, nickname: ws.nickname, msg: parsedData.payload.msg });
        }
    });

    ws.on('close', () => {
        console.log(`[${ws.nickname}] 離開聊天室`);
        delete clients[ws.id];
        broadcast('leave', { id: ws.id, msg: `${ws.nickname} 離開聊天室` });
        updateClientList();
    });
});

setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

function broadcast(type, payload, excludeWs = null) {
    const message = JSON.stringify({ type, payload });
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN && client !== excludeWs) {
            client.send(message);
        }
    });
}

function updateClientList() {
    const clientList = Object.entries(clients).map(([id, nickname]) => ({ id, nickname }));
    broadcast('updateClientList', clientList);
}
