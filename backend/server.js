const express = require('express');
const cors = require('cors');
const Redis = require('ioredis');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Redis 연결 설정
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || '',
});

// 파일 업로드를 위한 임시 디렉토리 설정
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 한글 파일명 처리
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + originalName);
  }
});

const upload = multer({ storage: storage });

// CORS 설정을 가장 먼저 적용
app.use(cors({
  origin: '*', // 모든 원본 허용 (개발용)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type']
}));

// Socket.IO 연결 설정
io.on('connection', (socket) => {
  console.log('새로운 사용자 연결:', socket.id);

  // 방 참여 이벤트
  socket.on('joinRoom', (roomCode, userName) => {
    socket.join(roomCode);
    socket.userName = userName || '익명';
    console.log(`사용자 ${socket.userName}(${socket.id})가 방 ${roomCode}에 참여했습니다.`);
  });

  // 연결 해제 이벤트
  socket.on('disconnect', () => {
    console.log('사용자 연결 해제:', socket.id);
  });
});

app.use(express.json());

// 임시 저장소 (실제 구현에서는 Redis나 DB를 사용해야 함)
const rooms = new Map();

// 새로운 방 생성
app.post('/api/rooms', async (req, res) => {
  try {
    let roomCode;

    // 사용자가 방 코드를 지정한 경우
    if (req.body && req.body.roomCode && /^\d{6}$/.test(req.body.roomCode)) {
      roomCode = req.body.roomCode;

      // 이미 존재하는 방 코드인지 확인
      if (rooms.has(roomCode)) {
        // 이미 존재하는 방이면 방에 참여하도록 함
        return res.json({
          roomCode,
          message: '방에 성공적으로 참여했습니다.'
        });
      }
    } else {
      // 랜덤 방 코드 생성
      roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    }

    // 방 정보 저장
    const roomInfo = {
      createdAt: Date.now(),
      active: true,
      expiresAt: Date.now() + 3600000 // 1시간 후 만료
    };

    // 메모리에 방 정보 저장
    rooms.set(roomCode, roomInfo);

    // Redis에 방 정보 저장 (만료시간 1시간 = 3600초)
    await redis.set(`room:${roomCode}:info`, JSON.stringify(roomInfo));
    await redis.expire(`room:${roomCode}:info`, 3600);

    res.json({
      roomCode,
      expiresIn: 3600,
      message: '방이 생성되었습니다.'
    });
  } catch (error) {
    console.error('방 생성 오류:', error);
    res.status(500).json({ message: '방 생성에 실패했습니다.' });
  }
});

// 방 참여
app.post('/api/rooms/:roomCode', async (req, res) => {
  const { roomCode } = req.params;

  try {
    // Redis에서 방 정보 키의 만료 시간 확인
    const ttl = await redis.ttl(`room:${roomCode}:info`);

    // TTL이 -2이면 키가 존재하지 않음
    if (ttl === -2) {
      // 메모리에서도 방 정보 삭제
      if (rooms.has(roomCode)) {
        rooms.delete(roomCode);
      }

      return res.status(404).json({ message: '존재하지 않는 방입니다.' });
    }

    // 방 정보 확인
    if (!rooms.has(roomCode)) {
      // 메모리에 없지만 Redis에 있는 경우
      const roomInfo = await redis.get(`room:${roomCode}:info`);
      if (roomInfo) {
        rooms.set(roomCode, JSON.parse(roomInfo)); // 메모리에 다시 저장
      } else {
        return res.status(404).json({ message: '존재하지 않는 방입니다.' });
      }
    }

    res.json({
      roomCode,
      expiresIn: ttl > 0 ? ttl : 3600, // 기본값 1시간
      message: '방에 성공적으로 참여했습니다.'
    });
  } catch (error) {
    console.error('방 참여 오류:', error);
    res.status(500).json({ message: '방 참여에 실패했습니다.' });
  }
});

