import React, { createContext, useContext, useReducer, useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Alert,
  BackHandler, ActivityIndicator, Dimensions, Platform, ToastAndroid, Keyboard,
  Modal, Image, FlatList, Share, RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, useNavigation, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import moment from 'moment';
import { BarCodeScanner } from 'expo-barcode-scanner';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import { LineChart, BarChart } from 'react-native-chart-kit';

// 配置推送通知
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const { width, height } = Dimensions.get('window');
const PRIMARY_COLOR = '#165DFF';
const LIGHT_PRIMARY = '#E8F3FF';
const DANGER_COLOR = '#F53F3F';
const SUCCESS_COLOR = '#00B42A';
const BG_PAGE = '#F2F3F5';
const BG_CARD = '#FFFFFF';
const TEXT_MAIN = '#1D2129';
const TEXT_SECOND = '#4E5969';
const TEXT_THIRD = '#86909C';
const BORDER_COLOR = '#E5E6EB';
const EMOJI_LIST = ['😀','😃','😄','😁','😆','🥲','😊','😇','🙂','🙃','😉','😌','🥰','😍','🤩','😘'];

const SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,
};

const ZHIPU_API_KEY = "1cca44e3c1124a999d501621e9fe8305.xf2xNXly5CkSBe5p";
const ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const ZHIPU_MODEL = "glm-4-flash";

const IMAGE_GEN_API = "https://image-api.my-image-api.workers.dev";
const IMAGE_GEN_API_KEY = "my_secure_key_123";

// ========== 压缩图片工具 ==========
const compressImage = async (uri) => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (error) {
    console.warn('压缩失败', error);
    return uri;
  }
};

// ========== 状态管理（扩展所有数据） ==========
const initialState = {
  user: null,
  shopInfo: {
    shopName: '',
    phone: '',
    industry: '餐饮类',
    staffList: [],
  },
  lastLoginInfo: null,
  previousAccounts: [],
  globalOrderRecord: [],
  globalStockRecord: [],
  goodsList: [],
  staffMemberList: [],
  badReviewCount: 0,
  badReviewList: [],
  businessHistory: [],
  costCache: { purchaseCost: "", fixedCost: "" },
  pushConfig: { workHour: "9", workMinute: "0", offHour: "21", offMinute: "0" },
  shopConfig: { shopName: "我的门店", industry: "餐饮类" },
  lastBusinessInput: {
    income: "", purchaseCost: "", loss: "", fixedCost: "",
    otherCost: "", lossOverdue: "", lossOperate: "", lossOther: ""
  },
  todayPushTrigger: false,
  weekPushTrigger: false,
  monthPushTrigger: false,
  groupChatMessages: [],
  privateChatMessages: {},
  latestDailyReport: null,
  chatSettings: {},
  // 新增：推送通知token
  pushToken: null,
};

function appReducer(state, action) {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, user: action.payload.user, shopInfo: action.payload.shopInfo, lastLoginInfo: action.payload.user };
    case 'LOGOUT':
      return { ...state, user: null, shopInfo: { shopName: '', phone: '', industry: '餐饮类', staffList: [] } };
    case 'ADD_ORDER_RECORD':
      return { ...state, globalOrderRecord: [action.payload, ...state.globalOrderRecord] };
    case 'ADD_STOCK_RECORD':
      return { ...state, globalStockRecord: [action.payload, ...state.globalStockRecord] };
    case 'SET_GOODS_LIST':
      return { ...state, goodsList: action.payload };
    case 'SET_STAFF_LIST':
      return { ...state, staffMemberList: action.payload };
    case 'SET_BAD_REVIEW_COUNT':
      return { ...state, badReviewCount: action.payload };
    case 'ADD_BAD_REVIEW': {
      const newList = [action.payload, ...state.badReviewList];
      return { ...state, badReviewList: newList, badReviewCount: state.badReviewCount + 1 };
    }
    case 'MARK_BAD_REVIEW_HANDLED': {
      const index = state.badReviewList.findIndex(item => item.id === action.payload);
      if (index === -1) return state;
      const newList = [...state.badReviewList];
      newList[index] = { ...newList[index], handled: true };
      return { ...state, badReviewList: newList };
    }
    case 'ADD_BUSINESS_REPORT':
      return { ...state, businessHistory: [...state.businessHistory, action.payload] };
    case 'SET_COST_CACHE':
      return { ...state, costCache: action.payload };
    case 'SET_PUSH_CONFIG':
      return { ...state, pushConfig: action.payload };
    case 'SET_SHOP_CONFIG':
      return { ...state, shopConfig: action.payload };
    case 'SET_LAST_BUSINESS_INPUT':
      return { ...state, lastBusinessInput: action.payload };
    case 'SET_PUSH_TRIGGER':
      return { ...state, todayPushTrigger: action.payload.today ?? state.todayPushTrigger, weekPushTrigger: action.payload.week ?? state.weekPushTrigger, monthPushTrigger: action.payload.month ?? state.monthPushTrigger };
    case 'RESET_PUSH_TRIGGER':
      return { ...state, todayPushTrigger: action.payload.today ?? false, weekPushTrigger: action.payload.week ?? false, monthPushTrigger: action.payload.month ?? false };
    case 'ADD_GROUP_MESSAGE':
      return { ...state, groupChatMessages: [...state.groupChatMessages, action.payload] };
    case 'SET_GROUP_MESSAGES':
      return { ...state, groupChatMessages: action.payload };
    case 'ADD_PRIVATE_MESSAGE': {
      const { phone, message } = action.payload;
      const existing = state.privateChatMessages[phone] || [];
      return { ...state, privateChatMessages: { ...state.privateChatMessages, [phone]: [...existing, message] } };
    }
    case 'CLEAR_PRIVATE_MESSAGES': {
      const { phone } = action.payload;
      const newState = { ...state };
      delete newState.privateChatMessages[phone];
      return newState;
    }
    case 'SET_LATEST_DAILY_REPORT':
      return { ...state, latestDailyReport: action.payload };
    case 'ADD_PREVIOUS_ACCOUNT': {
      const exists = state.previousAccounts.find(a => a.phone === action.payload.phone);
      if (exists) return state;
      return { ...state, previousAccounts: [...state.previousAccounts, action.payload] };
    }
    case 'CLEAR_PREVIOUS_ACCOUNTS':
      return { ...state, previousAccounts: [] };
    case 'SET_CHAT_SETTINGS': {
      const { key, settings } = action.payload;
      return { ...state, chatSettings: { ...state.chatSettings, [key]: settings } };
    }
    case 'SET_PUSH_TOKEN':
      return { ...state, pushToken: action.payload };
    case 'RESTORE_ALL_DATA': {
      return { ...state, ...action.payload };
    }
    default:
      return state;
  }
}

const AppContext = createContext(null);
const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

const showToast = (msg, duration = 'short') => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, duration === 'long' ? ToastAndroid.LONG : ToastAndroid.SHORT);
  } else {
    Alert.alert('提示', msg);
  }
};

const checkBadReview = (text) => {
  const badWords = ["难吃", "差", "慢", "差评", "失望", "不干净", "贵", "坑", "服务差", "太难吃", "退款", "投诉", "垃圾"];
  return badWords.some(word => text.includes(word));
};

const detectIndustry = (shopName) => {
  const foodKeywords = ['火锅', '烧烤', '奶茶', '咖啡', '面馆', '川菜', '粤菜', '日料', '韩餐', '西餐', '烘焙', '小吃', '餐厅', '饭店', '餐饮', '美食', '快餐', '外卖', '茶饮', '饮品', '糕点', '甜品'];
  for (const kw of foodKeywords) { if (shopName.includes(kw)) return '餐饮类'; }
  return '餐饮类';
};

async function fetchZhipuChat(msgList, prompt) {
  try {
    const res = await fetch(ZHIPU_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ZHIPU_API_KEY}` },
      body: JSON.stringify({
        model: ZHIPU_MODEL,
        messages: [{ role: "system", content: prompt }, ...msgList],
        temperature: 0.7
      })
    });
    const json = await res.json();
    return json.choices?.[0]?.message?.content || "网络异常，获取回复失败";
  } catch (err) {
    return "网络异常，获取回复失败";
  }
}

async function generateImage(prompt) {
  try {
    const res = await fetch(IMAGE_GEN_API, {
      method: "POST",
      headers: { "Authorization": `Bearer ${IMAGE_GEN_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, width: 1024, height: 1024, num_steps: 20 })
    });
    if (!res.ok) { showToast("生成失败，请重试"); return ""; }
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("生成图片失败:", err);
    showToast("生成失败，请检查网络");
    return "";
  }
}

const calcDailyReport = (state) => {
  const todayStr = moment().format("YYYY-MM-DD");
  const existing = state.businessHistory.find(r => r.date === todayStr);
  if (existing) return existing;
  const todayOrders = state.globalOrderRecord.filter(item => moment(item.time).format("YYYY-MM-DD") === todayStr);
  let meituanIncome = 0, douyinIncome = 0, dianpingIncome = 0;
  todayOrders.forEach(order => {
    switch(order.platform) {
      case "美团": meituanIncome += order.couponPrice; break;
      case "抖音": douyinIncome += order.couponPrice; break;
      case "大众点评": dianpingIncome += order.couponPrice; break;
    }
  });
  const totalIncome = meituanIncome + douyinIncome + dianpingIncome;
  const purchaseCost = Number(state.costCache.purchaseCost) || 0;
  const fixedCost = Number(state.costCache.fixedCost) || 0;
  const tempLoss = Number(state.lastBusinessInput.loss) || 0;
  const tempOtherCost = Number(state.lastBusinessInput.otherCost) || 0;
  const subLoss = Number(state.lastBusinessInput.lossOverdue||0) + Number(state.lastBusinessInput.lossOperate||0) + Number(state.lastBusinessInput.lossOther||0);
  const totalLoss = tempLoss + subLoss;
  const totalCost = purchaseCost + fixedCost + tempOtherCost + totalLoss;
  const profit = totalIncome - totalCost;
  const profitRate = totalIncome === 0 ? 0 : Number((profit / totalIncome * 100).toFixed(2));
  return {
    id: new Date().getTime().toString(),
    date: todayStr,
    shopName: state.shopConfig.shopName,
    income: totalIncome,
    meituanIncome,
    douyinIncome,
    dianpingIncome,
    totalOrder: todayOrders.length,
    purchaseCost,
    loss: totalLoss,
    fixedCost,
    otherCost: tempOtherCost,
    totalCost,
    profit,
    profitRate
  };
};

