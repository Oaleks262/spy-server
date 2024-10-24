class Room {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = [];
    this.gameStarted = false;
    this.spy = null;
    this.round = 0;
    this.location = '';
    this.topic = '';
    this.possibleLocations = ['Аеропорт', 'Ресторан', 'Школа', 'Музей'];
    this.votes = [];
    this.introducingPlayers = false; // Поле для контролю статусу раунду знайомства
    this.introductionQueue = []; // Черга для знайомства
    this.introductionTimer = null; // Таймер для контролю часу
  }

  // Додаємо гравця до кімнати
  addPlayer(ws, playerName) {
    const existingPlayer = this.players.find(player => player.playerName === playerName);
    
    if (!existingPlayer) {
      this.players.push({ ws, playerName, role: null });
      this.broadcast(JSON.stringify({ type: 'players-updated', players: this.players.map(player => player.playerName) }));
    } else {
      ws.send(JSON.stringify({ type: 'error', message: 'Гравець з таким ім\'ям вже в кімнаті' }));
    }
  }

  // Перевіряємо кількість гравців у кімнаті
  checkPlayerCount() {
    if (this.players.length < 3) {
      this.broadcast(JSON.stringify({ type: 'status', message: 'Очікуємо гравців...' }));
    } else {
      this.broadcast(JSON.stringify({ type: 'status', message: 'Гравців достатньо, можна починати гру!' }));
    }
  }

  // Видаляємо гравця з кімнати
  removePlayer(ws) {
    const player = this.players.find(player => player.ws === ws);
    if (player) {
      this.players = this.players.filter(p => p.ws !== ws);
      this.broadcast(JSON.stringify({ type: 'player-left', playerName: player.playerName }));
      this.broadcast(JSON.stringify({ type: 'players-updated', players: this.players.map(player => player.playerName) }));
  
      if (this.players.length === 0) {
        console.log(`Кімната ${this.roomCode} тепер порожня`);
      }
    }
  }

  // Розсилаємо повідомлення всім гравцям у кімнаті
  broadcast(message) {
    this.players.forEach(player => player.ws.send(message));
  }

  // Розсилаємо повідомлення всім, крім певного гравця
  broadcastToOtherPlayers(ws, message) {
    this.players.forEach(player => {
      if (player.ws !== ws) {
        player.ws.send(message);
      }
    });
  }

  // Запускаємо гру
  startGame() {
    if (this.players.length < 3) {
      this.broadcast(JSON.stringify({ type: 'error', message: 'Мало гравців для початку гри' }));
      return;
    }

    this.gameStarted = true;
    this.round = 1;

    const randomIndex = Math.floor(Math.random() * this.possibleLocations.length);
    this.location = this.possibleLocations[randomIndex];
    this.topic = 'Подорожі';

    const spyIndex = Math.floor(Math.random() * this.players.length);
    this.spy = this.players[spyIndex];

    this.players.forEach((player, index) => {
      if (index === spyIndex) {
        player.role = 'spy';
        player.ws.send(JSON.stringify({ type: 'role', role: 'spy', topic: this.topic }));
      } else {
        player.role = 'civilian';
        player.ws.send(JSON.stringify({ type: 'role', role: 'civilian', topic: this.topic, location: this.location }));
      }
    });

    this.broadcast(JSON.stringify({ type: 'game-started', round: this.round }));

    this.startIntroduction(); // Починаємо раунд знайомства після старту гри
  }

  // Починаємо раунд знайомства
  startIntroduction() {
    this.introductionQueue = [...this.players]; // Створюємо чергу для знайомства
    this.introducingPlayers = true;

    const firstPlayer = this.introductionQueue.shift();
    this.broadcast(JSON.stringify({
      type: 'start-introduction',
      players: this.players.map(player => player.playerName),
      currentPlayer: firstPlayer.playerName,
      nextPlayer: this.introductionQueue[0]?.playerName || null
    }));

    this.startIntroductionTimer(firstPlayer); // Запускаємо таймер для знайомства
  }

  // Запускаємо таймер для виступу
  startIntroductionTimer(player) {
    this.introductionTimer = setTimeout(() => {
      this.finishIntroduction(player);
    }, 120000); // 2 хвилини на виступ
  }

  // Завершуємо виступ поточного гравця
  finishIntroduction(player) {
    clearTimeout(this.introductionTimer); // Очищаємо таймер

    if (this.introductionQueue.length > 0) {
      const nextPlayer = this.introductionQueue.shift();
      this.broadcast(JSON.stringify({
        type: 'next-introducer',
        currentPlayer: nextPlayer.playerName,
        nextPlayer: this.introductionQueue[0]?.playerName || null
      }));

      this.startIntroductionTimer(nextPlayer); // Запускаємо таймер для наступного гравця
    } else {
      this.introducingPlayers = false;
      this.broadcast(JSON.stringify({ type: 'introduction-ended' }));
      this.nextRound(); // Переходимо до наступного раунду
    }
  }

  // Переходимо до наступного раунду
  nextRound() {
    this.round++;
    if (this.round > 3) {
      this.endGame();
    } else {
      this.broadcast(JSON.stringify({ type: 'next-round', round: this.round }));
      // Ви можете додати логіку для наступних раундів тут
    }
  }

  // Голосуємо за підозрюваного
  castVote(voter, suspect) {
    if (this.round <= 3) {
      this.votes.push({ voter, suspect });
      this.checkVotes();
    }
  }

  // Перевіряємо результати голосування
  checkVotes() {
    if (this.votes.length === this.players.length) {
      const voteCounts = {};
      this.votes.forEach(vote => {
        if (!voteCounts[vote.suspect]) {
          voteCounts[vote.suspect] = 0;
        }
        voteCounts[vote.suspect]++;
      });

      const maxVotes = Math.max(...Object.values(voteCounts));
      const suspects = Object.keys(voteCounts).filter(suspect => voteCounts[suspect] === maxVotes);

      if (suspects.length === 1) {
        this.broadcast(JSON.stringify({ type: 'vote-result', suspect: suspects[0] }));
        if (suspects[0] === this.spy.playerName) {
          this.broadcast(JSON.stringify({ type: 'civilians-won' }));
          this.endGame();
        } else {
          this.nextRound();
        }
      } else {
        this.broadcast(JSON.stringify({ type: 'tie', suspects }));
        this.nextRound();
      }

      this.votes = [];
    }
  }

  // Обробка здогадки шпигуна
  handleSpyGuess(guess) {
    if (guess === this.location) {
      this.broadcast(JSON.stringify({ type: 'spy-won', spyName: this.spy.playerName }));
    } else {
      this.broadcast(JSON.stringify({ type: 'civilians-won' }));
    }
    this.endGame();
  }

  // Завершення гри
  endGame() {
    this.broadcast(JSON.stringify({ type: 'game-ended' }));
    this.gameStarted = false;
    this.players.forEach(player => {
      player.role = null; // Скидаємо ролі після закінчення гри
    });
  }

  // Метод для обробки закінчення виступу (додано)
  finishIntroductionHandler(ws) {
    const player = this.players.find(p => p.ws === ws);
    if (player && this.introducingPlayers) {
      this.finishIntroduction(player);
    }
  }

  // Метод для обробки наступного гравця (додано)
  nextIntroducer() {
    if (this.introductionQueue.length > 0) {
      this.finishIntroduction(this.introductionQueue[0]);
    }
  }
}

class RoomManager {
  constructor() {
    this.rooms = {};
  }

  // Створення кімнати
  createRoom() {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.rooms[roomCode] = new Room(roomCode);
    return roomCode;
  }

  // Отримання кімнати за кодом
  getRoom(roomCode) {
    return this.rooms[roomCode];
  }

  // Видалення гравця з кімнати
  removePlayer(ws) {
    for (const roomCode in this.rooms) {
      const room = this.rooms[roomCode];
      room.removePlayer(ws);
      if (room.players.length === 0) {
        delete this.rooms[roomCode]; // Видалення кімнати, якщо немає гравців
      }
    }
  }
}

module.exports = { RoomManager };
