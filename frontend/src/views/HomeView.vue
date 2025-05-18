<template>
  <div class="home">
    <div class="container">
      <h1 class="title">Quick Share</h1>
      
      <!-- 방 만들기 영역 -->
      <div class="room-controls">
        <div class="input-group">
          <input
            v-model="roomCode"
            placeholder="방 코드 입력 (6자리)"
            maxlength="6"
            pattern="\d*"
            @input="validateInput"
          />
        </div>
        <div class="button-group">
          <button
            @click="createRoom"
            :disabled="roomCode && !isValidCode"
          >
            {{ roomCode ? '새 방 만들기' : '자동 코드로 방 만들기' }}
          </button>
        </div>
      </div>
      
      <!-- 방 들어가기 영역 -->
      <div class="room-join">
        <h2 class="section-title">기존 방 들어가기</h2>
        <div class="input-group">
          <input
            v-model="joinRoomCode"
            placeholder="참여할 방 코드 입력"
            maxlength="6"
            pattern="\d*"
            @input="validateJoinInput"
          />
          <input
            v-model="joinUserName"
            placeholder="이름 입력"
            maxlength="20"
          />
        </div>
        <button
          @click="joinRoom"
          :disabled="!isValidJoinCode || !joinUserName"
        >
          방 들어가기
        </button>
      </div>
      
      <div v-if="error" class="error-message">
        {{ error }}
      </div>
      
      <div v-if="isLoading" class="loading-indicator">
        처리 중...
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

// axios 인스턴스 생성
const api = axios.create({
  baseURL: `https://file2.schoolworks.dev/api`,
  timeout: 5000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// API 요청/응답 로깅을 위한 인터셉터 추가
api.interceptors.request.use(request => {
  console.log('API 요청:', request.method, request.url, request.data);
  return request;
});

api.interceptors.response.use(
  response => {
    console.log('API 응답 성공:', response.status, response.data);
    return response;
  },
  error => {
    console.error('API 응답 오류:', 
      error.response ? `${error.response.status} ${JSON.stringify(error.response.data)}` : error.message
    );
    return Promise.reject(error);
  }
);

export default {
  name: 'HomeView',
  data() {
    return {
      roomCode: '',
      joinRoomCode: '',
      joinUserName: '',
      error: '',
      isLoading: false
    }
  },
  created() {
    // 로컬 스토리지에서 이전에 사용한 이름 가져오기
    const savedUserName = localStorage.getItem('userName');
    if (savedUserName) {
      this.joinUserName = savedUserName;
    }
  },
  computed: {
    isValidCode() {
      return /^\d{6}$/.test(this.roomCode);
    },
    isValidJoinCode() {
      return /^\d{6}$/.test(this.joinRoomCode);
    }
  },
  methods: {
    validateInput() {
      this.roomCode = this.roomCode.replace(/[^\d]/g, '');
    },
    validateJoinInput() {
      this.joinRoomCode = this.joinRoomCode.replace(/[^\d]/g, '');
    },
    async createRoom() {
      if (this.isLoading) return;
      this.error = '';
      this.isLoading = true;

      try {
        // 새로운 방 생성 (사용자가 지정한 방 코드 또는 자동 생성)
        const requestData = {};
        
        // 방 코드가 유효한 경우 요청에 포함
        if (this.roomCode && this.isValidCode) {
          requestData.roomCode = this.roomCode;
        }
        
        const response = await api.post('/rooms', requestData);
        
        if (response.data && response.data.roomCode) {
          this.saveRecentRoom(response.data.roomCode);
          this.navigateToRoom(response.data.roomCode);
        }
      } catch (error) {
        if (error.response && error.response.status === 409) {
          this.showError('이미 존재하는 방 코드입니다. 다른 코드를 입력해주세요.');
        } else if (error.response) {
          this.showError(error.response.data.message || '서버 오류가 발생했습니다.');
        } else if (error.request) {
          this.showError('서버에 연결할 수 없습니다.');
        } else {
          this.showError('알 수 없는 오류가 발생했습니다.');
        }
        console.error('Error:', error);
      } finally {
        this.isLoading = false;
      }
    },
    async joinRoom() {
      if (!this.isValidJoinCode) {
        this.showError('유효한 방 코드를 입력해주세요 (6자리 숫자)');
        return;
      }
      
      if (!this.joinUserName.trim()) {
        this.showError('이름을 입력해주세요');
        return;
      }
      
      if (this.isLoading) return;
      this.error = '';
      this.isLoading = true;
      
      // 이름 저장
      localStorage.setItem('userName', this.joinUserName);
      
      try {
        // 백엔드로 룸번호와 이름을 함께 전송하여 방 입장 처리
        const response = await api.post(`/rooms/${this.joinRoomCode}`, {
          userName: this.joinUserName
        });
        
        if (response.data) {
          this.saveRecentRoom(this.joinRoomCode);
          
          // 룸번호와 사용자 이름을 쿼리 파라미터로 전달하여 방으로 이동
          this.$router.push({
            path: `/room/${this.joinRoomCode}`,
            query: { userName: this.joinUserName }
          });
        }
      } catch (error) {
        console.error('방 참여 오류:', error);
        
        if (error.response && error.response.status === 404) {
          this.showError('존재하지 않는 방입니다.');
        } else if (error.response) {
          this.showError(error.response.data.message || '서버 오류가 발생했습니다.');
        } else if (error.request) {
          this.showError('서버에 연결할 수 없습니다.');
        } else {
          this.showError('알 수 없는 오류가 발생했습니다.');
        }
      } finally {
        this.isLoading = false;
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
      // 방으로 이동할 때 쿼리 파라미터로 사용자 이름 전달
      this.$router.push({
        path: `/room/${roomCode}`,
        query: this.joinUserName ? { userName: this.joinUserName } : undefined
      }).catch(err => {
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
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f5f7fa;
}

.container {
  width: 100%;
  max-width: 600px;
  text-align: center;
  padding: 30px;
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.title {
  margin-bottom: 30px;
  color: #3f51b5;
  font-size: 2.5rem;
}

.section-title {
  margin-top: 10px;
  margin-bottom: 15px;
  color: #3f51b5;
  font-size: 1.5rem;
}

.room-controls,
.room-join {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
  width: 100%;
  padding: 15px;
  border-radius: 8px;
  background-color: #f9f9f9;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.button-group {
  display: flex;
  gap: 10px;
  flex-direction: column;
  width: 100%;
}

input {
  width: 100%;
  padding: 12px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  transition: border-color 0.3s;
}

input:focus {
  border-color: #3f51b5;
  outline: none;
}

button {
  padding: 12px 20px;
  font-size: 16px;
  background-color: #3f51b5;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.3s;
}

button:hover {
  background-color: #303f9f;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.error-message {
  color: #f44336;
  margin-top: 16px;
  padding: 10px;
  background-color: rgba(244, 67, 54, 0.1);
  border-radius: 8px;
}

.loading-indicator {
  margin-top: 16px;
  padding: 10px;
  color: #3f51b5;
  background-color: rgba(63, 81, 181, 0.1);
  border-radius: 8px;
}

@media (min-width: 600px) {
  .input-group {
    flex-direction: row;
  }
  
  .button-group {
    flex-direction: row;
    justify-content: space-between;
  }
}

@media (max-width: 600px) {
  .container {
    padding: 20px;
  }
  
  .input-group {
    flex-direction: column;
  }
}
</style>