// 방 상태 확인
app.get('/api/rooms/:roomCode/status', async (req, res) => {
  const { roomCode } = req.params;

  try {
    // Redis에서 방 정보 키의 만료 시간 확인
    const ttl = await redis.ttl(`room:${roomCode}:info`);

    // TTL이 -2이면 키가 존재하지 않음, -1이면 만료 시간이 없음
    if (ttl === -2) {
      // 메모리에서도 방 정보 삭제
      if (rooms.has(roomCode)) {
        rooms.delete(roomCode);
      }

      return res.status(404).json({
        active: false,
        message: '존재하지 않는 방입니다.'
      });
    }

    // 방 정보 확인
    let room;
    if (rooms.has(roomCode)) {
      room = rooms.get(roomCode);
    } else {
      // 메모리에 없지만 Redis에 있는 경우
      const roomInfo = await redis.get(`room:${roomCode}:info`);
      if (roomInfo) {
        room = JSON.parse(roomInfo);
        rooms.set(roomCode, room); // 메모리에 다시 저장
      } else {
        return res.status(404).json({
          active: false,
          message: '존재하지 않는 방입니다.'
        });
      }
    }

    // 만료 시간 계산
    const expiresIn = ttl > 0 ? ttl : 3600; // 기본값 1시간

    res.json({
      active: true,
      expiresIn,
      message: '방이 활성화되어 있습니다.'
    });
  } catch (error) {
    console.error('방 상태 확인 오류:', error);
    res.status(500).json({ message: '방 상태 확인에 실패했습니다.' });
  }
});



// 파일 업로드 API
app.post('/api/rooms/:roomCode/files', upload.single('file'), async (req, res) => {
  try {
    const { roomCode } = req.params;
    // 사용자 이름 가져오기 (기본값: '익명')
    const userName = req.body.userName || '익명';

    console.log('파일 업로드 요청 정보:', {
      roomCode,
      userName,
      body: req.body,
      file: req.file ? req.file.originalname : '파일 없음'
    });

    if (!rooms.has(roomCode)) {
      // 임시 파일 삭제
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ message: '존재하지 않는 방입니다.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: '파일이 업로드되지 않았습니다.' });
    }

    // 한글 파일명 처리
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    // 고유 ID 생성
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    const fileInfo = {
      id: uniqueId,
      originalName: originalName,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: Date.now(),
      userName: userName // 사용자 이름 추가
    };

    // Redis에 파일 정보 저장 (만료시간 1시간 = 3600초)
    const fileKey = `room:${roomCode}:files`;
    await redis.lpush(fileKey, JSON.stringify(fileInfo));
    await redis.expire(fileKey, 3600);

    // 방에 파일 정보 추가
    const room = rooms.get(roomCode);
    if (!room.files) {
      room.files = [];
    }
    room.files.push(fileInfo);

    // Socket.IO를 통해 실시간으로 파일 업로드 알림 전송
    io.to(roomCode).emit('fileUploaded', {
      file: fileInfo,
      message: '새 파일이 업로드되었습니다.',
      uploaderId: req.body.socketId || null // 업로더의 Socket ID 포함
    });

    res.json({
      message: '파일이 성공적으로 업로드되었습니다.',
      file: fileInfo
    });
  } catch (error) {
    console.error('파일 업로드 오류:', error);
    res.status(500).json({ message: '파일 업로드에 실패했습니다.' });
  }
});

// 방의 파일 목록 조회 API
app.get('/api/rooms/:roomCode/files', async (req, res) => {
  try {
    const { roomCode } = req.params;

    if (!rooms.has(roomCode)) {
      return res.status(404).json({ message: '존재하지 않는 방입니다.' });
    }

    // Redis에서 파일 정보 가져오기
    const fileKey = `room:${roomCode}:files`;
    const fileList = await redis.lrange(fileKey, 0, -1);

    // 파일 정보 파싱
    let files = fileList.map(fileJson => {
      try {
        return JSON.parse(fileJson);
      } catch (err) {
        console.error('파일 정보 파싱 오류:', err);
        return null;
      }
    }).filter(file => file !== null);

    // 중복 파일 제거
    const uniqueFiles = [];
    const filenameSet = new Set();

    for (const file of files) {
      if (!filenameSet.has(file.filename)) {
        filenameSet.add(file.filename);
        uniqueFiles.push(file);
      }
    }

    files = uniqueFiles;

    // 방 정보 업데이트
    const room = rooms.get(roomCode);
    room.files = files;

    res.json({
      files
    });
  } catch (error) {
    console.error('파일 목록 조회 오류:', error);
    res.status(500).json({ message: '파일 목록 조회에 실패했습니다.' });
  }
});