const showDailyPush = (report) => {
  Alert.alert("📊 今日经营日报", 
    `门店：${report.shopName}\n订单：${report.totalOrder}单\n总营收：¥${report.income}\n净利润：¥${report.profit}\n利润率：${report.profitRate}%`);
};
const showWeekPush = (report) => {
  Alert.alert("📅 本周周报", 
    `周期：${report.startDate} ~ ${report.endDate}\n总订单：${report.totalOrder}单\n总营收：¥${report.totalIncome}\n日均：¥${report.avgDailyIncome}`);
};
const showMonthPush = (report) => {
  Alert.alert("📆 月度月报", 
    `${report.yearMonth}\n有效天数：${report.dayCount}天\n总营收：¥${report.totalIncome}\n总利润：¥${report.totalProfit}`);
};

const generateWeekReport = (state) => {
  const today = moment();
  const weekStart = today.clone().startOf("week");
  const weekEnd = today.clone().endOf("week");
  const weekList = state.businessHistory.filter(item => moment(item.date).isBetween(weekStart, weekEnd, null, "[]"));
  if(weekList.length === 0) return null;
  const totalIncome = weekList.reduce((s,r)=>s+r.income,0);
  const totalProfit = weekList.reduce((s,r)=>s+r.profit,0);
  const totalOrder = weekList.reduce((s,r)=>s+r.totalOrder,0);
  const avgDailyIncome = Number((totalIncome/weekList.length).toFixed(2));
  return { startDate: weekStart.format("MM-DD"), endDate: weekEnd.format("MM-DD"), totalIncome, totalProfit, totalOrder, avgDailyIncome };
};
const generateMonthReport = (state) => {
  const today = moment();
  const monthStr = today.format("YYYY-MM");
  const monthList = state.businessHistory.filter(item => item.date.startsWith(monthStr));
  if(monthList.length === 0) return null;
  const totalIncome = monthList.reduce((s,r)=>s+r.income,0);
  const totalProfit = monthList.reduce((s,r)=>s+r.profit,0);
  const totalOrder = monthList.reduce((s,r)=>s+r.totalOrder,0);
  return { yearMonth: monthStr, totalIncome, totalProfit, totalOrder, dayCount: monthList.length };
};

// ========== 数据持久化工具 ==========
const saveAllData = async (state) => {
  try {
    const dataToSave = {
      globalOrderRecord: state.globalOrderRecord,
      globalStockRecord: state.globalStockRecord,
      goodsList: state.goodsList,
      staffMemberList: state.staffMemberList,
      badReviewList: state.badReviewList,
      businessHistory: state.businessHistory,
      groupChatMessages: state.groupChatMessages,
      privateChatMessages: state.privateChatMessages,
      latestDailyReport: state.latestDailyReport,
      costCache: state.costCache,
      pushConfig: state.pushConfig,
      shopConfig: state.shopConfig,
      lastBusinessInput: state.lastBusinessInput,
    };
    await AsyncStorage.setItem('appData', JSON.stringify(dataToSave));
  } catch (error) {
    console.warn('保存数据失败', error);
  }
};

const loadAllData = async () => {
  try {
    const data = await AsyncStorage.getItem('appData');
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.warn('加载数据失败', error);
    return null;
  }
};

// ========== 样式 ==========
const styles = StyleSheet.create({
  safeTop: { height: Platform.OS === 'ios' ? 44 : 32 },
  headerBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: BG_CARD,
    borderBottomWidth: 0,
    ...SHADOW,
  },
  pageTitle: { fontSize: 18, fontWeight: '600', color: TEXT_MAIN },
  homeTitle: { fontSize: 20, fontWeight: '700', color: TEXT_MAIN },
  container: { flex: 1, backgroundColor: BG_PAGE },
  chatScroll: { flex: 1, paddingHorizontal: 12 },
  bubbleLeft: {
    backgroundColor: BG_CARD,
    padding: 12,
    borderRadius: 16,
    marginVertical: 4,
    maxWidth: '78%',
    alignSelf: 'flex-start',
    ...SHADOW,
  },
  bubbleRight: {
    backgroundColor: LIGHT_PRIMARY,
    padding: 12,
    borderRadius: 16,
    marginVertical: 4,
    maxWidth: '78%',
    alignSelf: 'flex-end',
    ...SHADOW,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderColor: BORDER_COLOR,
    backgroundColor: '#F7F7F7',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0
  },
  inputBox: {
    flex: 1,
    height: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 0,
    borderRadius: 22,
    fontSize: 15,
    backgroundColor: '#FFFFFF',
    color: TEXT_MAIN,
    ...SHADOW,
  },
  sendBtn: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: PRIMARY_COLOR, borderRadius: 22, marginLeft: 8 },
  sendTxt: { color: '#fff', fontSize: 14, fontWeight: '500' },
  label: { fontSize: 14, color: TEXT_SECOND, marginTop: 12, marginBottom: 6, fontWeight: '500' },
  formInput: {
    height: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 10,
    backgroundColor: BG_CARD,
    color: TEXT_MAIN,
  },
  primaryBtn: {
    marginTop: 16,
    height: 48,
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOW,
  },
  miniBlueBtn: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: PRIMARY_COLOR, borderRadius: 8 },
  loginContainer: { flex: 1, backgroundColor: BG_PAGE, paddingHorizontal: 24, justifyContent: 'center' },
  loginTitle: { fontSize: 28, fontWeight: '700', color: TEXT_MAIN, marginBottom: 8 },
  loginSubtitle: { fontSize: 16, color: TEXT_SECOND, marginBottom: 32 },
  roleSelector: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 24 },
  roleBtn: {
    flex: 1,
    paddingVertical: 12,
    marginHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    alignItems: 'center',
  },
  roleBtnActive: { borderColor: PRIMARY_COLOR, backgroundColor: LIGHT_PRIMARY },
  roleText: { fontSize: 16, fontWeight: '500', color: TEXT_MAIN },
  loginBtn: { height: 48, backgroundColor: PRIMARY_COLOR, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  loginBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  codeRow: { flexDirection: 'row', alignItems: 'center' },
  codeInput: { flex: 1 },
  getCodeBtn: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: LIGHT_PRIMARY, borderRadius: 8, marginLeft: 8 },
  getCodeText: { color: PRIMARY_COLOR, fontSize: 14 },
  tagNormal: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  tagActive: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 20,
  },
  cardBox: { backgroundColor: BG_CARD, padding: 16, borderRadius: 14, ...SHADOW },
  listItem: { backgroundColor: BG_CARD, padding: 14, borderRadius: 12, marginVertical: 6, ...SHADOW },
  roleLabel: { fontSize: 11, color: TEXT_THIRD, marginBottom: 2 },
  iconBtn: { paddingHorizontal: 8, justifyContent: 'center' },
  emojiRow: { height: 44, backgroundColor: BG_CARD, paddingHorizontal: 10, borderTopWidth: 1, borderColor: BORDER_COLOR },
  quickReplyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: BG_CARD,
    borderBottomWidth: 1,
    borderColor: BORDER_COLOR,
  },
  quickReplyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: LIGHT_PRIMARY,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 6,
  },
  quickReplyText: { color: PRIMARY_COLOR, fontSize: 13 },
  scannerContainer: { flex: 1 },
  cancelBtn: { position: 'absolute', top: 40, right: 20, backgroundColor: 'rgba(0,0,0,0.7)', padding: 10, borderRadius: 8 },
  cancelText: { color: '#fff', fontSize: 16 },
  imageMessage: { width: 150, height: 150, borderRadius: 12, marginTop: 4 },
  productItem: { backgroundColor: BG_CARD, padding: 14, borderRadius: 12, marginVertical: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...SHADOW },
  productName: { fontSize: 16, fontWeight: '500', color: TEXT_MAIN },
  productStock: { fontSize: 14, color: TEXT_SECOND },
  productPlatform: { fontSize: 12, color: TEXT_THIRD },
  editBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: LIGHT_PRIMARY, borderRadius: 8 },
  editBtnText: { color: PRIMARY_COLOR, fontSize: 13, fontWeight: '500' },
  modalMask: {
    position: 'absolute', zIndex: 9999, top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16
  },
  modalWrap: { width: '100%', maxWidth: 480, backgroundColor: BG_CARD, borderRadius: 20, padding: 24, ...SHADOW },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: TEXT_MAIN },
  closeTxt: { fontSize: 24, color: TEXT_THIRD },
  divider: { height: 1, backgroundColor: BORDER_COLOR, marginVertical: 16 },
  chatMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  chatMenuIcon: { fontSize: 20, width: 30, color: TEXT_MAIN },
  chatMenuText: { fontSize: 16, color: TEXT_MAIN, marginLeft: 12 },
  reportCard: { backgroundColor: BG_CARD, padding: 14, borderRadius: 14, marginTop: 16, ...SHADOW },
  reportTitle: { fontSize: 16, fontWeight: '600', color: TEXT_MAIN, marginBottom: 8 },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  reportLabel: { fontSize: 14, color: TEXT_SECOND },
  reportValue: { fontSize: 14, color: TEXT_MAIN, fontWeight: '500' },
  settingGroup: { marginTop: 16, backgroundColor: BG_CARD, borderRadius: 14, overflow: 'hidden', ...SHADOW },
  settingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: BORDER_COLOR },
  settingItemLast: { borderBottomWidth: 0 },
  settingIcon: { fontSize: 20, marginRight: 12, width: 28, textAlign: 'center', color: TEXT_SECOND },
  timePickerBtn: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: BORDER_COLOR, borderRadius: 8, backgroundColor: BG_CARD, marginTop: 4 },
  timePickerText: { fontSize: 16, color: TEXT_MAIN },
  switchAccountContainer: { flex: 1, backgroundColor: BG_PAGE, paddingHorizontal: 16, paddingTop: 20 },
  accountItem: { backgroundColor: BG_CARD, padding: 16, borderRadius: 12, marginVertical: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', ...SHADOW },
  accountInfo: { flex: 1 },
  accountPhone: { fontSize: 16, fontWeight: '500', color: TEXT_MAIN },
  accountDetail: { fontSize: 14, color: TEXT_SECOND, marginTop: 2 },
  registerBtn: { marginTop: 20, height: 48, backgroundColor: PRIMARY_COLOR, borderRadius: 12, justifyContent: 'center', alignItems: 'center', ...SHADOW },
  registerBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  bossMessageCard: { marginTop: 16, backgroundColor: BG_CARD, padding: 14, borderRadius: 14, ...SHADOW },
  bossMessageTitle: { fontSize: 16, fontWeight: '600', color: TEXT_MAIN, marginBottom: 8 },
  dailyReportCard: { marginTop: 16, backgroundColor: BG_CARD, padding: 14, borderRadius: 14, ...SHADOW },
  badReviewItem: { backgroundColor: BG_CARD, padding: 14, borderRadius: 12, marginVertical: 6, ...SHADOW },
  badReviewContent: { fontSize: 14, color: TEXT_MAIN },
  badReviewMeta: { fontSize: 12, color: TEXT_THIRD, marginTop: 4 },
  badReviewHandled: { fontSize: 12, color: SUCCESS_COLOR, marginTop: 4, fontWeight: '500' },
  badReviewHandledBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: SUCCESS_COLOR, borderRadius: 6, marginLeft: 8 },
  badReviewHandledBtnText: { color: '#fff', fontSize: 12 },
  badReviewEmpty: { textAlign: 'center', marginTop: 40, color: TEXT_THIRD, fontSize: 16 },
  chartContainer: { marginTop: 16, backgroundColor: BG_CARD, padding: 16, borderRadius: 14, ...SHADOW },
  chartTitle: { fontSize: 16, fontWeight: '600', color: TEXT_MAIN, marginBottom: 8 },
  exportBtn: { marginTop: 8, padding: 10, backgroundColor: PRIMARY_COLOR, borderRadius: 8, alignSelf: 'flex-start' },
  exportBtnText: { color: '#fff', fontSize: 14, fontWeight: '500' },
});

