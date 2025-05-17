import Vue from 'vue'
import VueRouter from 'vue-router'
import HomeView from '../views/HomeView.vue'
import RoomView from '../views/RoomView.vue'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    name: 'HomeView',
    component: HomeView
  },
  {
    path: '/room/:roomId',
    name: 'RoomView',
    component: RoomView
  },
  {
    // 6자리 숫자 경로를 방 ID로 인식
    path: '/:roomId(\\d{6})',
    name: 'DirectRoomView',
    component: RoomView
  }
]

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes
})

export default router