// 파일 ID로 다운로드 API
app.get('/api/rooms/:roomCode/files/download/:fileId', (req, res) => {
  console.log('파일 다운로드 요청:', req.params);
  try {
    const { roomCode, fileId } = req.params;

    if (!rooms.has(roomCode)) {
      return res.status(404).json({ message: '존재하지 않는 방입니다.' });
    }

    const room = rooms.get(roomCode);
    const files = room.files || [];
    const fileInfo = files.find(file => file.id === fileId);

    if (!fileInfo) {
      return res.status(404).json({ message: '파일을 찾을 수 없습니다.' });
    }

    // 파일 경로 확인
    if (!fs.existsSync(fileInfo.path)) {
      console.error('파일이 존재하지 않음:', fileInfo.path);
      return res.status(404).json({ message: '파일을 찾을 수 없습니다.' });
    }

    // 한글 파일명 인코딩 처리
    const encodedFilename = encodeURIComponent(fileInfo.originalName);

    // 파일 다운로드
    res.download(fileInfo.path, fileInfo.originalName, (err) => {
      if (err) {
        console.error('파일 다운로드 오류:', err);
        if (!res.headersSent) {
          res.status(500).json({ message: '파일 다운로드에 실패했습니다.' });
        }
      }
    });
  } catch (error) {
    console.error('파일 제공 오류:', error);
    res.status(500).json({ message: '파일 제공에 실패했습니다.' });
  }
});





// 파일 삭제 API
app.delete('/api/rooms/:roomCode/files/:fileId', async (req, res) => {
  try {
    const { roomCode, fileId } = req.params;

    if (!rooms.has(roomCode)) {
      return res.status(404).json({ message: '존재하지 않는 방입니다.' });
    }

    const room = rooms.get(roomCode);
    const files = room.files || [];
    const fileIndex = files.findIndex(file => file.id === fileId);

    if (fileIndex === -1) {
      return res.status(404).json({ message: '파일을 찾을 수 없습니다.' });
    }

    const fileInfo = files[fileIndex];

    // 파일 삭제
    try {
      fs.unlinkSync(fileInfo.path);
    } catch (err) {
      console.error('파일 삭제 오류:', err);
      // 파일 삭제 오류는 무시하고 계속 진행
    }

    // 방 정보에서 파일 제거
    files.splice(fileIndex, 1);
    room.files = files;

    // Redis에서 파일 정보 삭제
    const fileKey = `room:${roomCode}:files`;
    await redis.lrem(fileKey, 0, JSON.stringify(fileInfo));

    // Socket.IO를 통해 실시간으로 파일 삭제 알림 전송
    io.to(roomCode).emit('fileDeleted', {
      id: fileInfo.id,
      filename: fileInfo.filename
    });

    res.json({
      success: true,
      message: '파일이 성공적으로 삭제되었습니다.'
    });
  } catch (error) {
    console.error('파일 삭제 오류:', error);
    res.status(500).json({ message: '파일 삭제에 실패했습니다.' });
  }
});

// 파일 열기 이벤트 API
app.post('/api/rooms/:roomCode/files/:fileId/open', async (req, res) => {
  try {
    const { roomCode, fileId } = req.params;
    const { userId } = req.body;

    if (!rooms.has(roomCode)) {
      return res.status(404).json({ message: '존재하지 않는 방입니다.' });
    }

    const room = rooms.get(roomCode);
    const files = room.files || [];
    const fileInfo = files.find(file => file.id === fileId);

    if (!fileInfo) {
      return res.status(404).json({ message: '파일을 찾을 수 없습니다.' });
    }

    // Socket.IO를 통해 실시간으로 파일 열기 이벤트 전파
    io.to(roomCode).emit('openDocument', {
      userId: userId,
      id: fileInfo.id,
      filename: fileInfo.filename,
      originalName: fileInfo.originalName,
      isOfficeDocument: fileInfo.isOfficeDocument
    });

    res.json({
      success: true,
      message: '파일 열기 이벤트가 전파되었습니다.'
    });
  } catch (error) {
    console.error('파일 열기 이벤트 오류:', error);
    res.status(500).json({ message: '파일 열기 이벤트 전파에 실패했습니다.' });
  }
});

// 전체 파일 목록 API (다운로드용)
app.get('/api/rooms/:roomCode/files/download-all', async (req, res) => {
  try {
    const { roomCode } = req.params;

    if (!rooms.has(roomCode)) {
      return res.status(404).json({ message: '존재하지 않는 방입니다.' });
    }

    const room = rooms.get(roomCode);
    const files = room.files || [];

    if (files.length === 0) {
      return res.status(404).json({ message: '다운로드할 파일이 없습니다.' });
    }

    // 파일 목록 반환 (다운로드에 필요한 모든 정보 포함)
    const fileList = files.map(file => ({
      id: file.id,
      originalName: file.originalName,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
      userName: file.userName || '익명' // 사용자 이름 추가
    }));

    res.json({
      success: true,
      files: fileList
    });
  } catch (error) {
    console.error('전체 파일 목록 조회 오류:', error);
    res.status(500).json({ message: '전체 파일 목록 조회에 실패했습니다.' });
  }
});

const port = process.env.PORT || 3001;
server.listen(port, () => {
  console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
});