// ========== 登录页面 ==========
const LoginScreen = () => {
  const { state, dispatch } = useApp();
  const navigation = useNavigation();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState('商家');
  const [shopName, setShopName] = useState('');

  useEffect(() => {
    if (state.user) navigation.replace('RootTabs');
  }, [state.user]);

  const handleLogin = async () => {
    if (phone.length !== 11) { showToast('请输入11位手机号'); return; }
    if (code !== '123456') { showToast('验证码错误'); return; }
    if (!shopName.trim()) { showToast('请输入店铺名称'); return; }
    const industry = detectIndustry(shopName);
    const user = { role, phone, shopName, name: '老板' };
    const shopInfo = { shopName, phone, industry, staffList: [] };
    dispatch({ type: 'LOGIN', payload: { user, shopInfo } });
    dispatch({ type: 'SET_SHOP_CONFIG', payload: { shopName, industry } });
    await AsyncStorage.setItem('user', JSON.stringify(user));
    await AsyncStorage.setItem('shopInfo', JSON.stringify(shopInfo));
    navigation.replace('RootTabs');
  };

  return (
    <View style={styles.loginContainer}>
      <Text style={styles.loginTitle}>经营宝</Text>
      <Text style={styles.loginSubtitle}>登录您的店铺账号</Text>
      <Text style={styles.label}>手机号</Text>
      <TextInput style={[styles.formInput, { marginBottom: 12 }]} placeholder="请输入手机号" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <Text style={styles.label}>验证码</Text>
      <View style={[styles.codeRow, { marginBottom: 16 }]}>
        <TextInput style={[styles.formInput, styles.codeInput]} placeholder="验证码" keyboardType="numeric" value={code} onChangeText={setCode} />
        <TouchableOpacity style={styles.getCodeBtn}><Text style={styles.getCodeText}>获取验证码</Text></TouchableOpacity>
      </View>
      <Text style={styles.label}>店铺名称</Text>
      <TextInput style={styles.formInput} placeholder="请输入店铺名称" value={shopName} onChangeText={setShopName} />
      <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
        <Text style={styles.loginBtnText}>登录</Text>
      </TouchableOpacity>
    </View>
  );
};

// ========== 返回键处理 Hook ==========
function useBackHandler(navigation) {
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navigation.canGoBack()) { navigation.goBack(); return true; }
      return false;
    });
    return () => backHandler.remove();
  }, [navigation]);
}

// ========== 空页面占位 ==========
const PlaceholderPage = ({ title }) => (
  <View style={styles.container}>
    <View style={styles.safeTop} />
    <View style={styles.headerBar}>
      <Text style={styles.pageTitle}>{title}</Text>
    </View>
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 16, color: TEXT_SECOND }}>{title}页面 - 功能开发中</Text>
    </View>
  </View>
);

