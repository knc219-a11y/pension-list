import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, writeBatch 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  Check, Trash2, Plus, RotateCcw, Tent, 
  Utensils, Carrot, Beer, Cookie, Package, LogOut, Users, Share2
} from 'lucide-react';

// ------------------------------------------------------------------
// [설정 영역]
// ------------------------------------------------------------------
let firebaseConfig;
let rawAppId;

if (typeof __firebase_config !== 'undefined') {
  // Canvas 미리보기 환경
  firebaseConfig = JSON.parse(__firebase_config);
  rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
} else {
  // --------------------------------------------------------------
  // [중요] 배포용 키 설정 (Firebase 콘솔에서 복사해오세요!)
  // --------------------------------------------------------------
  firebaseConfig = {
    apiKey: "AIzaSyDmeYtrCnQc_jCvLC7coYF3tkKN2vRRqwA",
    authDomain: "nckim-toechon-shopping-check.firebaseapp.com",
    projectId: "nckim-toechon-shopping-check",
    storageBucket: "nckim-toechon-shopping-check.firebasestorage.app",
    messagingSenderId: "343301946421",
    appId: "1:343301946421:web:b370a97d2e92a4d9c1857c",
    measurementId: "G-2N1RZTZ92B"
  };

  rawAppId = "pension-app-v1";
}

