<template>
  <div class="home">
    <div class="room-controls">
      <input
        v-model="roomCode"
        placeholder="방 코드 입력 (6자리)"
        maxlength="6"
        pattern="\d*"
        @input="validateInput"
      />
      <button
        @click="handleRoom"
        :disabled="roomCode && !isValidCode"
      >
        {{ isValidCode ? '방 만들기/참여하기' : '새로운 방 만들기' }}
      </button>
    </div>
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script>
import axios from 'axios';

// axios 인스턴스 생성
const api = axios.create({
  baseURL: `${process.env.VUE_APP_API_URL}/api`,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json'
  }
});

export default {
  name: 'HomeView',
  data() {
    return {
      roomCode: '',
      error: ''
    }
  },
  computed: {
    isValidCode() {
      return /^\d{6}$/.test(this.roomCode);
    }
  },
  methods: {
    validateInput() {
      this.roomCode = this.roomCode.replace(/[^\d]/g, '');
    },
    async handleRoom() {
      this.error = '';

      try {
        if (!this.roomCode) {
          // 새로운 방 생성 (방 코드 없을 때)
          const response = await api.post('/rooms');
          if (response.data && response.data.roomCode) {
            this.saveRecentRoom(response.data.roomCode);
            this.navigateToRoom(response.data.roomCode);
          }
        } else if (this.isValidCode) {
          // 6자리 숫자를 입력했을 때 새 방 생성
          const response = await api.post('/rooms', { roomCode: this.roomCode });
          if (response.data && response.data.roomCode) {
            this.saveRecentRoom(response.data.roomCode);
            this.navigateToRoom(response.data.roomCode);
          }
        }
      } catch (error) {
        if (error.response) {
          this.showError(error.response.data.message || '서버 오류가 발생했습니다.');
        } else if (error.request) {
          this.showError('서버에 연결할 수 없습니다.');
        } else {
          this.showError('알 수 없는 오류가 발생했습니다.');
        }
        console.error('Error:', error);
      }
    },
    showError(message) {
      this.error = message;
    },
    saveRecentRoom(roomCode) {
      const recentRooms = JSON.parse(localStorage.getItem('recentRooms') || '[]');
      if (!recentRooms.includes(roomCode)) {
        recentRooms.unshift(roomCode);
        if (recentRooms.length > 5) recentRooms.pop();
        localStorage.setItem('recentRooms', JSON.stringify(recentRooms));
      }
    },
    navigateToRoom(roomCode) {
      // 중복 이동 오류 처리
      this.$router.push(`/room/${roomCode}`).catch(err => {
        if (err.name !== 'NavigationDuplicated') {
          throw err;
        }
      });
    }
  }
}
</script>

<style scoped>
.home {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

.room-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

input {
  flex: 1;
  padding: 8px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

button {
  padding: 8px 16px;
  font-size: 16px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.error-message {
  color: #ff0000;
  margin-top: 10px;
}
</style>
