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
          
          // Перевірка на кількість гравців
          if (room.players.length === 3) {
            room.broadcast(JSON.stringify({ type: 'show-start-button' }));
          }
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

      // Обробка завершення виступу
      // case 'finish-introduction':
      //   const introRoom = roomManager.getRoom(data.roomCode);
      //   if (introRoom) {
      //     console.log(`Отримано запит на завершення виступу від гравця ${data.playerName} в кімнаті ${data.roomCode}`);
      
      //     const currentPlayerIndex = introRoom.players.findIndex(player => player.playerName === data.playerName);
          
      //     if (currentPlayerIndex !== -1) {
      //       introRoom.players[currentPlayerIndex].hasFinished = true; // Позначаємо гравця як того, що завершив
      
      //       // Перевіряємо, чи всі гравці завершили виступ
      //       if (introRoom.players.every(player => player.hasFinished)) {
      //         introRoom.broadcast(JSON.stringify({ type: 'introduction-ended' }));
      //       } else {
      //         // Переходимо до наступного гравця
      //         const nextPlayerIndex = (currentPlayerIndex + 1) % introRoom.players.length;
      //         const nextPlayer = introRoom.players[nextPlayerIndex].playerName;
      //         introRoom.broadcast(JSON.stringify({ type: 'next-introducer', currentPlayer: nextPlayer }));
      //       }
      //     } else {
      //       console.log(`Гравець ${data.playerName} не знайдений у кімнаті ${data.roomCode}`);
      //     }
      //   } else {
      //     console.log(`Кімната ${data.roomCode} не знайдена.`);
      //   }
      //   break;
      case 'finish-introduction':
        const introRoom = roomManager.getRoom(data.roomCode);
        if (introRoom) {
          const currentPlayerIndex = introRoom.players.findIndex(player => player.playerName === data.playerName);
          introRoom.players[currentPlayerIndex].hasFinished = true;
          if (introRoom.players.every(player => player.hasFinished)) {
            introRoom.broadcast(JSON.stringify({ type: 'introduction-ended' }));
          } else {
            const nextPlayerIndex = (currentPlayerIndex + 1) % introRoom.players.length;
            const nextPlayer = introRoom.players[nextPlayerIndex].playerName;
            introRoom.broadcast(JSON.stringify({ type: 'next-introducer', currentPlayer: nextPlayer }));
          }
        }
        break;


        case 'start-discussion':
          const discussionRoom = roomManager.getRoom(data.roomCode);
          if (discussionRoom) {
            discussionRoom.broadcast(JSON.stringify({ type: 'discussion-started' }));
        
            // Запускаємо таймер на 2 хвилини
            setTimeout(() => {
              discussionRoom.broadcast(JSON.stringify({ type: 'discussion-ended' }));
        
              // Після закінчення обговорення розпочинаємо голосування
              discussionRoom.broadcast(JSON.stringify({ type: 'start-voting' }));
            }, 2 * 60 * 1000); // 2 хвилини в мілісекундах
          }
          break;
        
        case 'cast-vote':
          const votingRoom = roomManager.getRoom(data.roomCode);
          if (votingRoom) {
            // Обробка голосу гравця (наприклад, збереження голосів)
            votingRoom.registerVote(data.playerName, data.vote);
        
            // Перевірка, чи всі гравці вже проголосували
            if (votingRoom.allVotesIn()) {
              // Після отримання всіх голосів надсилаємо результати
              const results = votingRoom.calculateResults();
              votingRoom.broadcast(JSON.stringify({ type: 'voting-results', results }));
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