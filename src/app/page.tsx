// 【クライアントコンポーネント】React Hooksを使用するため"use client"が必須
"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { generateClient } from "aws-amplify/data";
import { fetchUserAttributes, getCurrentUser, signInWithRedirect, signOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import type { Schema } from "../../amplify/data/resource";
import { motion, AnimatePresence, Variants } from "framer-motion";

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

// 【カテゴリ一覧】"すべて"は絞り込み解除を表す特別値。マイ単語はログイン時のみ表示に追加する
const CATEGORIES = ["すべて", "基本用語", "ネットワーク用語", "コンピューティング", "ストレージ/データベース", "セキュリティ関連"];
const MY_WORD_CATEGORY = "マイ単語";
// 【マイカテゴリ】既存の単語の中から自分で選んで登録する専用リスト。word.categoryではなくprogressMap[wordId].inMyCategoryで判定する特別なカテゴリ値
const MY_CATEGORY = "マイカテゴリ";
// 【カテゴリ表示ラベル】絞り込みの値(word.categoryと一致させる必要がある)はそのままに、ボタンの見た目だけ短縮する
const CATEGORY_DISPLAY_LABELS: Record<string, string> = {
  "基本用語": "基本",
  "ネットワーク用語": "ネットワーク",
  "ストレージ/データベース": "ストレージ/DB",
  "セキュリティ関連": "セキュリティ",
};

// 【広告設定】未設定の場合はプレースホルダーを表示する
const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
const ADSENSE_SLOT_ID = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;

// 【使い方説明】localStorageにこのキーがなければ初回訪問とみなして自動表示する
const ONBOARDING_SEEN_KEY = "wordcard_onboarding_seen";

// 【使い方説明の内容】実際の画面キャプチャで「このボタンを押すとどうなるか」を見せるステップ形式
const ONBOARDING_STEPS: {
  title: string;
  description: string;
  images: { src: string; alt: string; caption?: string }[];
}[] = [
  {
    title: "カードをめくって意味を確認",
    description: "単語カードをタップ（クリック）すると裏返り、意味と詳細が表示されます。",
    images: [
      { src: "/onboarding/step1-front.png", alt: "カード表面", caption: "タップ前" },
      { src: "/onboarding/step1-back.png", alt: "カード裏面", caption: "タップ後" },
    ],
  },
  {
    title: "覚えたら右上のボタンをタップ",
    description: "「まだ」ボタンを押すと「覚えた」に切り替わり、進捗として記録されます。もう一度押すと元に戻せます。",
    images: [
      { src: "/onboarding/step2-before.png", alt: "まだボタン", caption: "押す前" },
      { src: "/onboarding/step2-after.png", alt: "覚えたボタン", caption: "押した後" },
    ],
  },
  {
    title: "好きな単語を「マイカテゴリ」に登録",
    description: "ログイン中は、しおりマークのボタンを押すとその単語だけを集めた「マイカテゴリ」に登録されます。サイドバーの「マイカテゴリ」を選ぶと、登録した単語だけで学習できます。",
    images: [
      { src: "/onboarding/step5-before.png", alt: "マイカテゴリ登録前", caption: "押す前" },
      { src: "/onboarding/step5-after.png", alt: "マイカテゴリ登録後", caption: "押した後" },
    ],
  },
  {
    title: "サイドバーで絞り込む",
    description: "画面左上のメニューから、カテゴリや「覚えた/まだ」の進捗で単語を絞り込めます。",
    images: [
      { src: "/onboarding/step3-sidebar.png", alt: "カテゴリ・進捗フィルター" },
    ],
  },
  {
    title: "ログインで他の端末にも同期",
    description: "右上からGoogleでログインすると、学習の進捗や単語帳がどの端末からでも同じ状態で使えます。",
    images: [
      { src: "/onboarding/step4-login.png", alt: "Googleでログインボタン" },
    ],
  },
];

export default function Home() {
  // 【状態管理】
  const [allWords, setAllWords] = useState<any[]>([]); // すべての単語データ
  const [isLoaded, setIsLoaded] = useState(false); // データ取得完了フラグ
  const [currentIndex, setCurrentIndex] = useState(0); // 現在表示中の単語のインデックス
  const [isFlipped, setIsFlipped] = useState(false); // カード表示状態（表面:false/裏面:true）
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // サイドバーの開閉状態

  // 【単語リストのスクロールヒント】上下にまだ続きがあるかを判定し、矢印アイコンの表示に使う
  const wordListRef = useRef<HTMLElement>(null);
  const [wordListScroll, setWordListScroll] = useState({ canScrollUp: false, canScrollDown: false });
  const updateWordListScrollState = useCallback(() => {
    const el = wordListRef.current;
    if (!el) return;
    setWordListScroll({
      canScrollUp: el.scrollTop > 4,
      canScrollDown: el.scrollTop + el.clientHeight < el.scrollHeight - 4,
    });
  }, []);
  // 【サイドバーの自動追従】カード送りで表示中の単語が変わったら、サイドバーのハイライト行が
  // 画面外に隠れないよう自動でスクロール位置を追従させる
  const scrollActiveWordIntoView = useCallback((wordId: string) => {
    const container = wordListRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-word-id="${CSS.escape(wordId)}"]`);
    target?.scrollIntoView({ block: "nearest" });
  }, []);
  const [showOnboarding, setShowOnboarding] = useState(false); // 使い方説明オーバーレイの表示状態
  const [onboardingStep, setOnboardingStep] = useState(0); // 使い方説明の現在ページ（0始まり）

  // 【初回訪問チェック】localStorageに表示済みフラグがなければ自動表示する
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(ONBOARDING_SEEN_KEY)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 初回マウント時にlocalStorageを読むための同期setStateで、他の初期化処理と同じパターン
        setShowOnboarding(true);
      }
    } catch {
      // localStorageが使えない環境では何もしない
    }
  }, []);

  // 【ページリセット】オーバーレイを開くたびに1ページ目から表示する
  useEffect(() => {
    if (showOnboarding) setOnboardingStep(0);
  }, [showOnboarding]);

  const handleCloseOnboarding = useCallback(() => {
    setShowOnboarding(false);
    try {
      window.localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
    } catch {
      // localStorageが使えない環境では何もしない
    }
  }, []);
  const [selectedCategory, setSelectedCategory] = useState<string>("すべて"); // 選択中のカテゴリ
  const [[page, direction], setPage] = useState([0, 0]); // ページ遷移の方向を記録（アニメーション用）
  const isTransitioning = useRef(false); // アニメーション実行中フラグ（重複アクション防止）

  // 【開発用モックログイン】本番ビルドではdevelopホストのみ有効（mainでは常に無効）。?mockLogin=1 でバックエンド呼び出しなしにログイン済みUIを再現する
  const isMockAuthAllowedHost = typeof window !== "undefined" &&
    (process.env.NODE_ENV !== "production" || window.location.hostname.startsWith("develop."));
  // 初期値はURLの?mockLogin=1から。以降は画面右上のトグルボタンでURLを書き換えずに切り替えられる
  const [mockLoginToggle, setMockLoginToggle] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mockLogin") === "1"
  );
  const isMockAuth = isMockAuthAllowedHost && mockLoginToggle;

  // 【ログイン状態管理】
  const [authUser, setAuthUser] = useState<{ username: string; email?: string } | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showEmailPopover, setShowEmailPopover] = useState(false); // アバターをタップ/クリックした時にメールアドレスを表示するポップオーバー

  const checkCurrentUser = useCallback(async () => {
    if (isMockAuth) {
      setAuthUser({ username: "mock-user", email: "mock@example.com" });
      setIsAuthLoading(false);
      return;
    }
    try {
      const user = await getCurrentUser();
      let email = user.signInDetails?.loginId;
      if (!email) {
        // Google連携ログインではsignInDetailsが取れないため、属性から直接メールアドレスを取得する
        const attributes = await fetchUserAttributes();
        email = attributes.email;
      }
      setAuthUser({ username: user.username, email });
    } catch {
      setAuthUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  }, [isMockAuth]);

  useEffect(() => {
    checkCurrentUser();
    if (isMockAuth) return;
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn" || payload.event === "signedOut") {
        checkCurrentUser();
      }
    });
    return unsubscribe;
  }, [checkCurrentUser, isMockAuth]);

  const handleGoogleLogin = useCallback(() => {
    if (isMockAuthAllowedHost) {
      // develop環境・ローカル開発では実際のGoogle認証を経由せず、ボタン操作だけでログイン済みUIを再現する
      setMockLoginToggle(true);
      return;
    }
    signInWithRedirect({ provider: "Google" });
  }, [isMockAuthAllowedHost]);

  const handleLogout = useCallback(() => {
    setShowEmailPopover(false);
    if (isMockAuth) {
      // 「今まさにモックログイン中」の場合のみローカル状態だけ戻す。
      // isMockAuthAllowedHost(develop等のホストかどうか)だけで判定すると、実際にGoogleでログイン済みの
      // セッションでログアウトを押した際に本物のsignOut()が呼ばれず、セッションが残ったままUIだけ
      // 宙ぶらりんになる不具合があったため、実際にモック中かどうかで判定するよう修正
      setAuthUser(null);
      setIsAuthLoading(true);
      setMockLoginToggle(false);
      return;
    }
    signOut();
  }, [isMockAuth]);

  // 【学習進捗管理】wordId -> 覚えたか/マイカテゴリ登録済みか。未ログイン時はlocalStorage、ログイン時はDB(WordProgress)で管理する
  const LOCAL_PROGRESS_KEY = "wordcard_local_progress";
  type LocalProgressEntry = { learned: boolean; inMyCategory?: boolean };
  const [progressMap, setProgressMap] = useState<Record<string, { id: string; learned: boolean; inMyCategory: boolean }>>({});

  const loadLocalProgress = useCallback((): Record<string, LocalProgressEntry> => {
    try {
      const raw = window.localStorage.getItem(LOCAL_PROGRESS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      // 旧形式(wordId -> boolean)との互換性を保つ
      const migrated: Record<string, LocalProgressEntry> = {};
      for (const [wordId, value] of Object.entries<any>(parsed)) {
        migrated[wordId] = typeof value === "boolean" ? { learned: value } : value;
      }
      return migrated;
    } catch {
      return {};
    }
  }, []);

  const saveLocalProgress = useCallback((map: Record<string, LocalProgressEntry>) => {
    try {
      window.localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(map));
    } catch (e) {
      console.error("ローカル進捗保存エラー:", e);
    }
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;

    if (!authUser || isMockAuth) {
      // 未ログイン、またはモックログイン中：localStorageから読み込む（バックエンド不要）
      const local = loadLocalProgress();
      const map: Record<string, { id: string; learned: boolean; inMyCategory: boolean }> = {};
      for (const [wordId, entry] of Object.entries(local)) {
        map[wordId] = { id: wordId, learned: entry.learned, inMyCategory: entry.inMyCategory === true };
      }
      setProgressMap(map);
      return;
    }

    // ログイン済み：DBから読み込み、localStorageに未同期の進捗があればマージする
    const fetchAndMergeProgress = async () => {
      try {
        const client = generateClient<Schema>({ authMode: "userPool" });
        let items: any[] = [];
        let cursor: string | null | undefined = undefined;
        do {
          const result: any = await client.models.WordProgress.list({ limit: 1000, nextToken: cursor });
          if (result.errors) console.error("GraphQL errors:", result.errors);
          items = items.concat(result.data || []);
          cursor = result.nextToken;
        } while (cursor);
        const map: Record<string, { id: string; learned: boolean; inMyCategory: boolean }> = {};
        for (const item of items) {
          map[item.wordId] = { id: item.id, learned: item.learned, inMyCategory: item.inMyCategory === true };
        }

        // localStorageにDB未反映の進捗があればアップロードしてマージ
        const local = loadLocalProgress();
        const localEntries = Object.entries(local);
        if (localEntries.length > 0) {
          for (const [wordId, entry] of localEntries) {
            if (!map[wordId]) {
              const newId = `${wordId}_${authUser.username}`;
              try {
                await client.models.WordProgress.create({ id: newId, wordId, learned: entry.learned, inMyCategory: entry.inMyCategory === true });
                map[wordId] = { id: newId, learned: entry.learned, inMyCategory: entry.inMyCategory === true };
              } catch (e) {
                console.error("進捗マージエラー:", e);
              }
            }
          }
          window.localStorage.removeItem(LOCAL_PROGRESS_KEY);
        }

        setProgressMap(map);
      } catch (e) {
        console.error("進捗取得エラー:", e);
      }
    };
    fetchAndMergeProgress();
  }, [authUser, isAuthLoading, isMockAuth, loadLocalProgress]);

  // 【進捗の1フィールド更新】覚えた/まだ・マイカテゴリ共通の更新処理。片方のフィールドだけを変更し、もう片方は保持する
  const updateProgressField = useCallback(async (wordId: string, field: "learned" | "inMyCategory", nextValue: boolean) => {
    const existing = progressMap[wordId];
    const nextEntry = {
      learned: field === "learned" ? nextValue : (existing?.learned ?? false),
      inMyCategory: field === "inMyCategory" ? nextValue : (existing?.inMyCategory ?? false),
    };

    if (isMockAuth) {
      // モックログイン：バックエンドを呼ばずローカル状態のみ更新（デザイン確認用）
      setProgressMap((prev) => ({ ...prev, [wordId]: { id: existing?.id || wordId, ...nextEntry } }));
      return;
    }

    if (!authUser) {
      // 未ログイン：localStorageのみで完結
      const local = loadLocalProgress();
      local[wordId] = nextEntry;
      saveLocalProgress(local);
      setProgressMap((prev) => ({ ...prev, [wordId]: { id: wordId, ...nextEntry } }));
      return;
    }

    const client = generateClient<Schema>({ authMode: "userPool" });
    try {
      if (existing) {
        await client.models.WordProgress.update({ id: existing.id, wordId, ...nextEntry });
        setProgressMap((prev) => ({ ...prev, [wordId]: { id: existing.id, ...nextEntry } }));
      } else {
        const newId = `${wordId}_${authUser.username}`;
        await client.models.WordProgress.create({ id: newId, wordId, ...nextEntry });
        setProgressMap((prev) => ({ ...prev, [wordId]: { id: newId, ...nextEntry } }));
      }
    } catch (e) {
      console.error("進捗更新エラー:", e);
    }
  }, [authUser, isMockAuth, progressMap, loadLocalProgress, saveLocalProgress]);

  const handleToggleLearned = useCallback((wordId: string) => {
    updateProgressField(wordId, "learned", !progressMap[wordId]?.learned);
  }, [progressMap, updateProgressField]);

  const handleToggleMyCategory = useCallback((wordId: string) => {
    updateProgressField(wordId, "inMyCategory", !progressMap[wordId]?.inMyCategory);
  }, [progressMap, updateProgressField]);

  // 【マイ単語管理】ログインユーザー本人が追加した単語
  const [myWords, setMyWords] = useState<any[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newWordForm, setNewWordForm] = useState({ word: "", meaning: "", description: "" });
  const [isSavingWord, setIsSavingWord] = useState(false);

  const fetchMyWords = useCallback(async () => {
    if (!authUser || isMockAuth) {
      // 未ログイン、またはモックログイン中はマイ単語なし（バックエンド不要）
      setMyWords([]);
      return;
    }
    try {
      const client = generateClient<Schema>({ authMode: "userPool" });
      let items: any[] = [];
      let cursor: string | null | undefined = undefined;
      do {
        const result: any = await client.models.MyWord.list({ limit: 1000, nextToken: cursor });
        if (result.errors) console.error("GraphQL errors:", result.errors);
        items = items.concat(result.data || []);
        cursor = result.nextToken;
      } while (cursor);
      setMyWords(items);
    } catch (e) {
      console.error("マイ単語取得エラー:", e);
    }
  }, [authUser, isMockAuth]);

  useEffect(() => {
    fetchMyWords();
  }, [fetchMyWords]);

  // 【編集中のマイ単語】nullなら新規追加モード、IDが入っていれば編集モード（同じモーダルを流用する）
  const [editingMyWordId, setEditingMyWordId] = useState<string | null>(null);

  const handleStartEditMyWord = useCallback((w: { id: string; word: string; meaning: string; description?: string }) => {
    setEditingMyWordId(w.id);
    setNewWordForm({ word: w.word, meaning: w.meaning, description: w.description || "" });
    setIsAddModalOpen(true);
  }, []);

  const closeAddModal = useCallback(() => {
    setIsAddModalOpen(false);
    setEditingMyWordId(null);
    setNewWordForm({ word: "", meaning: "", description: "" });
  }, []);

  const handleAddMyWord = useCallback(async () => {
    if (!authUser || !newWordForm.word.trim() || !newWordForm.meaning.trim()) return;
    setIsSavingWord(true);
    const trimmed = {
      word: newWordForm.word.trim(),
      meaning: newWordForm.meaning.trim(),
      description: newWordForm.description.trim() || undefined,
    };

    if (isMockAuth) {
      // モックログイン：ローカル配列に直接追加・更新（デザイン確認用）
      if (editingMyWordId) {
        setMyWords((prev) => prev.map((w) => (w.id === editingMyWordId ? { ...w, ...trimmed } : w)));
      } else {
        setMyWords((prev) => [...prev, { id: `mock_${Date.now()}`, ...trimmed }]);
      }
      closeAddModal();
      setIsSavingWord(false);
      return;
    }

    try {
      const client = generateClient<Schema>({ authMode: "userPool" });
      if (editingMyWordId) {
        await client.models.MyWord.update({ id: editingMyWordId, ...trimmed });
      } else {
        await client.models.MyWord.create({ id: `${Date.now()}_${authUser.username}`, ...trimmed });
      }
      closeAddModal();
      await fetchMyWords();
    } catch (e) {
      console.error("マイ単語保存エラー:", e);
    } finally {
      setIsSavingWord(false);
    }
  }, [authUser, isMockAuth, newWordForm, fetchMyWords, editingMyWordId, closeAddModal]);

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

  // 【画面端スワイプでサイドバーを開く】サイドバーが閉じている間は幅0で領域が無いため、
  // 画面左端(24px以内)から始まる右方向スワイプを画面全体で検出して開く
  useEffect(() => {
    if (isSidebarOpen) return;
    let startX: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const x = e.touches[0].clientX;
      startX = x <= 24 ? x : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (startX === null) return;
      const endX = e.changedTouches[0].clientX;
      if (endX - startX > 50) setIsSidebarOpen(true);
      startX = null;
    };
    window.addEventListener("touchstart", onTouchStart);
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isSidebarOpen]);

  // 【初期化】Amplify Dataクライアントでwordテーブルから単語データを取得
  useEffect(() => {
    const fetchWords = async () => {
      try {
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

  // 【マイ単語のマージ】ログイン中のみ、マイ単語カテゴリとして一覧に統合する
  const combinedWords = useMemo(() => {
    const myWordItems = myWords.map((w) => ({
      ...w,
      isVisible: true,
      category: MY_WORD_CATEGORY,
      isMyWord: true,
    }));
    return [...allWords, ...myWordItems];
  }, [allWords, myWords]);

  const categories = useMemo(() => {
    // マイカテゴリはログイン中のみ表示する機能
    const base = authUser ? [...CATEGORIES, MY_CATEGORY] : CATEGORIES;
    return authUser && myWords.length > 0 ? [...base, MY_WORD_CATEGORY] : base;
  }, [authUser, myWords.length]);

  // 【進捗フィルター】覚えた/まだで絞り込む
  const [progressFilter, setProgressFilter] = useState<"all" | "learned" | "unlearned">("all");
  // 【検索】単語・意味に部分一致するものだけに絞り込む（カテゴリ・進捗フィルターと併用可能）
  const [searchQuery, setSearchQuery] = useState("");
  // 【ランダム表示】オンにすると出題順をシャッフルする。再タップでシャッフルし直せるようshuffleSeedを更新する
  const [isShuffleOn, setIsShuffleOn] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  // 【フィルター】hiddenステータス以外・選択中カテゴリ・進捗状態・検索語で絞り込み（学習対象の単語リスト）
  const filteredWords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return combinedWords.filter(w => {
      if (!w.isVisible) return false;
      if (selectedCategory === MY_CATEGORY) {
        if (progressMap[w.id]?.inMyCategory !== true) return false;
      } else if (selectedCategory !== "すべて" && w.category !== selectedCategory) {
        return false;
      }
      const learned = progressMap[w.id]?.learned === true;
      if (progressFilter === "learned" && !learned) return false;
      if (progressFilter === "unlearned" && learned) return false;
      if (q && !w.word.toLowerCase().includes(q) && !(w.meaning || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [combinedWords, selectedCategory, progressFilter, progressMap, searchQuery]);

  // 【ランダム表示の適用】シャッフルON時のみ、絞り込み結果の順序をランダムに入れ替える。
  // Math.random()はレンダー中に呼べない（純粋でない）ため、useMemoではなくuseEffect+state で行う
  const [shuffledWords, setShuffledWords] = useState<typeof filteredWords>([]);
  useEffect(() => {
    if (!isShuffleOn) {
      setShuffledWords(filteredWords);
      return;
    }
    const arr = [...filteredWords];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setShuffledWords(arr);
  }, [filteredWords, isShuffleOn, shuffleSeed]);
  const visibleWords = isShuffleOn ? shuffledWords : filteredWords;

  // 【学習サマリー】現在の絞り込み条件内で「覚えた」の件数を表示する
  const learnedCountInView = useMemo(
    () => visibleWords.filter((w) => progressMap[w.id]?.learned === true).length,
    [visibleWords, progressMap]
  );

  // 【削除対象の確認待ち】削除ボタンを押した直後は確認ダイアログを表示するだけにし、
  // 実際の削除はユーザーが確認モーダルで確定してから行う
  const [wordPendingDelete, setWordPendingDelete] = useState<{ id: string; word: string } | null>(null);

  const handleDeleteMyWord = useCallback(async (id: string) => {
    // 削除によって表示中の単語より前の位置にあった単語が消える場合、表示位置(currentIndex)を
    // 1つ前に詰めないと、閲覧中の単語と違う単語にすり替わって表示されてしまうため補正する
    const deletedIndexInVisible = visibleWords.findIndex((w) => w.id === id);
    const adjustIndex = () => {
      if (deletedIndexInVisible !== -1 && deletedIndexInVisible < currentIndex) {
        setCurrentIndex((i) => Math.max(0, i - 1));
      }
    };

    if (isMockAuth) {
      setMyWords((prev) => prev.filter((w) => w.id !== id));
      adjustIndex();
      return;
    }
    try {
      const client = generateClient<Schema>({ authMode: "userPool" });
      await client.models.MyWord.delete({ id });
      setMyWords((prev) => prev.filter((w) => w.id !== id));
      adjustIndex();
    } catch (e) {
      console.error("マイ単語削除エラー:", e);
    }
  }, [isMockAuth, visibleWords, currentIndex]);

  const handleConfirmDeleteMyWord = useCallback(() => {
    if (!wordPendingDelete) return;
    handleDeleteMyWord(wordPendingDelete.id);
    setWordPendingDelete(null);
  }, [wordPendingDelete, handleDeleteMyWord]);

  // 【単語リストのスクロールヒント再計算】絞り込みでリストの件数(=高さ)が変わるたびに判定し直す
  useEffect(() => {
    updateWordListScrollState();
  }, [visibleWords, updateWordListScrollState]);

  // 【絞り込み切り替え】カテゴリ・進捗・検索・ランダム表示が変わったら表示位置を先頭に戻す
  useEffect(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [selectedCategory, progressFilter, searchQuery, isShuffleOn, shuffleSeed]);

  // 【サイドバー自動追従】カード送りで表示中の単語が変わるたびに、サイドバーのハイライト行を追従スクロールする
  useEffect(() => {
    const current = visibleWords[currentIndex];
    if (current) scrollActiveWordIntoView(current.id);
  }, [currentIndex, visibleWords, scrollActiveWordIntoView]);

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
      // フォーム入力中（単語追加モーダルの入力欄など）は、スペース入力やカーソル移動を
      // 妨げないよう、カード送りのショートカットを無効化する
      const target = e.target as HTMLElement | null;
      const isTypingTarget = !!target && (
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
      );
      if (isTypingTarget) return;

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
  // 絞り込み結果が0件の場合はundefinedになりうる（例: 「覚えた」で絞り込んだが1件も覚えていない場合）
  const word = visibleWords[currentIndex] || visibleWords[0];

  // 【表示番号の計算】選択中カテゴリの絞り込みリストでの位置を表示
  const realNumber = currentIndex + 1;

  return (
    <div className="fixed inset-0 bg-slate-50 flex overflow-hidden font-sans text-slate-900">
      {/* 【オーバーレイ】モバイル版：サイドバー表示時の背景を暗くする */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/40 z-[450] md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* 【メニューボタン】ハンバーガーメニュー。z-indexを[700]に設定して最前面に配置 */}
      <div className="fixed top-4 left-3 z-[700] flex items-center gap-3">
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-3 bg-white shadow-xl rounded-2xl text-slate-600 active:scale-95 transition-transform">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        {/* 【単語を追加ボタン】サイドバーが開いている間のみハンバーガー横に表示。狭幅端末でもこの間タイトルはサイドバーの下に
            隠れるため重ならず、サイドバーが閉じている(=タイトルが見えている)時は表示しないことで衝突を避ける */}
        {isSidebarOpen && authUser && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white shadow-xl text-blue-500 text-[11px] font-black active:scale-95 transition-transform"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            単語を追加
          </button>
        )}
      </div>

      {/* 【ログイン中ポップオーバーの背景】アバター以外の場所をクリック/タップすると閉じる */}
      {showEmailPopover && (
        <div className="fixed inset-0 z-[690]" onClick={() => setShowEmailPopover(false)} />
      )}

      {/* 【ログインボタン】未ログイン時はGoogleログイン、ログイン時はアバター（アイコン）とログアウトボタンを表示。
          メールアドレスは常時表示せず、アバターのホバー(PC)/タップ(スマホ)でポップオーバー表示する。
          これによりログイン中でもヘッダー右側の幅が常に一定になり、タイトルとの重なりが起きなくなる */}
      <div className="fixed top-8 right-6 z-[700] flex flex-col items-center gap-1">
        {!isAuthLoading && (
          authUser ? (
            <div className="flex items-center gap-1.5 sm:gap-2 bg-white shadow-xl rounded-2xl px-1.5 sm:px-2 py-1.5 sm:py-2">
              <div className="relative">
                <button
                  onClick={() => setShowEmailPopover((v) => !v)}
                  title={authUser.email || authUser.username}
                  aria-label="ログイン中のアカウント"
                  className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-blue-400 text-white text-[10px] sm:text-sm font-black flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
                >
                  {(authUser.email || authUser.username || "?").charAt(0).toUpperCase()}
                </button>
                {showEmailPopover && (
                  <div className="absolute top-full right-0 mt-2 bg-white shadow-xl rounded-xl px-3 py-2 text-xs font-bold text-slate-600 whitespace-nowrap">
                    {authUser.email || authUser.username}
                  </div>
                )}
              </div>
              <button onClick={handleLogout} aria-label="ログアウト" className="flex items-center gap-1 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-black active:scale-95 transition-transform">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 sm:w-[14px] sm:h-[14px]">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                <span className="hidden sm:inline">ログアウト</span>
              </button>
            </div>
          ) : (
            <>
              <button onClick={handleGoogleLogin} className="flex items-center gap-2 bg-[#4285F4] hover:bg-[#3367d6] shadow-xl rounded-full pl-1.5 pr-1.5 sm:pr-4 py-1.5 text-white text-sm font-bold active:scale-95 transition-all">
                <span className="bg-white rounded-full p-1.5 flex items-center justify-center flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </span>
                <span className="hidden sm:inline">Googleでログイン</span>
              </button>
              <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap select-none hidden sm:block pr-1">
                ログインで他の端末にも同期
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
          {/* 【検索】単語・意味を部分一致で検索する */}
          <div className="mt-20 mx-3 relative">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">
              <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="単語・意味を検索"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-300"
            />
          </div>
          {/* カテゴリフィルター */}
          <div className="mt-3 mx-3 px-3 py-3 rounded-2xl border border-blue-100 bg-blue-50">
            <span className="block px-1 mb-1.5 text-[10px] font-black text-slate-500 tracking-widest select-none">カテゴリ</span>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${selectedCategory === cat ? "bg-blue-400 text-white" : "bg-white text-slate-500"}`}
                >
                  {cat === MY_CATEGORY && (
                    // カード上のしおりボタンと同じアイコンにして、マイカテゴリの中身がしおりで登録した単語だと直感的にわかるようにする
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                  )}
                  {CATEGORY_DISPLAY_LABELS[cat] ?? cat}
                </button>
              ))}
            </div>
          </div>
          {/* 進捗フィルター */}
          <div className="px-3 pt-4 pb-3 border-b border-slate-50">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-[10px] font-black text-slate-500 tracking-widest select-none">進捗</span>
              {/* 【学習サマリー】現在の絞り込み内での「覚えた」件数 */}
              <span className="text-[10px] font-black text-emerald-500 tracking-wide select-none">
                覚えた {learnedCountInView} / {visibleWords.length}
              </span>
            </div>
            <div className="flex gap-1.5">
              {([
                { key: "all", label: "すべて" },
                { key: "unlearned", label: "まだ" },
                { key: "learned", label: "覚えた" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setProgressFilter(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${progressFilter === key ? "bg-emerald-400 text-white" : "bg-slate-100 text-slate-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* 【ランダム表示】オンの間は出題順をシャッフルする。オンの状態で再タップすると出題順を引き直す */}
            <button
              onClick={() => { if (isShuffleOn) setShuffleSeed((s) => s + 1); setIsShuffleOn((v) => !v); }}
              aria-label="ランダム表示"
              className={`mt-1.5 w-full flex items-center justify-center px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isShuffleOn ? "bg-blue-400 text-white" : "bg-slate-100 text-slate-500"}`}
            >
              {isShuffleOn ? "ランダム表示 中（タップで引き直す）" : "ランダム表示にする"}
            </button>
          </div>
          {/* 単語一覧のスクロール領域：スクロール可能な範囲全体を薄い青色にし、続きがある方向に矢印アイコンを表示してスクロールできることを示す */}
          <div className="relative flex-1 min-h-0 bg-blue-50">
            <nav
              ref={wordListRef}
              onScroll={updateWordListScrollState}
              className="h-full overflow-y-auto p-3 word-list-scrollbar"
            >
            {visibleWords.map((w, idx) => (
              <div key={w.id} data-word-id={w.id} className={`flex items-center rounded-xl mb-1 transition-all ${(word?.id === w.id) ? "bg-blue-200 border border-blue-300 shadow-sm" : "bg-transparent border border-transparent border-b-blue-200/60"}`}>
                {/* 単語ボタン：クリックで該当単語へジャンプ */}
                <button onClick={() => { setCurrentIndex(idx); setIsFlipped(false); }} className="flex-1 text-left px-4 py-3 text-sm truncate font-bold text-slate-700 flex items-center gap-2 min-w-0">
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
                {w.isMyWord && (
                  <button
                    onClick={() => handleStartEditMyWord(w)}
                    className="flex-shrink-0 p-2 text-slate-300 hover:text-blue-400 transition-colors"
                    title="編集"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                    </svg>
                  </button>
                )}
                {w.isMyWord && (
                  <button
                    onClick={() => setWordPendingDelete({ id: w.id, word: w.word })}
                    className="flex-shrink-0 p-2 mr-1 text-slate-300 hover:text-red-400 transition-colors"
                    title="削除"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                )}
              </div>
            ))}
            </nav>
            {wordListScroll.canScrollUp && (
              <div className="pointer-events-none absolute top-1.5 inset-x-0 flex justify-center">
                <span className="w-6 h-6 rounded-full bg-white shadow flex items-center justify-center text-slate-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15"></polyline>
                  </svg>
                </span>
              </div>
            )}
            {wordListScroll.canScrollDown && (
              <div className="pointer-events-none absolute bottom-1.5 inset-x-0 flex justify-center">
                <span className="w-6 h-6 rounded-full bg-white shadow flex items-center justify-center text-slate-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 【メインエリア】カード表示と操作エリア */}
      <main className="fixed inset-0 md:relative md:inset-auto md:flex-1 bg-blue-50/30 flex flex-col items-center p-4 pt-32 overflow-y-auto overflow-x-hidden transition-all duration-300">
        
        {/* 【アプリタイトル】カードと完全に中心を揃える（ビューポート中央固定）。左右のヘッダー要素は幅が変動しても重ならないよう幅を制限する */}
        <div className="absolute top-8 left-1/2 z-[200] flex flex-col items-center transition-all duration-300 pointer-events-none max-w-[150px] sm:max-w-[220px] md:max-w-none -translate-x-1/2">
          <h1 className={`font-extrabold tracking-wide select-none block text-blue-400 transition-all duration-300 truncate max-w-full text-base sm:text-2xl h-12 leading-[3rem] ${isSidebarOpen ? 'md:text-3xl' : 'md:text-4xl'}`} style={{ fontFamily: "'Noto Serif JP', 'Zen Old Mincho', 'Georgia', serif", fontWeight: 600, letterSpacing: '0.02em' }}>
            AWS WordCard
          </h1>
          {/* 【絞り込み中カテゴリ表示】「すべて」以外を選択中のみ表示 */}
          {selectedCategory !== "すべて" && (
            <span className="mt-2 px-3 py-1 rounded-full bg-blue-100 text-blue-500 text-[10px] font-black tracking-widest select-none whitespace-nowrap">
              {CATEGORY_DISPLAY_LABELS[selectedCategory] ?? selectedCategory}
            </span>
          )}
        </div>
        
        {/* 【カード表示エリア】フリップアニメーション付きカード */}
        <div className="relative w-full max-w-5xl flex-1 min-h-[420px] z-[100]">
          {!word ? (
            // 【絞り込み結果0件】例えば「覚えた」で絞り込んだが1件も覚えていない場合。フィルターを戻せるよう案内する
            <div className="w-full h-full flex flex-col items-center justify-center text-center px-6 shadow-[0_40px_80px_rgba(0,0,0,0.08)] rounded-[3rem] bg-white">
              <p className="text-slate-500 font-bold mb-4">この絞り込み条件に該当する単語がありません。</p>
              <button
                onClick={() => { setSelectedCategory("すべて"); setProgressFilter("all"); setSearchQuery(""); }}
                className="px-5 py-2.5 rounded-full bg-blue-400 text-white text-sm font-black active:scale-95 transition-transform"
              >
                絞り込みを解除する
              </button>
            </div>
          ) : (
          <>
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
                  <div className="absolute top-6 left-6 font-black text-4xl md:text-6xl italic text-slate-300 select-none pointer-events-none">#{realNumber}</div>
                  
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
                    <h1
                      className="font-black text-slate-900 leading-none tracking-tighter select-none text-balance"
                      style={{ fontSize: word.word.length > 10 ? "clamp(1.5rem, 6vw, 3.5rem)" : "clamp(2rem, 8vw, 5rem)", wordBreak: "auto-phrase", overflowWrap: "anywhere" } as React.CSSProperties}
                    >
                      {word.word}
                    </h1>
                  </div>

                  {/* 【覚えた/まだ・マイカテゴリ登録トグル】覚えた/まだは未ログインでもlocalStorageで動作するため常時表示。マイカテゴリ登録はログイン中のみ表示する機能 */}
                  <div className="absolute top-6 right-8 z-[300] pointer-events-auto flex items-center gap-2">
                    {authUser && (
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); handleToggleMyCategory(word.id); }}
                        title="マイカテゴリに登録"
                        aria-label="マイカテゴリに登録"
                        className={`w-9 h-9 flex items-center justify-center rounded-full shadow transition-all active:scale-95 ${progressMap[word.id]?.inMyCategory ? "bg-amber-400 text-white" : "bg-white text-slate-400 border border-slate-200"}`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={progressMap[word.id]?.inMyCategory ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </button>
                    )}
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); handleToggleLearned(word.id); }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-black shadow transition-all active:scale-95 ${progressMap[word.id]?.learned ? "bg-emerald-400 text-white" : "bg-white text-slate-400 border border-slate-200"}`}
                    >
                      {progressMap[word.id]?.learned ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="3 2.5">
                          <circle cx="12" cy="12" r="8"></circle>
                        </svg>
                      )}
                      {progressMap[word.id]?.learned ? "覚えた" : "まだ"}
                    </button>
                  </div>
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
                  <div className="absolute top-6 left-6 font-black text-4xl md:text-6xl italic text-slate-300 select-none">#{realNumber}</div>

                  {/* 【覚えた/まだ・マイカテゴリ登録トグル】覚えた/まだは未ログインでもlocalStorageで動作するため常時表示。マイカテゴリ登録はログイン中のみ表示する機能 */}
                  <div className="absolute top-6 right-8 z-[300] pointer-events-auto flex items-center gap-2">
                    {authUser && (
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); handleToggleMyCategory(word.id); }}
                        title="マイカテゴリに登録"
                        aria-label="マイカテゴリに登録"
                        className={`w-9 h-9 flex items-center justify-center rounded-full shadow transition-all active:scale-95 ${progressMap[word.id]?.inMyCategory ? "bg-amber-400 text-white" : "bg-white text-slate-400 border border-slate-200"}`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={progressMap[word.id]?.inMyCategory ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </button>
                    )}
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); handleToggleLearned(word.id); }}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-black shadow transition-all active:scale-95 ${progressMap[word.id]?.learned ? "bg-emerald-400 text-white" : "bg-white text-slate-400 border border-slate-200"}`}
                    >
                      {progressMap[word.id]?.learned ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="3 2.5">
                          <circle cx="12" cy="12" r="8"></circle>
                        </svg>
                      )}
                      {progressMap[word.id]?.learned ? "覚えた" : "まだ"}
                    </button>
                  </div>

                  {/* コンテンツエリア */}
                  <div className="relative flex flex-col h-full px-8 md:px-20 pt-24 pb-16">
                    {/* ヘッダー */}
                    <div className="relative text-center mb-3 flex-shrink-0 pointer-events-none">
                      <p className="text-slate-400 text-[10px] font-black tracking-widest mb-2 select-none">{word.word}</p>
                      <h2
                        className="font-black text-blue-600 leading-tight select-none text-balance"
                        style={{ fontSize: word.meaning.length > 20 ? "clamp(1.1rem, 3.5vw, 1.875rem)" : "clamp(1.25rem, 4.5vw, 2.25rem)", wordBreak: "auto-phrase", overflowWrap: "anywhere" } as React.CSSProperties}
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
                      className="scrollable-bg relative flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar border-t border-slate-50 pt-8 mb-4 space-y-6 pointer-events-auto"
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
          </>
          )}
          {/* 【使い方説明ボタン】カード右下角に固定。押すと使い方オーバーレイを再表示する */}
          <button onClick={() => setShowOnboarding(true)} className="absolute bottom-6 right-6 z-[150] w-11 h-11 flex items-center justify-center bg-white shadow-xl rounded-full text-slate-500 font-black text-base active:scale-95 transition-transform">
            ?
          </button>
        </div>

        {/* 広告スペース：AdSense未設定時はプレースホルダーを表示 */}
        <div className="w-full max-w-5xl h-20 mt-4 flex-shrink-0 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center z-[100] overflow-hidden">
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

      {/* 【単語追加モーダル】ログインユーザーがマイ単語を追加する */}
      {/* 【使い方説明】初回訪問時に自動表示、以降は左上の「?」ボタンから再表示できる。実際の画面キャプチャ付きの複数ページ構成 */}
      {showOnboarding && (() => {
        const step = ONBOARDING_STEPS[onboardingStep];
        const isFirst = onboardingStep === 0;
        const isLast = onboardingStep === ONBOARDING_STEPS.length - 1;
        return (
          <div className="fixed inset-0 bg-slate-900/40 z-[900] flex items-center justify-center p-4" onClick={handleCloseOnboarding}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md h-[600px] max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {/* ヘッダー：タイトル・ページ番号・閉じるボタン（常時表示、ページによってサイズが変わらないよう固定高さ） */}
              <div className="flex items-center justify-between px-6 pt-6 pb-2 flex-shrink-0">
                <h3 className="text-lg font-black text-slate-800">使い方</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400">{onboardingStep + 1} / {ONBOARDING_STEPS.length}</span>
                  <button
                    onClick={handleCloseOnboarding}
                    aria-label="閉じる"
                    className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 active:scale-95 transition-transform"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </div>

              {/* スクロール可能なコンテンツ領域：ページごとに文章量・画像枚数が違うため、ここだけがスクロールしダイアログ全体のサイズは変わらない */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2 custom-scrollbar">
                <div className="flex gap-3 mb-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-500 text-xs font-black flex items-center justify-center">{onboardingStep + 1}</span>
                  <p className="text-sm font-black text-slate-800 leading-relaxed pt-0.5">{step.title}</p>
                </div>

                {/* キャプチャ画像：1枚ならそのまま、2枚なら「押す前/押した後」を並べる */}
                <div className={`grid gap-2 mb-3 ${step.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {step.images.map((img) => (
                    <div key={img.src} className="rounded-2xl overflow-hidden bg-slate-50 border border-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 使い方説明用の小さな静的キャプチャ画像のためnext/imageの最適化は不要 */}
                      <img src={img.src} alt={img.alt} className="w-full h-auto block" />
                      {img.caption && (
                        <div className="text-center text-[10px] font-bold text-slate-400 py-1 border-t border-slate-100">{img.caption}</div>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-sm font-bold text-slate-600 leading-relaxed pb-2">{step.description}</p>
              </div>

              {/* フッター：ページ位置ドットと戻る/次へ（常に同じ高さ） */}
              <div className="flex-shrink-0 px-6 pb-6 pt-3">
                <div className="flex items-center justify-center gap-1.5 mb-4">
                  {ONBOARDING_STEPS.map((_, idx) => (
                    <span
                      key={idx}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === onboardingStep ? "bg-blue-400" : "bg-slate-200"}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  {isFirst ? (
                    // 1ページ目は「戻る」がないが、「次へ」の位置・大きさが2ページ目以降とずれないよう場所だけ確保する
                    <div className="flex-1" aria-hidden="true" />
                  ) : (
                    <button
                      onClick={() => setOnboardingStep((s) => s - 1)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-500 text-sm font-black active:scale-95 transition-transform"
                    >
                      戻る
                    </button>
                  )}
                  <button
                    onClick={isLast ? handleCloseOnboarding : () => setOnboardingStep((s) => s + 1)}
                    className="flex-1 py-2.5 rounded-xl bg-blue-400 text-white text-sm font-black active:scale-95 transition-transform"
                  >
                    {isLast ? "閉じる" : "次へ"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {isAddModalOpen && (
        // 【背景クリックでは閉じない】入力途中の内容が誤操作で消えないよう、閉じる手段は
        // 右上のバツボタンとキャンセルボタンのみにしている
        <div className="fixed inset-0 bg-slate-900/40 z-[900] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-800">{editingMyWordId ? "マイ単語を編集" : "マイ単語を追加"}</h3>
              <button
                onClick={closeAddModal}
                aria-label="閉じる"
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 active:scale-95 transition-transform"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-slate-400 tracking-widest">単語</label>
                <input
                  type="text"
                  value={newWordForm.word}
                  onChange={(e) => setNewWordForm((prev) => ({ ...prev, word: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-300"
                  placeholder="例：VPC"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 tracking-widest">意味</label>
                <input
                  type="text"
                  value={newWordForm.meaning}
                  onChange={(e) => setNewWordForm((prev) => ({ ...prev, meaning: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-300"
                  placeholder="例：仮想プライベートネットワーク"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 tracking-widest">詳細（任意）</label>
                <textarea
                  value={newWordForm.description}
                  onChange={(e) => setNewWordForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-300 resize-none"
                  rows={3}
                  placeholder="補足説明があれば入力"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={closeAddModal}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-black active:scale-95 transition-transform"
              >
                キャンセル
              </button>
              <button
                onClick={handleAddMyWord}
                disabled={isSavingWord || !newWordForm.word.trim() || !newWordForm.meaning.trim()}
                className="flex-1 py-2.5 rounded-xl bg-blue-400 text-white text-sm font-black active:scale-95 transition-transform disabled:opacity-50"
              >
                {isSavingWord ? "保存中..." : editingMyWordId ? "保存" : "追加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 【マイ単語削除の確認ダイアログ】誤タップで即削除されないよう、削除前に必ず確認する */}
      {wordPendingDelete && (
        <div className="fixed inset-0 bg-slate-900/40 z-[900] flex items-center justify-center p-4" onClick={() => setWordPendingDelete(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-black text-slate-800 mb-2">単語を削除しますか？</h3>
            <p className="text-sm text-slate-500 font-bold mb-5">
              「{wordPendingDelete.word}」を削除します。この操作は取り消せません。
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setWordPendingDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-black active:scale-95 transition-transform"
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirmDeleteMyWord}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-black active:scale-95 transition-transform"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* グローバルスタイル */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        /* 単語リストのスクロールバー：スクロールできることが分かるよう太く・濃い色で目立たせる */
        .word-list-scrollbar { scrollbar-width: auto; scrollbar-color: #94a3b8 #f1f5f9; }
        .word-list-scrollbar::-webkit-scrollbar { width: 10px; }
        .word-list-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 10px; }
        .word-list-scrollbar::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 10px; }
        .word-list-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
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