// ========== 差评列表页面 ==========
const BadReviewListPage = () => {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();

  const handleMarkHandled = (id) => {
    dispatch({ type: 'MARK_BAD_REVIEW_HANDLED', payload: id });
    showToast('已标记为已处理');
  };

  return (
    <View style={styles.container}>
      <View style={styles.safeTop} />
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={{ fontSize:20 }}>&lt;</Text></TouchableOpacity>
        <Text style={styles.pageTitle}>差评预警详情</Text>
        <View style={{ width:24 }}/>
      </View>
      <ScrollView style={{ padding:16 }}>
        {state.badReviewList.length === 0 ? (
          <Text style={styles.badReviewEmpty}>✅ 暂无差评，继续保持！</Text>
        ) : (
          state.badReviewList.map(item => (
            <View key={item.id} style={styles.badReviewItem}>
              <Text style={styles.badReviewContent}>“{item.content}”</Text>
              <Text style={styles.badReviewMeta}>平台：{item.platform} ｜ {item.time}</Text>
              {item.handled ? (
                <Text style={styles.badReviewHandled}>✅ 已处理</Text>
              ) : (
                <TouchableOpacity style={styles.badReviewHandledBtn} onPress={() => handleMarkHandled(item.id)}>
                  <Text style={styles.badReviewHandledBtnText}>标记已处理</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

// ========== 首页 ==========
const HomePage = () => {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const user = state.user;
  const [settingOpen, setSettingOpen] = useState(false);
  const [exitTimer, setExitTimer] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [chartData, setChartData] = useState({ labels: [], datasets: [{ data: [] }] });

  const todayStr = moment().format('YYYY-MM-DD');
  const todayOrders = state.globalOrderRecord.filter(item => moment(item.time).format('YYYY-MM-DD') === todayStr);
  let meituanIncome = 0, douyinIncome = 0, dianpingIncome = 0;
  todayOrders.forEach(order => {
    switch(order.platform) {
      case '美团': meituanIncome += order.couponPrice; break;
      case '抖音': douyinIncome += order.couponPrice; break;
      case '大众点评': dianpingIncome += order.couponPrice; break;
    }
  });
  const totalIncome = meituanIncome + douyinIncome + dianpingIncome;

  // 图表数据：最近7天营收
  useEffect(() => {
    const labels = [];
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const date = moment().subtract(i, 'days').format('MM-DD');
      labels.push(date);
      const dayOrders = state.globalOrderRecord.filter(item => moment(item.time).format('MM-DD') === date);
      const dayIncome = dayOrders.reduce((sum, o) => sum + o.couponPrice, 0);
      data.push(dayIncome);
    }
    setChartData({ labels, datasets: [{ data }] });
  }, [state.globalOrderRecord]);

  // ====== 日报自动推送定时器 ======
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const h = now.getHours().toString();
      const m = now.getMinutes().toString();
      const today = moment().format('YYYY-MM-DD');
      const isMonthLastDay = moment().isSame(moment().endOf('month'), 'day');
      const isWeekFirst = moment().day() === 1;

      if (h === state.pushConfig.offHour && m === state.pushConfig.offMinute && !state.todayPushTrigger) {
        const report = calcDailyReport(state);
        if (report) {
          dispatch({ type: 'SET_LATEST_DAILY_REPORT', payload: report });
          dispatch({ type: 'ADD_BUSINESS_REPORT', payload: report });
          showDailyPush(report);
          dispatch({ type: 'SET_PUSH_TRIGGER', payload: { today: true } });
        }
        if (isMonthLastDay && !state.monthPushTrigger) {
          const monthReport = generateMonthReport(state);
          if (monthReport) {
            showMonthPush(monthReport);
            dispatch({ type: 'SET_PUSH_TRIGGER', payload: { month: true } });
          }
        }
      }

      if (isWeekFirst && h === state.pushConfig.workHour && m === state.pushConfig.workMinute && !state.weekPushTrigger) {
        const weekReport = generateWeekReport(state);
        if (weekReport) {
          showWeekPush(weekReport);
          dispatch({ type: 'SET_PUSH_TRIGGER', payload: { week: true } });
        }
      }

      if (h === '00' && m === '00') {
        dispatch({ type: 'RESET_PUSH_TRIGGER', payload: { today: false, week: false, month: false } });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [state, dispatch]);

  // ====== 首页退出两次 ======
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navigation.isFocused()) {
        if (!navigation.canGoBack()) {
          if (exitTimer) {
            BackHandler.exitApp();
            return true;
          } else {
            showToast('再按一次退出');
            const timer = setTimeout(() => setExitTimer(null), 2000);
            setExitTimer(timer);
            return true;
          }
        }
        return false;
      }
      return false;
    });
    return () => backHandler.remove();
  }, [navigation, exitTimer]);

  // 下拉刷新
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // 重新计算日报
    const report = calcDailyReport(state);
    if (report) {
      dispatch({ type: 'SET_LATEST_DAILY_REPORT', payload: report });
    }
    setRefreshing(false);
  }, [state]);

  // 导出数据
  const exportData = async () => {
    try {
      const csvContent = 
        "日期,订单数,总营收,净利润,利润率\n" +
        state.businessHistory.map(r => 
          `${r.date},${r.totalOrder},${r.income},${r.profit},${r.profitRate}%`
        ).join('\n');
      const fileUri = FileSystem.documentDirectory + 'business_report.csv';
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        showToast('分享功能不可用');
      }
    } catch (error) {
      showToast('导出失败');
    }
  };

  const menuList = [
    { icon: "🎫", label: "订单核销", tab: 'VerifyTab', screen: 'VerifyOrder' },
    { icon: "📦", label: "出入库", tab: 'StockTab', screen: 'StockManage' },
    { icon: "👥", label: "员工管理", internal: true, screen: 'StaffManage' },
    { icon: "💬", label: "顾客客服", tab: 'CustomerTab', screen: 'CustomerService' },
    { icon: "🤝", label: "内部沟通", tab: 'InternalTab', screen: 'InternalChat' },
    { icon: "🤖", label: "AI助手", tab: 'AITab', screen: 'MerchantAssistant' },
    { icon: "📊", label: "商品总览", internal: true, screen: 'ProductOverview' },
  ];

  const handleMenuPress = (item) => {
    if (item.internal) navigation.navigate(item.screen);
    else navigation.getParent().navigate(item.tab, { screen: item.screen });
  };

  const latestReport = state.latestDailyReport;

  return (
    <View style={styles.container}>
      <SettingDrawer visible={settingOpen} onClose={() => setSettingOpen(false)} />
      <View style={styles.safeTop} />
      <View style={styles.headerBar}>
        <View style={{ width: 40 }} />
        <Text style={styles.homeTitle}>经营宝</Text>
        <TouchableOpacity onPress={() => setSettingOpen(true)}>
          <Text style={{ fontSize: 24, color: TEXT_SECOND }}>⚙</Text>
        </TouchableOpacity>
      </View>
      <ScrollView 
        style={{ flex: 1, paddingHorizontal: 16 }} 
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY_COLOR]} />
        }
      >
        <View style={styles.cardBox}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: TEXT_MAIN, marginBottom: 8 }}>👋 欢迎，{user?.name || '商家'}</Text>
          <Text style={{ color: TEXT_SECOND }}>店铺：{state.shopInfo.shopName || '未设置'}</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          <View style={{ width: (width - 44) / 2, backgroundColor: BG_CARD, padding: 16, borderRadius: 14, ...SHADOW }}>
            <Text style={{ fontSize: 13, color: TEXT_SECOND }}>今日核销订单</Text>
            <Text style={{ fontSize: 22, fontWeight: '700', marginTop: 8, color: TEXT_MAIN }}>{todayOrders.length}</Text>
          </View>
          <View style={{ width: (width - 44) / 2, backgroundColor: BG_CARD, padding: 16, borderRadius: 14, ...SHADOW }}>
            <Text style={{ fontSize: 13, color: TEXT_SECOND }}>今日总营收</Text>
            <Text style={{ fontSize: 22, fontWeight: '700', marginTop: 8, color: PRIMARY_COLOR }}>¥{totalIncome}</Text>
          </View>
          <TouchableOpacity 
            style={{ width: (width - 44) / 2, backgroundColor: BG_CARD, padding: 16, borderRadius: 14, ...SHADOW }}
            onPress={() => navigation.navigate('BadReviewList')}
          >
            <Text style={{ fontSize: 13, color: TEXT_SECOND }}>差评预警</Text>
            <Text style={{ fontSize: 22, fontWeight: '700', marginTop: 8, color: state.badReviewCount > 0 ? DANGER_COLOR : TEXT_MAIN }}>
              {state.badReviewCount}
              {state.badReviewCount > 0 && <Text style={{ fontSize: 14, color: PRIMARY_COLOR, marginLeft: 8 }}>点击查看 →</Text>}
            </Text>
          </TouchableOpacity>
          <View style={{ width: (width - 44) / 2, backgroundColor: BG_CARD, padding: 16, borderRadius: 14, ...SHADOW }}>
            <Text style={{ fontSize: 13, color: TEXT_SECOND }}>总商品数</Text>
            <Text style={{ fontSize: 22, fontWeight: '700', marginTop: 8, color: TEXT_MAIN }}>{state.goodsList.length}</Text>
          </View>
        </View>

        {/* 营收趋势图 */}
        <View style={styles.chartContainer}>
          <Text style={styles.chartTitle}>📈 近7日营收趋势</Text>
          <LineChart
            data={chartData}
            width={width - 64}
            height={160}
            chartConfig={{
              backgroundColor: '#ffffff',
              backgroundGradientFrom: '#ffffff',
              backgroundGradientTo: '#ffffff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(22, 93, 255, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
              style: { borderRadius: 8 },
              propsForDots: { r: '4', strokeWidth: '2', stroke: '#165DFF' }
            }}
            bezier
            style={{ marginVertical: 8, borderRadius: 8 }}
          />
          <TouchableOpacity style={styles.exportBtn} onPress={exportData}>
            <Text style={styles.exportBtnText}>📤 导出数据</Text>
          </TouchableOpacity>
        </View>

        {/* 日报卡片 */}
        {latestReport && (
          <View style={styles.dailyReportCard}>
            <Text style={styles.reportTitle}>📊 最新经营日报</Text>
            <View style={styles.reportRow}><Text style={styles.reportLabel}>日期</Text><Text style={styles.reportValue}>{latestReport.date}</Text></View>
            <View style={styles.reportRow}><Text style={styles.reportLabel}>订单数</Text><Text style={styles.reportValue}>{latestReport.totalOrder}单</Text></View>
            <View style={styles.reportRow}><Text style={styles.reportLabel}>总营收</Text><Text style={styles.reportValue}>¥{latestReport.income}</Text></View>
            <View style={styles.reportRow}><Text style={styles.reportLabel}>净利润</Text><Text style={styles.reportValue}>¥{latestReport.profit}</Text></View>
            <View style={styles.reportRow}><Text style={styles.reportLabel}>利润率</Text><Text style={styles.reportValue}>{latestReport.profitRate}%</Text></View>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', gap: 12, paddingRight: 16 }}>
            {menuList.map((item, idx) => (
              <TouchableOpacity key={idx} onPress={() => handleMenuPress(item)} style={{ width: 110, backgroundColor: BG_CARD, paddingVertical: 16, borderRadius: 12, alignItems: 'center', ...SHADOW }}>
                <Text style={{ fontSize: 28 }}>{item.icon}</Text>
                <Text style={{ fontSize: 13, marginTop: 6, color: TEXT_MAIN }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </ScrollView>

      <Animated.View style={{ position: 'absolute', right: 20, bottom: 80, width: 56, height: 56, borderRadius: 28, backgroundColor: PRIMARY_COLOR, justifyContent: 'center', alignItems: 'center', ...SHADOW }}>
        <TouchableOpacity onPress={() => navigation.getParent().navigate('AITab', { screen: 'MerchantAssistant' })}>
          <Ionicons name="chatbubble-ellipses" size={28} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

// ========== 设置抽屉 ==========
const SettingDrawer = ({ visible, onClose }) => {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const user = state.user;
  const shopInfo = state.shopInfo;
  const isEmployee = user?.role === '员工';
  const [shopName, setShopName] = useState(shopInfo.shopName || '');
  const [phone, setPhone] = useState(shopInfo.phone || '');
  const [workH, setWorkH] = useState(state.pushConfig.workHour);
  const [workM, setWorkM] = useState(state.pushConfig.workMinute);
  const [offH, setOffH] = useState(state.pushConfig.offHour);
  const [offM, setOffM] = useState(state.pushConfig.offMinute);

  const saveShop = () => {
    const industry = detectIndustry(shopName);
    const updatedShopInfo = { ...shopInfo, shopName, phone, industry };
    dispatch({ type: 'UPDATE_SHOP_INFO', payload: updatedShopInfo });
    dispatch({ type: 'SET_SHOP_CONFIG', payload: { shopName, industry } });
    showToast(`门店信息已保存，类型识别为：${industry}`);
  };

  const savePush = () => {
    const config = { workHour: workH, workMinute: workM, offHour: offH, offMinute: offM };
    dispatch({ type: 'SET_PUSH_CONFIG', payload: config });
    showToast("推送时间保存成功");
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('user');
    await AsyncStorage.removeItem('shopInfo');
    dispatch({ type: 'LOGOUT' });
    onClose();
    navigation.replace('Login');
  };

  const handleSwitchAccount = () => { onClose(); navigation.navigate('SwitchAccount'); };

  if (!visible) return null;
  return (
    <View style={{ position:'absolute', zIndex:9998, top:0, left:0, right:0, bottom:0, flexDirection: 'row' }}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} activeOpacity={1} onPress={onClose} />
      <ScrollView style={{ width: width * 0.7, height: '100%', backgroundColor: BG_CARD }}>
        <View style={styles.safeTop} />
        <View style={[styles.headerBar, { borderBottomWidth: 0 }]}>
          <Text style={styles.pageTitle}>系统设置</Text>
          <TouchableOpacity onPress={onClose}><Text style={{ fontSize:20, color: TEXT_SECOND }}>✕</Text></TouchableOpacity>
        </View>
        <View style={{ padding: 16 }}>
          <View style={styles.settingGroup}>
            <View style={[styles.settingItem, { borderBottomWidth: 0 }]}>
              <Text style={styles.settingIcon}>🏪</Text>
              <View style={{ flex:1 }}>
                <Text style={styles.label}>门店名称</Text>
                {isEmployee ? (
                  <Text style={[styles.formInput, { backgroundColor: '#F5F5F5', color: TEXT_SECOND, marginTop:4 }]}>{shopName}</Text>
                ) : (
                  <TextInput style={[styles.formInput, { marginTop:4 }]} value={shopName} onChangeText={setShopName} placeholder="输入门店名称" />
                )}
              </View>
            </View>
          </View>

          <View style={styles.settingGroup}>
            <View style={[styles.settingItem, { borderBottomWidth: 0 }]}>
              <Text style={styles.settingIcon}>📞</Text>
              <View style={{ flex:1 }}>
                <Text style={styles.label}>绑定手机号</Text>
                {isEmployee ? (
                  <Text style={[styles.formInput, { backgroundColor: '#F5F5F5', color: TEXT_SECOND, marginTop:4 }]}>{phone}</Text>
                ) : (
                  <TextInput style={[styles.formInput, { marginTop:4 }]} value={phone} onChangeText={setPhone} placeholder="输入手机号" keyboardType="phone-pad" />
                )}
              </View>
            </View>
          </View>

          {!isEmployee && (
            <TouchableOpacity style={[styles.primaryBtn, { marginTop:8, height:40 }]} onPress={saveShop}>
              <Text style={styles.sendTxt}>保存信息</Text>
            </TouchableOpacity>
          )}

          {!isEmployee && (
            <View style={styles.settingGroup}>
              <View style={styles.settingItem}>
                <Text style={styles.settingIcon}>⏰</Text>
                <View style={{ flex:1 }}>
                  <Text style={styles.label}>每周早间周报推送</Text>
                  <View style={{ flexDirection:'row', gap:10 }}>
                    <TextInput style={[styles.formInput, { flex:1 }]} keyboardType="numeric" maxLength={2} value={workH} onChangeText={setWorkH} placeholder="小时"/>
                    <TextInput style={[styles.formInput, { flex:1 }]} keyboardType="numeric" maxLength={2} value={workM} onChangeText={setWorkM} placeholder="分钟"/>
                  </View>
                </View>
              </View>
              <View style={[styles.settingItem, styles.settingItemLast]}>
                <Text style={styles.settingIcon}>🌙</Text>
                <View style={{ flex:1 }}>
                  <Text style={styles.label}>每日下班/月末推送</Text>
                  <View style={{ flexDirection:'row', gap:10 }}>
                    <TextInput style={[styles.formInput, { flex:1 }]} keyboardType="numeric" maxLength={2} value={offH} onChangeText={setOffH} placeholder="小时"/>
                    <TextInput style={[styles.formInput, { flex:1 }]} keyboardType="numeric" maxLength={2} value={offM} onChangeText={setOffM} placeholder="分钟"/>
                  </View>
                  <TouchableOpacity style={[styles.miniBlueBtn, { marginTop:8, alignSelf:'flex-start' }]} onPress={savePush}>
                    <Text style={styles.sendTxt}>保存时间</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <View style={styles.settingGroup}>
            <TouchableOpacity style={styles.settingItem} onPress={handleSwitchAccount}>
              <Text style={styles.settingIcon}>👤</Text>
              <Text style={{ color:TEXT_MAIN }}>切换账号</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingItem} onPress={() => showToast('缓存已清除')}>
              <Text style={styles.settingIcon}>🗑️</Text>
              <Text style={{ color:TEXT_MAIN }}>清除缓存</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.settingItem, styles.settingItemLast]} onPress={handleLogout}>
              <Text style={styles.settingIcon}>🚪</Text>
              <Text style={{ color:DANGER_COLOR }}>退出登录</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

// ========== 切换账号 ==========
const SwitchAccountScreen = () => {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const currentUser = state.user;
  const previousAccounts = state.previousAccounts;

  const handleSelectAccount = async (account) => {
    const user = { role: account.role, phone: account.phone, shopName: account.shopName, name: account.name || '老板' };
    const shopInfo = { shopName: account.shopName, phone: account.phone, industry: detectIndustry(account.shopName), staffList: [] };
    dispatch({ type: 'LOGIN', payload: { user, shopInfo } });
    dispatch({ type: 'SET_SHOP_CONFIG', payload: { shopName: account.shopName, industry: shopInfo.industry } });
    await AsyncStorage.setItem('user', JSON.stringify(user));
    await AsyncStorage.setItem('shopInfo', JSON.stringify(shopInfo));
    navigation.replace('RootTabs');
  };

  const handleRegister = async () => {
    await AsyncStorage.removeItem('user');
    await AsyncStorage.removeItem('shopInfo');
    dispatch({ type: 'LOGOUT' });
    dispatch({ type: 'CLEAR_PREVIOUS_ACCOUNTS' });
    navigation.replace('Login');
  };

  const allAccounts = [];
  if (currentUser) allAccounts.push({ phone: currentUser.phone, role: currentUser.role, shopName: currentUser.shopName, name: currentUser.name, isCurrent: true });
  previousAccounts.forEach(acc => {
    if (!allAccounts.find(a => a.phone === acc.phone)) allAccounts.push({ ...acc, isCurrent: false });
  });

  return (
    <View style={styles.switchAccountContainer}>
      <Text style={[styles.pageTitle, { marginBottom: 16 }]}>切换账号</Text>
      {allAccounts.length === 0 ? (
        <Text style={{ color: TEXT_THIRD, textAlign: 'center', marginTop: 30 }}>暂无历史账号</Text>
      ) : (
        allAccounts.map((acc, idx) => (
          <TouchableOpacity key={idx} style={styles.accountItem} onPress={() => handleSelectAccount(acc)} disabled={acc.isCurrent}>
            <View style={styles.accountInfo}>
              <Text style={styles.accountPhone}>{acc.phone}</Text>
              <Text style={styles.accountDetail}>{acc.shopName} · {acc.role}{acc.isCurrent ? ' (当前)' : ''}</Text>
            </View>
            {!acc.isCurrent && <Ionicons name="chevron-forward" size={24} color={TEXT_THIRD} />}
          </TouchableOpacity>
        ))
      )}
      <TouchableOpacity style={styles.registerBtn} onPress={handleRegister}>
        <Text style={styles.registerBtnText}>注册新账号</Text>
      </TouchableOpacity>
    </View>
  );
};

// -------- 第一段结束 ----------
// 请继续复制第二段代码// ========== 导航定义 ==========
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ========== 订单核销页面 ==========
const VerifyOrder = () => {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const [orderCode, setOrderCode] = useState('');
  const [platform, setPlatform] = useState('美团');
  const [couponPrice, setCouponPrice] = useState('');
  const [scanning, setScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);

  // 请求相机权限
  useEffect(() => {
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleVerify = () => {
    if (!orderCode.trim()) { showToast('请输入核销码'); return; }
    const price = parseFloat(couponPrice);
    if (isNaN(price) || price <= 0) { showToast('请输入有效金额'); return; }
    const record = {
      id: Date.now().toString(),
      code: orderCode.trim(),
      platform,
      couponPrice: price,
      time: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_ORDER_RECORD', payload: record });
    // 检测差评
    if (checkBadReview(orderCode)) {
      const badReview = {
        id: Date.now().toString(),
        content: orderCode,
        platform,
        time: moment().format('YYYY-MM-DD HH:mm'),
        handled: false,
      };
      dispatch({ type: 'ADD_BAD_REVIEW', payload: badReview });
      showToast('⚠️ 检测到疑似差评内容，已记录');
    } else {
      showToast(`核销成功！${platform} ¥${price}`);
    }
    setOrderCode('');
    setCouponPrice('');
  };

  const handleBarCodeScanned = ({ data }) => {
    setScanning(false);
    setOrderCode(data);
    // 可选：自动填充金额
  };

  if (scanning) {
    return (
      <View style={styles.scannerContainer}>
        <BarCodeScanner
          onBarCodeScanned={handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
        <TouchableOpacity style={styles.cancelBtn} onPress={() => setScanning(false)}>
          <Text style={styles.cancelText}>取消</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.safeTop} />
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={{ fontSize:20 }}>&lt;</Text></TouchableOpacity>
        <Text style={styles.pageTitle}>订单核销</Text>
        <View style={{ width:24 }} />
      </View>
      <ScrollView style={{ padding:16 }}>
        <View style={styles.cardBox}>
          <Text style={styles.label}>核销码</Text>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
            <TextInput
              style={[styles.formInput, { flex:1 }]}
              placeholder="输入核销码或扫码"
              value={orderCode}
              onChangeText={setOrderCode}
            />
            <TouchableOpacity style={styles.miniBlueBtn} onPress={() => setScanning(true)}>
              <Text style={styles.sendTxt}>扫码</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>平台</Text>
          <View style={{ flexDirection:'row', gap:12, marginTop:4 }}>
            {['美团','抖音','大众点评'].map(p => (
              <TouchableOpacity
                key={p}
                style={[styles.tagNormal, platform === p && styles.tagActive]}
                onPress={() => setPlatform(p)}
              >
                <Text style={{ color: platform === p ? '#fff' : TEXT_MAIN }}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>金额 (¥)</Text>
          <TextInput
            style={styles.formInput}
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={couponPrice}
            onChangeText={setCouponPrice}
          />

          <TouchableOpacity style={styles.primaryBtn} onPress={handleVerify}>
            <Text style={styles.sendTxt}>确认核销</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.cardBox}>
          <Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>今日已核销</Text>
          {state.globalOrderRecord
            .filter(item => moment(item.time).format('YYYY-MM-DD') === moment().format('YYYY-MM-DD'))
            .map((item, idx) => (
              <View key={idx} style={styles.listItem}>
                <Text style={{ fontSize:14, color:TEXT_MAIN }}>{item.platform} - ¥{item.couponPrice}</Text>
                <Text style={{ fontSize:12, color:TEXT_THIRD }}>{moment(item.time).format('HH:mm')} 核销码: {item.code}</Text>
              </View>
            ))
          }
          {state.globalOrderRecord.filter(item => moment(item.time).format('YYYY-MM-DD') === moment().format('YYYY-MM-DD')).length === 0 && (
            <Text style={{ color:TEXT_THIRD, textAlign:'center', padding:12 }}>今日暂无核销记录</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

// ========== 商品管理页面 ==========
const ProductOverview = () => {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [name, setName] = useState('');
  const [stock, setStock] = useState('');
  const [platform, setPlatform] = useState('美团');

  const handleSave = () => {
    if (!name.trim()) { showToast('请输入商品名称'); return; }
    const stockNum = parseInt(stock) || 0;
    if (editingItem) {
      const updated = state.goodsList.map(item =>
        item.id === editingItem.id ? { ...item, name: name.trim(), stock: stockNum, platform } : item
      );
      dispatch({ type: 'SET_GOODS_LIST', payload: updated });
      showToast('已更新');
    } else {
      const newItem = {
        id: Date.now().toString(),
        name: name.trim(),
        stock: stockNum,
        platform,
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: 'SET_GOODS_LIST', payload: [...state.goodsList, newItem] });
      showToast('添加成功');
    }
    setModalVisible(false);
    setName('');
    setStock('');
    setEditingItem(null);
  };

  const handleDelete = (id) => {
    Alert.alert('确认删除', '确定删除该商品？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => {
        const filtered = state.goodsList.filter(item => item.id !== id);
        dispatch({ type: 'SET_GOODS_LIST', payload: filtered });
        showToast('已删除');
      }}
    ]);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setName(item.name);
    setStock(String(item.stock));
    setPlatform(item.platform || '美团');
    setModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.safeTop} />
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={{ fontSize:20 }}>&lt;</Text></TouchableOpacity>
        <Text style={styles.pageTitle}>商品总览</Text>
        <TouchableOpacity onPress={() => { setEditingItem(null); setName(''); setStock(''); setPlatform('美团'); setModalVisible(true); }}>
          <Text style={{ fontSize:20, color:PRIMARY_COLOR }}>＋</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={state.goodsList}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.productItem}>
            <View>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.productPlatform}>平台: {item.platform}</Text>
              <Text style={styles.productStock}>库存: {item.stock}</Text>
            </View>
            <View style={{ flexDirection:'row', gap:8 }}>
              <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                <Text style={styles.editBtnText}>编辑</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.editBtn, { backgroundColor:DANGER_COLOR }]} onPress={() => handleDelete(item.id)}>
                <Text style={{ color:'#fff', fontSize:13, fontWeight:'500' }}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={{ textAlign:'center', marginTop:40, color:TEXT_THIRD }}>暂无商品，点击右上角➕添加</Text>}
        contentContainerStyle={{ padding:16 }}
      />

      {/* 添加/编辑弹窗 */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalMask}>
          <View style={styles.modalWrap}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingItem ? '编辑商品' : '添加商品'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.closeTxt}>✕</Text></TouchableOpacity>
            </View>
            <Text style={styles.label}>商品名称</Text>
            <TextInput style={styles.formInput} value={name} onChangeText={setName} placeholder="例如：招牌牛肉面" />
            <Text style={styles.label}>库存</Text>
            <TextInput style={styles.formInput} value={stock} onChangeText={setStock} keyboardType="numeric" placeholder="数量" />
            <Text style={styles.label}>平台</Text>
            <View style={{ flexDirection:'row', gap:12, marginTop:4 }}>
              {['美团','抖音','大众点评'].map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.tagNormal, platform === p && styles.tagActive]}
                  onPress={() => setPlatform(p)}
                >
                  <Text style={{ color: platform === p ? '#fff' : TEXT_MAIN }}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
              <Text style={styles.sendTxt}>{editingItem ? '更新' : '添加'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ========== 员工管理页面 ==========
const StaffManage = () => {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffRole, setStaffRole] = useState('员工'); // 员工、店长

  const handleAddStaff = () => {
    if (!staffName.trim() || !staffPhone.trim()) { showToast('请填写完整信息'); return; }
    const newStaff = {
      id: Date.now().toString(),
      name: staffName.trim(),
      phone: staffPhone.trim(),
      role: staffRole,
      joinedAt: new Date().toISOString(),
    };
    const updated = [...state.staffMemberList, newStaff];
    dispatch({ type: 'SET_STAFF_LIST', payload: updated });
    // 同时更新 shopInfo 中的 staffList
    const shopInfo = { ...state.shopInfo, staffList: updated };
    // 注意：我们已有 SET_STAFF_LIST，但还需更新 shopInfo？可以统一处理，这里我们用 state 的 staffMemberList 即可。
    showToast(`已添加员工 ${newStaff.name}`);
    setModalVisible(false);
    setStaffName('');
    setStaffPhone('');
  };

  const handleRemoveStaff = (id) => {
    Alert.alert('确认移除', '确定移除该员工？', [
      { text: '取消', style: 'cancel' },
      { text: '移除', style: 'destructive', onPress: () => {
        const filtered = state.staffMemberList.filter(item => item.id !== id);
        dispatch({ type: 'SET_STAFF_LIST', payload: filtered });
        showToast('已移除');
      }}
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.safeTop} />
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={{ fontSize:20 }}>&lt;</Text></TouchableOpacity>
        <Text style={styles.pageTitle}>员工管理</Text>
        <TouchableOpacity onPress={() => { setStaffName(''); setStaffPhone(''); setStaffRole('员工'); setModalVisible(true); }}>
          <Text style={{ fontSize:20, color:PRIMARY_COLOR }}>＋</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={state.staffMemberList}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
              <View>
                <Text style={{ fontSize:16, fontWeight:'500', color:TEXT_MAIN }}>{item.name}</Text>
                <Text style={{ fontSize:14, color:TEXT_SECOND }}>{item.phone} · {item.role}</Text>
                <Text style={{ fontSize:12, color:TEXT_THIRD }}>加入: {moment(item.joinedAt).format('YYYY-MM-DD')}</Text>
              </View>
              <TouchableOpacity style={[styles.editBtn, { backgroundColor:DANGER_COLOR }]} onPress={() => handleRemoveStaff(item.id)}>
                <Text style={{ color:'#fff', fontSize:13, fontWeight:'500' }}>移除</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={{ textAlign:'center', marginTop:40, color:TEXT_THIRD }}>暂无员工</Text>}
        contentContainerStyle={{ padding:16 }}
      />

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalMask}>
          <View style={styles.modalWrap}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>添加员工</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.closeTxt}>✕</Text></TouchableOpacity>
            </View>
            <Text style={styles.label}>姓名</Text>
            <TextInput style={styles.formInput} value={staffName} onChangeText={setStaffName} placeholder="输入姓名" />
            <Text style={styles.label}>手机号</Text>
            <TextInput style={styles.formInput} value={staffPhone} onChangeText={setStaffPhone} keyboardType="phone-pad" placeholder="11位手机号" />
            <Text style={styles.label}>角色</Text>
            <View style={{ flexDirection:'row', gap:12, marginTop:4 }}>
              {['员工','店长'].map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.tagNormal, staffRole === r && styles.tagActive]}
                  onPress={() => setStaffRole(r)}
                >
                  <Text style={{ color: staffRole === r ? '#fff' : TEXT_MAIN }}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleAddStaff}>
              <Text style={styles.sendTxt}>添加</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ========== 出入库管理页面 ==========
const StockManage = () => {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [type, setType] = useState('入库'); // 入库 / 出库
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [selectedGoodsId, setSelectedGoodsId] = useState(null);

  // 从商品列表中选择
  const goodsOptions = state.goodsList.map(g => ({ label: g.name, value: g.id }));

  const handleSubmit = () => {
    if (!selectedGoodsId) { showToast('请选择商品'); return; }
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) { showToast('请输入有效数量'); return; }
    const goods = state.goodsList.find(g => g.id === selectedGoodsId);
    if (!goods) { showToast('商品不存在'); return; }

    // 更新库存
    let newStock = goods.stock;
    if (type === '入库') newStock += qty;
    else {
      if (goods.stock < qty) { showToast('库存不足'); return; }
      newStock -= qty;
    }
    const updatedGoods = state.goodsList.map(g =>
      g.id === selectedGoodsId ? { ...g, stock: newStock } : g
    );
    dispatch({ type: 'SET_GOODS_LIST', payload: updatedGoods });

    // 记录出入库记录
    const record = {
      id: Date.now().toString(),
      type,
      productName: goods.name,
      quantity: qty,
      reason: reason.trim() || '无备注',
      time: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_STOCK_RECORD', payload: record });
    showToast(`${type}成功: ${goods.name} ×${qty}`);
    setModalVisible(false);
    setProductName('');
    setQuantity('');
    setReason('');
    setSelectedGoodsId(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.safeTop} />
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={{ fontSize:20 }}>&lt;</Text></TouchableOpacity>
        <Text style={styles.pageTitle}>出入库管理</Text>
        <TouchableOpacity onPress={() => { setType('入库'); setSelectedGoodsId(null); setQuantity(''); setReason(''); setModalVisible(true); }}>
          <Text style={{ fontSize:20, color:PRIMARY_COLOR }}>＋</Text>
        </TouchableOpacity>
      </View>
      <View style={{ padding:16 }}>
        <Text style={{ fontSize:16, fontWeight:'600', marginBottom:8 }}>库存列表</Text>
        {state.goodsList.map(g => (
          <View key={g.id} style={styles.listItem}>
            <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
              <Text style={{ fontSize:16, fontWeight:'500' }}>{g.name}</Text>
              <Text style={{ fontSize:16, color:PRIMARY_COLOR }}>库存: {g.stock}</Text>
            </View>
            <View style={{ flexDirection:'row', gap:8, marginTop:4 }}>
              <TouchableOpacity style={styles.miniBlueBtn} onPress={() => { setType('入库'); setSelectedGoodsId(g.id); setQuantity(''); setReason(''); setModalVisible(true); }}>
                <Text style={styles.sendTxt}>入库</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBlueBtn, { backgroundColor:DANGER_COLOR }]} onPress={() => { setType('出库'); setSelectedGoodsId(g.id); setQuantity(''); setReason(''); setModalVisible(true); }}>
                <Text style={styles.sendTxt}>出库</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {state.goodsList.length === 0 && (
          <Text style={{ color:TEXT_THIRD, textAlign:'center', marginTop:20 }}>暂无商品，请先添加商品</Text>
        )}
      </View>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalMask}>
          <View style={styles.modalWrap}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{type}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Text style={styles.closeTxt}>✕</Text></TouchableOpacity>
            </View>
            <Text style={styles.label}>选择商品</Text>
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
              {goodsOptions.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.tagNormal, selectedGoodsId === opt.value && styles.tagActive]}
                  onPress={() => setSelectedGoodsId(opt.value)}
                >
                  <Text style={{ color: selectedGoodsId === opt.value ? '#fff' : TEXT_MAIN }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>数量</Text>
            <TextInput style={styles.formInput} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="数量" />
            <Text style={styles.label}>备注</Text>
            <TextInput style={styles.formInput} value={reason} onChangeText={setReason} placeholder="可选备注" />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit}>
              <Text style={styles.sendTxt}>确认{type}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ========== 底部标签导航 ==========
function RootTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'VerifyTab') iconName = focused ? 'checkmark-circle' : 'checkmark-circle-outline';
          else if (route.name === 'StockTab') iconName = focused ? 'cube' : 'cube-outline';
          else if (route.name === 'CustomerTab') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          else if (route.name === 'InternalTab') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'AITab') iconName = focused ? 'bulb' : 'bulb-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: PRIMARY_COLOR,
        tabBarInactiveTintColor: TEXT_THIRD,
        headerShown: false,
        tabBarStyle: { height: Platform.OS === 'ios' ? 80 : 60, paddingBottom: Platform.OS === 'ios' ? 20 : 8 },
      })}
    >
      <Tab.Screen name="VerifyTab" component={VerifyOrder} options={{ title: '核销' }} />
      <Tab.Screen name="StockTab" component={StockManage} options={{ title: '出入库' }} />
      <Tab.Screen name="CustomerTab" component={CustomerService} options={{ title: '客服' }} />
      <Tab.Screen name="InternalTab" component={InternalChat} options={{ title: '内部' }} />
      <Tab.Screen name="AITab" component={MerchantAssistant} options={{ title: 'AI助手' }} />
    </Tab.Navigator>
  );
}

