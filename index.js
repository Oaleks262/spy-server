const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { RoomManager } = require('./rooms');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const roomManager = new RoomManager();

wss.on('connection', (ws) => {
  console.log('Новий гравець підключився');

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case 'create-room':
        const roomCode = roomManager.createRoom(ws);
        ws.send(JSON.stringify({ type: 'room-created', roomCode }));
        break;

      case 'join-room':
        const room = roomManager.getRoom(data.roomCode);
        if (room) {
          room.addPlayer(ws, data.playerName);
          room.broadcast(JSON.stringify({ type: 'players-updated', players: room.players.map(player => player.playerName) }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Кімната не знайдена' }));
        }
        break;

      case 'start-game':
        console.log(`Запуск гри в кімнаті ${data.roomCode}`);
        const startRoom = roomManager.getRoom(data.roomCode);
        if (startRoom) {
          startRoom.startGame();
        } else {
          console.log(`Кімната ${data.roomCode} не знайдена.`);
        }
        break;

      // Обробка сигналізації WebRTC
      case 'offer':
        const offerRoom = roomManager.getRoom(data.roomCode);
        if (offerRoom) {
          offerRoom.players.forEach(player => {
            if (player.ws !== ws) {
              player.ws.send(JSON.stringify({ type: 'offer', offer: data.offer, from: data.from }));
            }
          });
        }
        break;

      case 'answer':
        const answerRoom = roomManager.getRoom(data.roomCode);
        if (answerRoom) {
          answerRoom.players.forEach(player => {
            if (player.ws !== ws) {
              player.ws.send(JSON.stringify({ type: 'answer', answer: data.answer, from: data.from }));
            }
          });
        }
        break;

      case 'ice-candidate':
        const candidateRoom = roomManager.getRoom(data.roomCode);
        if (candidateRoom) {
          candidateRoom.players.forEach(player => {
            if (player.ws !== ws) {
              player.ws.send(JSON.stringify({ type: 'ice-candidate', candidate: data.candidate, from: data.from }));
            }
          });
        }
        break;

      case 'send-message':
        const chatRoom = roomManager.getRoom(data.roomCode);
        if (chatRoom) {
          chatRoom.broadcast(JSON.stringify({ type: 'new-message', message: data.message, playerName: data.playerName }));
        }
        break;

      // Додаємо обробку 'finish-introduction'
      case 'finish-introduction':
        const introRoom = roomManager.getRoom(data.roomCode);
        if (introRoom) {
          introRoom.broadcast(JSON.stringify({ type: 'introduction-ended' }));
        }
        break;
        
      case 'next-introducer':
        const nextIntroRoom = roomManager.getRoom(data.roomCode);
        if (nextIntroRoom) {
          const players = nextIntroRoom.players;
          const currentPlayerIndex = players.findIndex(player => player.playerName === data.currentPlayer);
          const nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
      
          // Перевіряємо, чи це був останній гравець
          if (nextPlayerIndex === 0) {
            // Якщо так, завершуємо знайомство і переходимо до голосування
            nextIntroRoom.broadcast(JSON.stringify({
              type: 'introduction-ended',
            }));
            // Тут можна додати логіку для запуску голосування
          } else {
            // Інакше продовжуємо знайомство з наступним гравцем
            const nextPlayer = players[nextPlayerIndex].playerName;
            nextIntroRoom.broadcast(JSON.stringify({
              type: 'next-introducer',
              currentPlayer: nextPlayer,
              nextPlayer: players[(nextPlayerIndex + 1) % players.length].playerName,
            }));
          }
        }
        break;
      
      default:
        console.log('Невідомий тип повідомлення:', data.type);
    }
  });

  ws.on('close', () => {
    roomManager.removePlayer(ws);
    console.log('Гравець відключився');
  });
});

server.listen(5000, () => {
  console.log('Сервер запущено на порту 5000');
});
