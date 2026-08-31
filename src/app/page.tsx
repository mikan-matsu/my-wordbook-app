// 【クライアントコンポーネント】React Hooksを使用するため"use client"が必須
"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getCurrentUser, signInWithRedirect, signOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import type { Schema } from "../../amplify/data/resource";
import { motion, AnimatePresence, Variants } from "framer-motion";
import outputs from "../../amplify_outputs.json";

// 【カード・アニメーション設定】前後の方向に応じてカードがスライドインして表示される
const cardVariants: Variants = {
  enter: (direction: number) => ({
    // 右方向(next)なら右から左へ、左方向(prev)なら左から右へ進入
    x: direction > 0 ? "20%" : "-20%",
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 }, // 中央に配置して完全表示
  exit: (direction: number) => ({
    // 方向に応じて反対方向に退出
    x: direction > 0 ? "-20%" : "20%",
    opacity: 0,
  }),
};

// 【カテゴリ一覧】"すべて"は絞り込み解除を表す特別値
const CATEGORIES = ["すべて", "基本用語", "ネットワーク用語", "コンピューティング", "セキュリティ関連"];

// 【広告設定】未設定の場合はプレースホルダーを表示する
const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
const ADSENSE_SLOT_ID = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;

export default function Home() {
  // 【状態管理】
  const [allWords, setAllWords] = useState<any[]>([]); // すべての単語データ
  const [isLoaded, setIsLoaded] = useState(false); // データ取得完了フラグ
  const [currentIndex, setCurrentIndex] = useState(0); // 現在表示中の単語のインデックス
  const [isFlipped, setIsFlipped] = useState(false); // カード表示状態（表面:false/裏面:true）
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // サイドバーの開閉状態
  const [selectedCategory, setSelectedCategory] = useState<string>("すべて"); // 選択中のカテゴリ
  const [[page, direction], setPage] = useState([0, 0]); // ページ遷移の方向を記録（アニメーション用）
  const isTransitioning = useRef(false); // アニメーション実行中フラグ（重複アクション防止）

  // 【ログイン状態管理】
  const [authUser, setAuthUser] = useState<{ username: string; email?: string } | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const checkCurrentUser = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      setAuthUser({ username: user.username, email: user.signInDetails?.loginId });
    } catch {
      setAuthUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    checkCurrentUser();
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn" || payload.event === "signedOut") {
        checkCurrentUser();
      }
    });
    return unsubscribe;
  }, [checkCurrentUser]);

  const handleGoogleLogin = useCallback(() => {
    signInWithRedirect({ provider: "Google" });
  }, []);

  const handleLogout = useCallback(() => {
    signOut();
  }, []);

  // 【学習進捗管理】ログインユーザーの「覚えた」状態（wordId -> WordProgress）
  const [progressMap, setProgressMap] = useState<Record<string, { id: string; learned: boolean }>>({});

  useEffect(() => {
    if (!authUser) {
      setProgressMap({});
      return;
    }
    const fetchProgress = async () => {
      try {
        const client = generateClient<Schema>();
        let items: any[] = [];
        let cursor: string | null | undefined = undefined;
        do {
          const result: any = await client.models.WordProgress.list({ limit: 1000, nextToken: cursor });
          if (result.errors) console.error("GraphQL errors:", result.errors);
          items = items.concat(result.data || []);
          cursor = result.nextToken;
        } while (cursor);
        const map: Record<string, { id: string; learned: boolean }> = {};
        for (const item of items) {
          map[item.wordId] = { id: item.id, learned: item.learned };
        }
        setProgressMap(map);
      } catch (e) {
        console.error("進捗取得エラー:", e);
      }
    };
    fetchProgress();
  }, [authUser]);

  const handleToggleLearned = useCallback(async (wordId: string) => {
    if (!authUser) return;
    const client = generateClient<Schema>();
    const existing = progressMap[wordId];
    const nextLearned = !existing?.learned;
    try {
      if (existing) {
        await client.models.WordProgress.update({ id: existing.id, wordId, learned: nextLearned });
        setProgressMap((prev) => ({ ...prev, [wordId]: { id: existing.id, learned: nextLearned } }));
      } else {
        const newId = `${wordId}_${authUser.username}`;
        await client.models.WordProgress.create({ id: newId, wordId, learned: nextLearned });
        setProgressMap((prev) => ({ ...prev, [wordId]: { id: newId, learned: nextLearned } }));
      }
    } catch (e) {
      console.error("進捗更新エラー:", e);
    }
  }, [authUser, progressMap]);
  
  // 【サイドバースワイプ検出】
  const sidebarTouchStartRef = useRef<number>(0); // スワイプ開始位置
  const handleSidebarTouchStart = useCallback((e: React.TouchEvent) => {
    sidebarTouchStartRef.current = e.touches[0].clientX;
  }, []);

  const handleSidebarTouchEnd = useCallback((e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchStartX = sidebarTouchStartRef.current;
    const swipeDistance = touchStartX - touchEndX; // 右方向の移動距離（正数 = 左へのスワイプ）
    
    // 左方向へのスワイプ（50px以上）でサイドバーを閉じる
    if (swipeDistance > 50) {
      setIsSidebarOpen(false);
    }
  }, []);

  // 【初期化】Amplify Dataクライアントでwordテーブルから単語データを取得
  useEffect(() => {
    const fetchWords = async () => {
      try {
        Amplify.configure(outputs, { ssr: true });
        const client = generateClient<Schema>();

        // 【全件取得】nextTokenがある限りページングして全単語を取得する
        let items: any[] = [];
        let cursor: string | null | undefined = undefined;
        do {
          const result: any = await client.models.Word.list({
            filter: {
              or: [
                { del_flg: { ne: 1 } },
                { del_flg: { attributeExists: false } }
              ]
            },
            limit: 1000,
            nextToken: cursor,
          });
          if (result.errors) console.error("GraphQL errors:", result.errors);
          items = items.concat(result.data || []);
          cursor = result.nextToken;
        } while (cursor);

        // 取得したデータをマッピング：hiddenステータスの単語は非表示フラグを設定
        const fetched = (items || []).map((w: any) => ({
          ...w,
          isVisible: w.status !== "hidden"
        }))
        // IDでソート（昇順）
        .sort((a: any, b: any) => {
          const idA = parseInt(a.id) || 0;
          const idB = parseInt(b.id) || 0;
          return idA - idB;
        });

        setAllWords(fetched);
      } catch (e) {
        console.error("エラー詳細:", e);
      } finally {
        // データ取得が終わったら、0件でも必ずLoadingを抜ける
        setIsLoaded(true);
      }
    };
    fetchWords();
  }, []);

  // 【フィルター】hiddenステータス以外・選択中カテゴリの単語のみを抽出（学習対象の単語リスト）
  const visibleWords = useMemo(
    () => allWords.filter(w => w.isVisible && (selectedCategory === "すべて" || w.category === selectedCategory)),
    [allWords, selectedCategory]
  );

  // 【カテゴリ切り替え】絞り込みが変わったら表示位置を先頭に戻す
  useEffect(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [selectedCategory]);

  // 【次の単語へ移動】表面と裏面の切り替えと単語の進行を管理
  const handleNext = useCallback(() => {
    // アニメーション中または単語が無い場合は処理中止
    if (isTransitioning.current || visibleWords.length === 0) return;
    // 表面が表示されている場合：裏面を表示する
    if (!isFlipped) {
      setIsFlipped(true);
    } else {
      // 裏面が表示されている場合：次の単語へ進む
      isTransitioning.current = true;
      setCurrentIndex((prev) => (prev + 1) % visibleWords.length);
      setPage([page + 1, 1]); // 右方向への遷移を記録
      setIsFlipped(false); // 新しい単語の表面を表示
      // アニメーション完了後にフラグを解除（300ms = アニメーション時間）
      setTimeout(() => { isTransitioning.current = false; }, 300);
    }
  }, [isFlipped, visibleWords.length, page]);

  // 【前の単語へ移動】handleNextの逆方向処理
  const handlePrev = useCallback(() => {
    if (isTransitioning.current || visibleWords.length === 0) return;
    // 裏面が表示されている場合：表面を表示する
    if (isFlipped) {
      setIsFlipped(false);
    } else {
      // 表面が表示されている場合：前の単語へ進む
      isTransitioning.current = true;
      setCurrentIndex((prev) => (prev - 1 + visibleWords.length) % visibleWords.length);
      setPage([page - 1, -1]); // 左方向への遷移を記録
      setIsFlipped(true); // 新しい単語の裏面を表示
      setTimeout(() => { isTransitioning.current = false; }, 300);
    }
  }, [isFlipped, visibleWords.length, page]);

  // 【広告表示】AdSense設定済みの場合、単語切り替え時に広告ユニットを更新
  const isAdEnabled = Boolean(ADSENSE_CLIENT_ID && ADSENSE_SLOT_ID);
  useEffect(() => {
    if (!isAdEnabled) return;
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (e) {
      console.error("AdSense読み込みエラー:", e);
    }
  }, [isAdEnabled]);

  // 【キーボード操作】矢印キーとスペースキーでカード操作
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 右矢印キー or スペースキー：次へ進む
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); handleNext(); }
      // 左矢印キー：前へ戻る
      if (e.key === "ArrowLeft") { e.preventDefault(); handlePrev(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev]);

  // 【スワイプ判定】ドラッグ終了時に距離と速度から次/前の単語へ移動するか判定
  const handleDragEnd = useCallback((event: any, info: any) => {
    const swipeThreshold = 50; // スワイプと判定する最小距離（ピクセル）
    const velocityThreshold = 500; // スワイプと判定する最小速度
    
    // 右方向へのスワイプ（前の単語へ）
    if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
      handlePrev();
    }
    // 左方向へのスワイプ（次の単語へ）
    else if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
      handleNext();
    }
  }, [handleNext, handlePrev]);

  // 【初期化チェック】データ取得中はローディング表示
  if (!isLoaded) return (
    <div className="fixed inset-0 bg-slate-50 flex items-center justify-center font-sans text-slate-900">
      <div className="text-center">
        <div className="text-4xl font-bold text-blue-400 mb-4">AWS WordCard</div>
        <div className="text-slate-400">Loading...</div>
      </div>
    </div>
  );

  // 【データなし表示】取得完了後も0件の場合
  if (isLoaded && allWords.length === 0) return (
    <div className="fixed inset-0 bg-slate-50 flex items-center justify-center font-sans text-slate-900">
      <div className="text-center px-6">
        <div className="text-4xl font-bold text-blue-400 mb-4">AWS WordCard</div>
        <div className="text-slate-600 leading-relaxed">
          <p className="mb-2">表示できる単語がありません。</p>
          <p className="text-sm text-slate-400">DynamoDBのテーブル名と中身を確認してください。</p>
        </div>
      </div>
    </div>
  );
  // 現在表示する単語を決定（表示用インデックス優先、フォールバック用）
  const word = visibleWords[currentIndex] || visibleWords[0];
  // 単語データが存在しない場合は表示しない
  if (!word) return null;

  // 【表示番号の計算】選択中カテゴリの絞り込みリストでの位置を表示
  const realNumber = currentIndex + 1;

  return (
    <div className="fixed inset-0 bg-slate-50 flex overflow-hidden font-sans text-slate-900">
      {/* 【オーバーレイ】モバイル版：サイドバー表示時の背景を暗くする */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-[450] md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* 【メニューボタン】ハンバーガーメニュー：z-indexを[700]に設定して最前面に配置 */}
      <div className="fixed top-8 left-4 z-[700]">
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-3 bg-white shadow-xl rounded-2xl text-slate-600 active:scale-95 transition-transform">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* 【ログインボタン】未ログイン時はGoogleログイン、ログイン時はメールアドレスとログアウトボタンを表示 */}
      <div className="fixed top-8 right-4 z-[700] flex flex-col items-end gap-1.5">
        {!isAuthLoading && (
          authUser ? (
            <div className="flex items-center gap-2 bg-white shadow-xl rounded-2xl px-3 py-2">
              <span className="text-xs font-bold text-slate-500 max-w-[120px] truncate hidden sm:inline">{authUser.email || authUser.username}</span>
              <button onClick={handleLogout} className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-black active:scale-95 transition-transform">
                ログアウト
              </button>
            </div>
          ) : (
            <>
              <button onClick={handleGoogleLogin} className="flex items-center gap-2.5 bg-[#4285F4] hover:bg-[#3367d6] shadow-xl rounded-2xl px-5 py-3.5 text-white text-sm font-black active:scale-95 transition-all">
                <span className="bg-white rounded-full p-1 flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </span>
                <span className="hidden sm:inline">Googleでログイン</span>
              </button>
              <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap select-none hidden sm:block">
                ログインで進捗保存
              </span>
            </>
          )
        )}
      </div>

      {/* 【サイドバー】全単語リストを表示、選択した単語へ移動 */}
      <aside 
        className={`h-full bg-white border-r border-slate-200 transition-all duration-300 z-[500] flex-shrink-0 overflow-hidden fixed md:relative ${isSidebarOpen ? "w-[280px]" : "w-0"}`}
        onTouchStart={handleSidebarTouchStart}
        onTouchEnd={handleSidebarTouchEnd}
      >
        <div className="w-[280px] h-full flex flex-col">
          {/* サイドバーヘッダー */}
          <div className="mt-20 px-6 py-4 border-b border-slate-50">
            <h2 className="text-slate-400 text-xs font-black tracking-widest uppercase truncate">単語リスト</h2>
          </div>
          {/* カテゴリフィルター */}
          <div className="px-3 py-3 border-b border-slate-50 flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${selectedCategory === cat ? "bg-blue-400 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                {cat}
              </button>
            ))}
          </div>
          {/* 単語一覧のスクロール領域 */}
          <nav className="flex-1 overflow-y-auto p-3 custom-scrollbar">
            {visibleWords.map((w, idx) => (
              <div key={w.id} className={`flex items-center rounded-xl mb-1 border transition-all ${(word?.id === w.id) ? "bg-blue-50 border-blue-200" : "bg-transparent border-transparent"}`}>
                {/* 単語ボタン：クリックで該当単語へジャンプ */}
                <button onClick={() => { setCurrentIndex(idx); setIsFlipped(false); }} className="flex-1 text-left px-4 py-3 text-sm truncate font-bold text-slate-700 flex items-center gap-2">
                  <span className="opacity-30 font-mono text-xs">{idx + 1}</span>
                  <span className="flex-1 truncate">{w.word}</span>
                  {progressMap[w.id]?.learned && (
                    <span className="text-emerald-500 flex-shrink-0" title="覚えた">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                  )}
                </button>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* 【メインエリア】カード表示と操作エリア */}
      <main className="fixed inset-0 md:relative md:inset-auto md:flex-1 bg-blue-50/30 flex items-center justify-center p-4 overflow-hidden transition-all duration-300">
        
        {/* 【アプリタイトル】カード領域内で中央配置 */}
        <div className="absolute top-8 left-1/2 z-[200] flex flex-col items-center transition-all duration-300 transform -translate-x-1/2 pointer-events-none">
          <h1 className={`font-extrabold tracking-wide select-none flex items-center gap-3 text-blue-400 transition-all duration-300 whitespace-nowrap text-xl sm:text-2xl h-12 ${isSidebarOpen ? 'md:text-3xl' : 'md:text-4xl'}`} style={{ fontFamily: "'Noto Serif JP', 'Zen Old Mincho', 'Georgia', serif", fontWeight: 600, letterSpacing: '0.02em' }}>
            AWS WordCard
          </h1>
          {/* 【絞り込み中カテゴリ表示】「すべて」以外を選択中のみ表示 */}
          {selectedCategory !== "すべて" && (
            <span className="mt-1 px-3 py-1 rounded-full bg-blue-100 text-blue-500 text-[10px] font-black tracking-widest select-none whitespace-nowrap">
              {selectedCategory} で絞り込み中
            </span>
          )}
        </div>
        
        {/* 【カード表示エリア】フリップアニメーション付きカード */}
        <div className="relative w-full max-w-5xl h-[75vh] z-[100]">
          {/* AnimatePresence：カード遷移時のアニメーション制御 */}
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            {/* カード：cardVariantsの定義に従ってスライドアニメーション + スワイプ対応 */}
            <motion.div
              key={word.id}
              custom={direction}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ x: { type: "spring", stiffness: 90000, damping: 500 }, opacity: { duration: 0.2 } }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              className="w-full h-full"
            >
              {/* 【3Dカード】perspective設定でY軸回転により表裏が切り替わる */}
              <div 
                className="relative w-full h-full shadow-[0_40px_80px_rgba(0,0,0,0.08)] rounded-[3rem] bg-white transition-transform duration-90 ease-out" 
                style={{ transformStyle: "preserve-3d", transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
              >
                {/* カード表面 */}
                <div className="absolute inset-0 backface-hidden flex flex-col rounded-[3rem] bg-white" style={{ backfaceVisibility: "hidden" }}>
                  {/* 背景番号 */}
                  <div className="absolute top-10 left-12 font-black text-6xl md:text-8xl italic text-slate-300 select-none pointer-events-none">#{realNumber}</div>
                  
                  {/* 左右判定レイヤー */}
                  <div className="absolute inset-0 flex">
                    <div className="w-[50%] cursor-w-resize group flex items-center justify-start pl-2" onClick={handlePrev}>
                      <div className="p-4 bg-white/80 backdrop-blur shadow-2xl rounded-full text-slate-600 opacity-0 md:opacity-85 md:group-hover:text-slate-700 md:group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                      </div>
                    </div>
                    <div className="w-[50%] cursor-e-resize group flex items-center justify-end pr-2" onClick={handleNext}>
                      <div className="p-4 bg-white/80 backdrop-blur shadow-2xl rounded-full text-slate-600 opacity-0 md:opacity-85 md:group-hover:text-slate-700 md:group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* 中央に単語を表示 */}
                  <div className="flex-1 flex flex-col items-center justify-center px-12 text-center pointer-events-none">
                    <h1 className="font-black text-slate-900 leading-none tracking-tighter select-none" style={{ fontSize: 'clamp(2rem, 8vw, 5rem)' }}>{word.word}</h1>
                  </div>

                  {/* 【覚えた/まだトグル】ログイン時のみ表示 */}
                  {authUser && (
                    <div className="absolute top-10 right-12 z-[300] pointer-events-auto">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleLearned(word.id); }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-black shadow transition-all active:scale-95 ${progressMap[word.id]?.learned ? "bg-emerald-400 text-white" : "bg-slate-100 text-slate-500"}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        {progressMap[word.id]?.learned ? "覚えた" : "まだ"}
                      </button>
                    </div>
                  )}
                  {/* 進捗表示 */}
                  <div className="absolute bottom-10 w-full pointer-events-none">
                    {/* PC版：テキストのみ */}
                    <div className="hidden md:block text-center text-slate-400 font-black text-[10px] tracking-widest opacity-80 select-none">
                      {currentIndex + 1}{'/'}{visibleWords.length} 表
                    </div>
                    {/* スマホ版：矢印付き */}
                    <div className="md:hidden flex items-center justify-center gap-4 pointer-events-auto">
                      <button onClick={handlePrev} className="w-11 h-11 flex items-center justify-center group">
                        <span className="inline-flex p-2 bg-white/80 backdrop-blur shadow-2xl rounded-full text-slate-600 opacity-85 group-hover:text-slate-700 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                          </svg>
                        </span>
                      </button>
                      <span className="text-slate-400 font-black text-[10px] tracking-widest opacity-80 select-none">
                        {currentIndex + 1}{'/'}{visibleWords.length} 表
                      </span>
                      <button onClick={handleNext} className="w-11 h-11 flex items-center justify-center group">
                        <span className="inline-flex p-2 bg-white/80 backdrop-blur shadow-2xl rounded-full text-slate-600 opacity-85 group-hover:text-slate-700 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                          </svg>
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* カード裏面 */}
                <div className="absolute inset-0 flex flex-col rounded-[3rem] bg-white overflow-hidden shadow-inner" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                  {/* 背景番号 */}
                  <div className="absolute top-10 left-12 font-black text-6xl md:text-8xl italic text-slate-300 select-none">#{realNumber}</div>

                  {/* 【覚えた/まだトグル】ログイン時のみ表示 */}
                  {authUser && (
                    <div className="absolute top-10 right-12 z-[300] pointer-events-auto">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleLearned(word.id); }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-black shadow transition-all active:scale-95 ${progressMap[word.id]?.learned ? "bg-emerald-400 text-white" : "bg-slate-100 text-slate-500"}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        {progressMap[word.id]?.learned ? "覚えた" : "まだ"}
                      </button>
                    </div>
                  )}

                  {/* コンテンツエリア */}
                  <div className="relative flex flex-col h-full px-8 md:px-20 pt-28 pb-24">
                    {/* ヘッダー */}
                    <div className="relative text-center mb-6 flex-shrink-0 pointer-events-none">
                      <p className="text-slate-400 text-[10px] font-black tracking-widest uppercase mb-2 select-none">{word.word}</p>
                      <h2
                        className="font-black text-blue-600 leading-tight select-none text-balance"
                        style={{ fontSize: word.meaning.length > 20 ? "clamp(1.25rem, 4.5vw, 2.5rem)" : "clamp(1.5rem, 6vw, 3rem)", wordBreak: "auto-phrase" } as React.CSSProperties}
                      >
                        {word.meaning}
                      </h2>
                    </div>

                    {/* 左右判定レイヤー（ヘッダーと下部の統合） */}
                    <div className="absolute inset-x-0 top-0 bottom-0 flex pointer-events-none" style={{ top: '0', bottom: '0' }}>
                      <div className="w-[50%] cursor-w-resize group flex items-center justify-start pl-2 pointer-events-auto" onClick={handlePrev}>
                        <div className="p-4 bg-white/80 backdrop-blur shadow-2xl rounded-full text-slate-600 opacity-0 md:opacity-85 md:group-hover:text-slate-700 md:group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                          </svg>
                        </div>
                      </div>
                      <div className="w-[50%] cursor-e-resize group flex items-center justify-end pr-2 pointer-events-auto" onClick={handleNext}>
                        <div className="p-4 bg-white/80 backdrop-blur shadow-2xl rounded-full text-slate-600 opacity-0 md:opacity-85 md:group-hover:text-slate-700 md:group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* スクロールエリア */}
                    <div 
                      className="scrollable-bg relative flex-1 overflow-y-auto pr-2 custom-scrollbar border-t border-slate-50 pt-8 space-y-6 pointer-events-auto"
                      style={{ zIndex: 1000, touchAction: "pan-y" }}
                    >
                      {/* 詳細説明 */}
                      {word.description && (
                        <div className="px-2">
                          <span className="text-slate-400 font-black text-[10px] tracking-widest block mb-3 select-none">詳細</span>
                          <p className="text-sm md:text-base text-slate-700 font-bold leading-relaxed whitespace-pre-wrap">{word.description}</p>
                        </div>
                      )}
                    </div>
                    
                  </div>

                  {/* 進捗表示 */}
                  <div className="absolute bottom-10 w-full pointer-events-none">
                    {/* PC版：テキストのみ */}
                    <div className="hidden md:block text-center text-slate-400 font-black text-[10px] tracking-widest opacity-80 select-none">
                      {currentIndex + 1}{'/'}{visibleWords.length} 裏
                    </div>
                    {/* スマホ版：矢印付き */}
                    <div className="md:hidden flex items-center justify-center gap-4 pointer-events-auto">
                      <button onClick={handlePrev} className="w-11 h-11 flex items-center justify-center group">
                        <span className="inline-flex p-2 bg-white/80 backdrop-blur shadow-2xl rounded-full text-slate-600 opacity-85 group-hover:text-slate-700 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                          </svg>
                        </span>
                      </button>
                      <span className="text-slate-400 font-black text-[10px] tracking-widest opacity-80 select-none">
                        {currentIndex + 1}{'/'}{visibleWords.length} 裏
                      </span>
                      <button onClick={handleNext} className="w-11 h-11 flex items-center justify-center group">
                        <span className="inline-flex p-2 bg-white/80 backdrop-blur shadow-2xl rounded-full text-slate-600 opacity-85 group-hover:text-slate-700 group-hover:opacity-100 transition-all duration-300 transform group-hover:scale-110">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                          </svg>
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 広告スペース：AdSense未設定時はプレースホルダーを表示 */}
        <div className="absolute bottom-4 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-full md:max-w-5xl h-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center z-[100] overflow-hidden">
          {isAdEnabled ? (
            <ins
              className="adsbygoogle"
              style={{ display: "block", width: "100%", height: "100%" }}
              data-ad-client={ADSENSE_CLIENT_ID}
              data-ad-slot={ADSENSE_SLOT_ID}
              data-ad-format="auto"
              data-full-width-responsive="true"
            />
          ) : (
            <span className="text-slate-300 text-[10px] font-black tracking-widest select-none">広告スペース</span>
          )}
        </div>

        {/* カード外の判定レイヤー */}
        <div className="absolute inset-0 flex pointer-events-none z-[10]" style={{ height: '100vh' }}>
          {/* 左操作エリア */}
          <div 
            className="w-[50%] pointer-events-auto cursor-w-resize" 
            onClick={handlePrev}
          />
          
          {/* 右操作エリア */}
          <div 
            className="w-[50%] pointer-events-auto cursor-e-resize" 
            onClick={handleNext}
          />
        </div>
      </main>

      {/* グローバルスタイル */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .scrollable-bg {
          background: rgba(147, 197, 253, 0.10);
          border-radius: 1.5rem;
          padding: 1rem;
          transition: background 0.2s;
        }
        .scrollable-bg:hover, .scrollable-bg:focus-within {
          background: rgba(147, 197, 253, 0.15);
        }
      `}</style>
    </div>
  );
}