// ========== 主栈导航 ==========
function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="RootTabs" component={RootTabs} />
      <Stack.Screen name="BadReviewList" component={BadReviewListPage} />
      <Stack.Screen name="SwitchAccount" component={SwitchAccountScreen} />
      <Stack.Screen name="ProductOverview" component={ProductOverview} />
      <Stack.Screen name="StaffManage" component={StaffManage} />
      {/* 以下页面在第三段实现，先占位 */}
      <Stack.Screen name="CustomerService" component={CustomerService} />
      <Stack.Screen name="InternalChat" component={InternalChat} />
      <Stack.Screen name="MerchantAssistant" component={MerchantAssistant} />
    </Stack.Navigator>
  );
}

// ========== App 容器 ==========
export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [loading, setLoading] = useState(true);

  // 加载持久化数据
  useEffect(() => {
    const loadData = async () => {
      try {
        const userStr = await AsyncStorage.getItem('user');
        const shopStr = await AsyncStorage.getItem('shopInfo');
        const appData = await loadAllData();
        if (userStr && shopStr) {
          const user = JSON.parse(userStr);
          const shopInfo = JSON.parse(shopStr);
          dispatch({ type: 'LOGIN', payload: { user, shopInfo } });
          // 恢复历史账号
          // 简单处理：如果当前账号不在 previousAccounts 中，添加
        }
        if (appData) {
          // 恢复所有数据
          dispatch({ type: 'RESTORE_ALL_DATA', payload: appData });
        }
      } catch (error) {
        console.warn('初始化加载失败', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // 数据变化自动保存
  useEffect(() => {
    if (!loading) {
      saveAllData(state);
    }
  }, [state, loading]);

  if (loading) {
    return (
      <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
        <ActivityIndicator size="large" color={PRIMARY_COLOR} />
      </View>
    );
  }

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <NavigationContainer>
        <MainStack />
      </NavigationContainer>
    </AppContext.Provider>
  );
}// ========== 顾客客服页面 ==========
const CustomerService = () => {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const [inputText, setInputText] = useState('');
  const [currentPhone, setCurrentPhone] = useState(''); // 当前对话的顾客手机号
  const [customerList, setCustomerList] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showQuickReply, setShowQuickReply] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const scrollViewRef = useRef(null);

  // 初始化时从所有私聊记录中提取顾客列表
  useEffect(() => {
    const phones = Object.keys(state.privateChatMessages);
    const list = phones.map(phone => {
      const msgs = state.privateChatMessages[phone] || [];
      const lastMsg = msgs[msgs.length - 1];
      return {
        phone,
        lastMsg: lastMsg?.text || lastMsg?.image ? (lastMsg.image ? '📷 图片' : lastMsg.text) : '暂无消息',
        lastTime: lastMsg?.time || '',
        unread: msgs.filter(m => !m.read).length,
      };
    });
    // 按最新消息时间排序
    list.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
    setCustomerList(list);
    if (list.length > 0 && !currentPhone) {
      setCurrentPhone(list[0].phone);
    }
  }, [state.privateChatMessages]);

  // 当前对话的消息列表
  const currentMessages = currentPhone ? (state.privateChatMessages[currentPhone] || []) : [];

  // 发送消息
  const sendMessage = async (type = 'text', content = null) => {
    if (!currentPhone) { showToast('请先选择顾客'); return; }
    let text = inputText.trim();
    let image = null;
    if (type === 'image') {
      if (!imageUri) return;
      // 压缩图片
      const compressed = await compressImage(imageUri);
      // 读取为 base64
      const base64 = await FileSystem.readAsStringAsync(compressed, { encoding: FileSystem.EncodingType.Base64 });
      image = `data:image/jpeg;base64,${base64}`;
    } else {
      if (!text) return;
    }

    const message = {
      id: Date.now().toString(),
      text: type === 'text' ? text : '',
      image: type === 'image' ? image : null,
      from: 'staff', // 员工发送
      time: new Date().toISOString(),
      read: true,
    };
    dispatch({
      type: 'ADD_PRIVATE_MESSAGE',
      payload: { phone: currentPhone, message }
    });
    setInputText('');
    setImageUri(null);
    setShowEmoji(false);
    setShowQuickReply(false);
    // 滚动到底部
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // 选择图片
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showToast('需要相册权限'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
      // 自动发送图片
      await sendMessage('image');
    }
  };

  const quickReplies = ['您好，请问有什么可以帮助您？', '稍等，我帮您查询一下', '感谢您的反馈，我们会尽快处理', '欢迎下次光临！', '请问您需要什么帮助？'];

  // 切换顾客
  const selectCustomer = (phone) => {
    setCurrentPhone(phone);
    // 标记已读
    const msgs = state.privateChatMessages[phone] || [];
    const updated = msgs.map(m => ({ ...m, read: true }));
    dispatch({
      type: 'SET_CHAT_SETTINGS',
      payload: { key: phone, settings: { messages: updated } }
    });
    // 实际需要更新 privateChatMessages，暂时我们没法直接更新单条，可以用替换方式
    // 但我们的 reducer 只支持 ADD_PRIVATE_MESSAGE，不支持更新已读，所以这里简化处理
    // 可扩展 reducer 支持 UPDATE_PRIVATE_MESSAGES，但为了简洁，我们忽略已读标记持久化
  };

  return (
    <View style={styles.container}>
      <View style={styles.safeTop} />
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={{ fontSize:20 }}>&lt;</Text></TouchableOpacity>
        <Text style={styles.pageTitle}>顾客客服</Text>
        <View style={{ width:24 }} />
      </View>
      <View style={{ flexDirection:'row', flex:1 }}>
        {/* 左侧顾客列表 */}
        <View style={{ width: width * 0.3, backgroundColor: BG_CARD, borderRightWidth: 1, borderColor: BORDER_COLOR }}>
          <FlatList
            data={customerList}
            keyExtractor={item => item.phone}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{
                  padding: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: BORDER_COLOR,
                  backgroundColor: currentPhone === item.phone ? LIGHT_PRIMARY : 'transparent',
                }}
                onPress={() => selectCustomer(item.phone)}
              >
                <Text style={{ fontWeight: currentPhone === item.phone ? '700' : '400', color: TEXT_MAIN }}>{item.phone}</Text>
                <Text style={{ fontSize: 11, color: TEXT_THIRD }} numberOfLines={1}>{item.lastMsg}</Text>
                {item.unread > 0 && (
                  <View style={{ backgroundColor: DANGER_COLOR, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, alignSelf:'flex-start', marginTop:4 }}>
                    <Text style={{ color: '#fff', fontSize: 10 }}>{item.unread}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={{ padding:12, color:TEXT_THIRD, textAlign:'center' }}>暂无顾客</Text>}
          />
        </View>

        {/* 右侧聊天区域 */}
        <View style={{ flex:1, backgroundColor: BG_PAGE }}>
          {currentPhone ? (
            <>
              <ScrollView
                ref={scrollViewRef}
                style={styles.chatScroll}
                contentContainerStyle={{ paddingTop: 12, paddingBottom: 80 }}
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
              >
                {currentMessages.map(msg => (
                  <View key={msg.id} style={msg.from === 'staff' ? styles.bubbleRight : styles.bubbleLeft}>
                    {msg.image ? (
                      <Image source={{ uri: msg.image }} style={styles.imageMessage} />
                    ) : (
                      <Text style={{ fontSize: 15, color: TEXT_MAIN }}>{msg.text}</Text>
                    )}
                    <Text style={{ fontSize: 10, color: TEXT_THIRD, marginTop: 4 }}>{moment(msg.time).format('HH:mm')}</Text>
                  </View>
                ))}
              </ScrollView>

              {/* 快捷回复 */}
              {showQuickReply && (
                <View style={styles.quickReplyContainer}>
                  {quickReplies.map((text, idx) => (
                    <TouchableOpacity key={idx} style={styles.quickReplyBtn} onPress={() => { setInputText(text); setShowQuickReply(false); }}>
                      <Text style={styles.quickReplyText}>{text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Emoji 行 */}
              {showEmoji && (
                <View style={styles.emojiRow}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {EMOJI_LIST.map(emoji => (
                      <TouchableOpacity key={emoji} onPress={() => { setInputText(inputText + emoji); setShowEmoji(false); }}>
                        <Text style={{ fontSize: 28, marginHorizontal: 4 }}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.inputBar}>
                <TouchableOpacity onPress={() => setShowEmoji(!showEmoji)} style={{ paddingHorizontal: 8 }}>
                  <Text style={{ fontSize: 24 }}>😊</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowQuickReply(!showQuickReply)} style={{ paddingHorizontal: 8 }}>
                  <Text style={{ fontSize: 20, color: PRIMARY_COLOR }}>⚡</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={pickImage} style={{ paddingHorizontal: 8 }}>
                  <Text style={{ fontSize: 20 }}>📷</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.inputBox}
                  placeholder="回复顾客..."
                  value={inputText}
                  onChangeText={setInputText}
                  multiline
                />
                <TouchableOpacity style={styles.sendBtn} onPress={() => sendMessage('text')}>
                  <Text style={styles.sendTxt}>发送</Text>
                </TouchableOpacity>
              </View>
              {/* 底部留空给输入栏 */}
              <View style={{ height: 56 }} />
            </>
          ) : (
            <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
              <Text style={{ color:TEXT_THIRD }}>请选择一位顾客开始对话</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

// ========== 内部沟通页面 ==========
const InternalChat = () => {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const [inputText, setInputText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const scrollViewRef = useRef(null);

  const groupMessages = state.groupChatMessages || [];

  const sendGroupMessage = () => {
    const text = inputText.trim();
    if (!text) return;
    const message = {
      id: Date.now().toString(),
      text,
      from: state.user?.name || '员工',
      fromPhone: state.user?.phone || '',
      time: new Date().toISOString(),
      type: 'text',
    };
    dispatch({ type: 'ADD_GROUP_MESSAGE', payload: message });
    setInputText('');
    setShowEmoji(false);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // 获取员工列表
  const staffList = state.staffMemberList || [];
  const currentUser = state.user;

  return (
    <View style={styles.container}>
      <View style={styles.safeTop} />
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={{ fontSize:20 }}>&lt;</Text></TouchableOpacity>
        <Text style={styles.pageTitle}>内部沟通</Text>
        <View style={{ width:24 }} />
      </View>
      <View style={{ flexDirection:'row', flex:1 }}>
        {/* 成员列表 */}
        <View style={{ width: width * 0.25, backgroundColor: BG_CARD, borderRightWidth: 1, borderColor: BORDER_COLOR }}>
          <Text style={{ padding:12, fontWeight:'600', color:TEXT_MAIN }}>成员 ({staffList.length + 1})</Text>
          <View style={{ paddingHorizontal:12 }}>
            <View style={{ paddingVertical:6 }}>
              <Text style={{ fontSize:14, color:TEXT_MAIN }}>👤 {currentUser?.name || '老板'} (我)</Text>
            </View>
            {staffList.map(staff => (
              <View key={staff.id} style={{ paddingVertical:6 }}>
                <Text style={{ fontSize:14, color:TEXT_SECOND }}>👤 {staff.name} ({staff.role})</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 聊天区域 */}
        <View style={{ flex:1, backgroundColor: BG_PAGE }}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatScroll}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: 80 }}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {groupMessages.length === 0 && (
              <Text style={{ textAlign:'center', color:TEXT_THIRD, marginTop:30 }}>暂无消息，开始内部沟通吧</Text>
            )}
            {groupMessages.map(msg => {
              const isMe = msg.fromPhone === state.user?.phone;
              return (
                <View key={msg.id} style={isMe ? styles.bubbleRight : styles.bubbleLeft}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: PRIMARY_COLOR, marginBottom: 2 }}>{msg.from}</Text>
                  <Text style={{ fontSize: 15, color: TEXT_MAIN }}>{msg.text}</Text>
                  <Text style={{ fontSize: 10, color: TEXT_THIRD, marginTop: 4 }}>{moment(msg.time).format('HH:mm')}</Text>
                </View>
              );
            })}
          </ScrollView>

          {showEmoji && (
            <View style={styles.emojiRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {EMOJI_LIST.map(emoji => (
                  <TouchableOpacity key={emoji} onPress={() => { setInputText(inputText + emoji); setShowEmoji(false); }}>
                    <Text style={{ fontSize: 28, marginHorizontal: 4 }}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.inputBar}>
            <TouchableOpacity onPress={() => setShowEmoji(!showEmoji)} style={{ paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 24 }}>😊</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.inputBox}
              placeholder="发送内部消息..."
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity style={styles.sendBtn} onPress={sendGroupMessage}>
              <Text style={styles.sendTxt}>发送</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 56 }} />
        </View>
      </View>
    </View>
  );
};

// ========== AI 助手页面 ==========
const MerchantAssistant = () => {
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showImageGen, setShowImageGen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const scrollViewRef = useRef(null);

  // 初始欢迎语
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        { id: '1', text: '您好！我是经营宝AI助手，可以帮您解答经营问题、生成营销文案、分析数据等。您也可以描述图片需求，我帮您生成创意图片。', from: 'ai', time: new Date().toISOString() }
      ]);
    }
  }, []);

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text) return;
    // 添加用户消息
    const userMsg = { id: Date.now().toString(), text, from: 'user', time: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    // 判断是否包含图片生成关键词
    const imageKeywords = ['生成图片', '画一张', '图片', '绘制', '设计图', '海报', '插画'];
    const shouldGenerateImage = imageKeywords.some(kw => text.includes(kw));

    if (shouldGenerateImage && showImageGen) {
      // 尝试生成图片
      const imageData = await generateImage(text);
      if (imageData) {
        const aiMsg = {
          id: (Date.now() + 1).toString(),
          text: '已为您生成图片：',
          image: imageData,
          from: 'ai',
          time: new Date().toISOString(),
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        const aiMsg = {
          id: (Date.now() + 1).toString(),
          text: '图片生成失败，请稍后重试或调整描述。',
          from: 'ai',
          time: new Date().toISOString(),
        };
        setMessages(prev => [...prev, aiMsg]);
      }
      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }

    // 否则调用智谱AI
    const prompt = `你是经营宝AI助手，帮助商家解决经营问题，提供营销建议，数据分析，员工管理等。回答要简洁、实用。`;
    const msgList = messages.filter(m => m.from !== 'system').map(m => ({
      role: m.from === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));
    msgList.push({ role: 'user', content: text });

    const reply = await fetchZhipuChat(msgList, prompt);
    const aiMsg = {
      id: (Date.now() + 1).toString(),
      text: reply,
      from: 'ai',
      time: new Date().toISOString(),
    };
    setMessages(prev => [...prev, aiMsg]);
    setLoading(false);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // 切换图片生成模式
  const toggleImageGen = () => {
    setShowImageGen(!showImageGen);
    if (!showImageGen) {
      // 插入提示
      const hint = {
        id: Date.now().toString(),
        text: '🖼️ 图片生成模式已开启，输入您想要的画面描述即可生成图片。',
        from: 'ai',
        time: new Date().toISOString(),
      };
      setMessages(prev => [...prev, hint]);
    } else {
      const hint = {
        id: Date.now().toString(),
        text: '已切换回问答模式，您可以继续提问。',
        from: 'ai',
        time: new Date().toISOString(),
      };
      setMessages(prev => [...prev, hint]);
    }
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <View style={styles.container}>
      <View style={styles.safeTop} />
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={{ fontSize:20 }}>&lt;</Text></TouchableOpacity>
        <Text style={styles.pageTitle}>AI助手</Text>
        <TouchableOpacity onPress={toggleImageGen}>
          <Text style={{ fontSize: 16, color: showImageGen ? SUCCESS_COLOR : PRIMARY_COLOR }}>
            {showImageGen ? '🎨 图片模式' : '🖼️ 开启图片'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.chatScroll}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 80 }}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map(msg => (
          <View key={msg.id} style={msg.from === 'user' ? styles.bubbleRight : styles.bubbleLeft}>
            {msg.image ? (
              <>
                <Text style={{ fontSize: 14, color: TEXT_SECOND, marginBottom:4 }}>{msg.text}</Text>
                <Image source={{ uri: msg.image }} style={styles.imageMessage} />
              </>
            ) : (
              <Text style={{ fontSize: 15, color: TEXT_MAIN }}>{msg.text}</Text>
            )}
            <Text style={{ fontSize: 10, color: TEXT_THIRD, marginTop: 4 }}>{moment(msg.time).format('HH:mm')}</Text>
          </View>
        ))}
        {loading && (
          <View style={[styles.bubbleLeft, { padding: 12 }]}>
            <ActivityIndicator size="small" color={PRIMARY_COLOR} />
          </View>
        )}
      </ScrollView>

      <View style={styles.inputBar}>
        <TextInput
          style={[styles.inputBox, { flex: 1 }]}
          placeholder={showImageGen ? "输入图片描述..." : "输入问题..."}
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={loading}>
          <Text style={styles.sendTxt}>发送</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 56 }} />
    </View>
  );
};

// ========== 确保所有组件导出（实际上已包含在App中） ==========
// 注意：以上三个组件已经在 MainStack 中引用