// [안전장치 1] ID에 특수문자(/)가 있으면 에러나므로 언더바(_)로 자동 교체
const appId = rawAppId.replace(/\//g, '_');

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Constants & Data ---
// [안전장치 2] 아이콘 렌더링 방식 변경 (에러 원인 해결)
const ClipboardIcon = ({ size }) => (
  <div style={{ width: size, height: size }} className="flex items-center justify-center text-base">📋</div>
);

const categories = [
  { id: 'all', name: '전체', icon: ClipboardIcon },
  { id: 'meat', name: '고기/구이', icon: Utensils },
  { id: 'veg', name: '채소/과일', icon: Carrot },
  { id: 'drink', name: '술/음료', icon: Beer },
  { id: 'snack', name: '간식/라면', icon: Cookie },
  { id: 'etc', name: '기타/일회용', icon: Package },
];

const defaultItems = [
  { text: '삼겹살/목살', category: 'meat', checked: false },
  { text: '소시지', category: 'meat', checked: false },
  { text: '쌈장/고추장', category: 'meat', checked: false },
  { text: '상추/깻잎', category: 'veg', checked: false },
  { text: '마늘/고추', category: 'veg', checked: false },
  { text: '버섯', category: 'veg', checked: false },
  { text: '소주/맥주', category: 'drink', checked: false },
  { text: '생수 (2L)', category: 'drink', checked: false },
  { text: '라면', category: 'snack', checked: false },
  { text: '햇반', category: 'snack', checked: false },
  { text: '과자', category: 'snack', checked: false },
  { text: '일회용 접시/컵', category: 'etc', checked: false },
  { text: '나무젓가락', category: 'etc', checked: false },
  { text: '휴지/물티슈', category: 'etc', checked: false },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [roomCode, setRoomCode] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // UI State
  const [activeCategory, setActiveCategory] = useState('all');
  const [newItemText, setNewItemText] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);

  // --- Auth Setup ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth failed", error);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      const lastRoom = localStorage.getItem('last-pension-room');
      if (lastRoom && !isJoined) {
        setInputRoomCode(lastRoom);
      }
    });
    return () => unsubscribe();
  }, [isJoined]);

  // --- Firestore Sync ---
  // [안전장치 3] 데이터베이스 경로 자동 관리 함수
  const getCollectionRef = () => {
      const isCanvas = typeof __firebase_config !== 'undefined';
      // 방 이름에도 특수문자가 들어오면 자동 치환
      const safeRoomCode = roomCode.replace(/\//g, '_');
      const safeCollectionName = `pension_list_${safeRoomCode}`;
      
      if (isCanvas) {
          // Canvas 내부 경로
          return collection(db, 'artifacts', appId, 'public', 'data', safeCollectionName);
      } else {
          // 배포 환경 경로
          return collection(db, safeCollectionName);
      }
  };

  useEffect(() => {
    if (!user || !isJoined || !roomCode) return;

    setLoading(true);
    const collectionRef = getCollectionRef();
    const q = query(collectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      if (snapshot.empty && !initializing) {
        populateDefaults(collectionRef);
      } else {
        fetchedItems.sort((a, b) => {
            if (a.checked === b.checked) return a.created - b.created;
            return a.checked ? 1 : -1;
        });
        setItems(fetchedItems);
      }
      setLoading(false);
      setInitializing(false);
    }, (error) => {
      console.error("Data fetch error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, isJoined, roomCode]);

  // --- Actions ---
  const populateDefaults = async (colRef) => {
    const batch = writeBatch(db);
    defaultItems.forEach(item => {
      const docRef = doc(colRef);
      batch.set(docRef, { ...item, created: Date.now() });
    });
    await batch.commit();
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    const code = inputRoomCode.trim();
    if (!code) return;
    setRoomCode(code);
    setIsJoined(true);
    setInitializing(false);
    localStorage.setItem('last-pension-room', code);
  };

  const handleLeaveRoom = () => {
    if (window.confirm('방에서 나갈까요?')) {
      setIsJoined(false);
      setRoomCode('');
      setItems([]);
      setInitializing(true);
      localStorage.removeItem('last-pension-room');
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItemText.trim()) return;
    const categoryToUse = activeCategory === 'all' ? 'etc' : activeCategory;
    
    try {
      await addDoc(getCollectionRef(), {
        text: newItemText,
        category: categoryToUse,
        checked: false,
        created: Date.now()
      });
      setNewItemText('');
    } catch (err) {
      console.error("Add failed", err);
    }
  };

  const handleToggle = async (id, currentStatus) => {
    const colRef = getCollectionRef();
    const docRef = doc(colRef, id);
    try {
      await updateDoc(docRef, { checked: !currentStatus });
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('정말 삭제할까요?')) return;
    const colRef = getCollectionRef();
    try {
      await deleteDoc(doc(colRef, id));
    } catch (err) { console.error(err); }
  };

  const handleReset = async () => {
    if (!window.confirm('초기화할까요?')) return;
    const colRef = getCollectionRef();
    const batch = writeBatch(db);
    items.forEach(item => batch.delete(doc(colRef, item.id)));
    defaultItems.forEach(item => {
        const docRef = doc(colRef);
        batch.set(docRef, { ...item, created: Date.now() });
    });
    await batch.commit();
  };

  const handleShare = () => {
    const text = `🏕️ 펜션 장보기 - 방 이름: [${roomCode}]`;
    if (navigator.share) {
      navigator.share({ title: '장보기 같이해요', text: text, url: window.location.href });
    } else {
      navigator.clipboard.writeText(text);
      alert('복사되었습니다!');
    }
  };

  const filteredItems = activeCategory === 'all' ? items : items.filter(item => item.category === activeCategory);
  const checkedCount = items.filter(i => i.checked).length;
  const progress = items.length === 0 ? 0 : (checkedCount / items.length) * 100;

  // --- Views ---
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center p-4 font-sans">
        <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Tent className="text-teal-600 w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">같이 장보기</h1>
          <p className="text-gray-500 mb-8 text-sm">친구들과 같은 방 이름을 입력하면<br/>실시간으로 목록을 공유할 수 있어요.</p>
          <form onSubmit={handleJoinRoom} className="space-y-4">
            <input 
              type="text" 
              value={inputRoomCode}
              onChange={(e) => setInputRoomCode(e.target.value)}
              placeholder="방 이름 (예: 가평101)" 
              className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-teal-500 focus:bg-white focus:outline-none transition-all text-center text-lg font-bold text-gray-700 placeholder:font-normal"
            />
            <button 
              type="submit" 
              disabled={!inputRoomCode.trim()}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-teal-200 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Users size={20} /> 입장하기
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex justify-center items-start font-sans text-gray-800">
      <div className="w-full max-w-md bg-white min-h-screen shadow-xl relative pb-32">
        <div className="bg-teal-600 p-6 text-white rounded-b-3xl shadow-lg sticky top-0 z-20">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="flex items-center gap-2 text-teal-100 text-sm mb-1 cursor-pointer hover:underline" onClick={handleShare}>
                 <span className="bg-teal-700/50 px-2 py-0.5 rounded flex items-center gap-1">{roomCode} <Share2 size={12}/></span>
              </div>
              <h1 className="text-2xl font-bold flex items-center gap-2"><span>🏕️</span> 펜션 장보기</h1>
            </div>
            <button onClick={handleLeaveRoom} className="p-2 bg-teal-700/50 rounded-full hover:bg-teal-700 transition"><LogOut size={18} /></button>
          </div>
          <div className="relative pt-1">
            <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-teal-800/50">
              <div style={{ width: `${progress}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-yellow-400 transition-all duration-500"></div>
            </div>
            <div className="flex justify-end gap-2">
                <button onClick={handleReset} className="text-[10px] bg-teal-800/30 px-2 py-1 rounded text-teal-200 hover:bg-red-500/20 hover:text-white transition flex items-center gap-1"><RotateCcw size={10} /> 초기화</button>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 overflow-x-auto whitespace-nowrap scrollbar-hide bg-white/95 backdrop-blur-sm border-b sticky top-[150px] z-10">
          <div className="flex space-x-2">
            {categories.map(cat => {
              // [안전장치 4] 여기서 컴포넌트로 변환하여 그리기
              const IconComponent = cat.icon;
              return (
                <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all transform active:scale-95 flex items-center gap-2 ${activeCategory === cat.id ? 'bg-teal-600 text-white shadow-md shadow-teal-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  <IconComponent size={18} />
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 space-y-3 min-h-[300px]">
          {loading ? <div className="text-center py-20 text-gray-400">불러오는 중...</div> : filteredItems.length === 0 ? (
            <div className="text-center py-20 text-gray-400 flex flex-col items-center"><span className="text-4xl mb-4 opacity-50">🛒</span><p>비어있어요</p></div>
          ) : (
            filteredItems.map(item => (
              <div key={item.id} className={`flex items-center p-3 rounded-xl border transition-all duration-300 ${item.checked ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200 shadow-sm'}`}>
                <button onClick={() => handleToggle(item.id, item.checked)} className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center mr-3 transition-colors ${item.checked ? 'bg-teal-500 border-teal-500 text-white' : 'border-gray-300 hover:border-teal-500'}`}>{item.checked && <Check size={16} />}</button>
                <span onClick={() => handleToggle(item.id, item.checked)} className={`flex-grow text-lg cursor-pointer ${item.checked ? 'line-through text-gray-400' : 'text-gray-800 font-medium'}`}>{item.text}</span>
                <button onClick={() => handleDelete(item.id)} className="p-2 text-gray-300 hover:text-red-500"><Trash2 size={18} /></button>
              </div>
            ))
          )}
        </div>

        <div className={`fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t z-20`}>
          <div className="max-w-md mx-auto">
            <form onSubmit={handleAddItem} className="flex gap-2 relative items-center">
              <input type="text" value={newItemText} onChange={(e) => setNewItemText(e.target.value)} onFocus={() => setIsInputFocused(true)} onBlur={() => setIsInputFocused(false)} placeholder="아이템 추가..." className="flex-grow pl-5 pr-4 py-3 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <button type="submit" disabled={!newItemText.trim()} className="bg-teal-600 text-white h-[50px] w-[50px] rounded-full shadow-lg hover:bg-teal-700 flex items-center justify-center flex-shrink-0"><Plus size={24} /></button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}