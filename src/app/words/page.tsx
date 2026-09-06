import Link from "next/link";
import outputs from "../../../amplify_outputs.json";

export const metadata = {
  title: "用語一覧 | AWS WordCard",
  description: "AWS WordCardに収録されているクラウド・ネットワーク・セキュリティ用語の一覧です。基本用語からAWSの実サービス名まで、カテゴリ別に確認できます。",
};

export const revalidate = 3600;

type WordItem = {
  id: string;
  word: string;
  meaning: string;
  category: string | null;
  description: string | null;
};

const CATEGORY_ORDER = [
  "基本用語",
  "ネットワーク用語",
  "コンピューティング",
  "ストレージ/データベース",
  "セキュリティ関連",
];

async function fetchAllWords(): Promise<WordItem[]> {
  const endpoint = outputs.data.url;
  const apiKey = outputs.data.api_key;

  const query = `
    query ListWords($nextToken: String) {
      listWords(limit: 1000, nextToken: $nextToken, filter: {
        or: [
          { del_flg: { ne: 1 } }
          { del_flg: { attributeExists: false } }
        ]
      }) {
        items { id word meaning category description }
        nextToken
      }
    }
  `;

  const items: WordItem[] = [];
  let nextToken: string | null = null;

  try {
    do {
      const res: Response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ query, variables: { nextToken } }),
        next: { revalidate: 3600 },
      });
      const json: any = await res.json();
      if (json.errors) {
        console.error("ListWords GraphQL errors:", json.errors);
        break;
      }
      items.push(...(json.data?.listWords?.items ?? []));
      nextToken = json.data?.listWords?.nextToken ?? null;
    } while (nextToken);
  } catch (e) {
    console.error("単語一覧の取得に失敗:", e);
  }

  return items.sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));
}

export default async function WordsPage() {
  const words = await fetchAllWords();

  const grouped = new Map<string, WordItem[]>();
  for (const category of CATEGORY_ORDER) grouped.set(category, []);
  for (const w of words) {
    const category = w.category && grouped.has(w.category) ? w.category : "その他";
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category)!.push(w);
  }

  return (
    <main className="min-h-screen bg-white text-slate-800">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-sm text-blue-500 hover:underline">
          ← AWS WordCardで学習する
        </Link>

        <h1 className="text-2xl font-bold mt-6 mb-2">用語一覧</h1>
        <p className="text-sm text-slate-500 mb-10">
          AWS WordCardに収録されている全{words.length}語です。カード形式での学習は
          <Link href="/" className="text-blue-500 hover:underline">トップページ</Link>
          からご利用いただけます。
        </p>

        <div className="space-y-10">
          {Array.from(grouped.entries())
            .filter(([, list]) => list.length > 0)
            .map(([category, list]) => (
              <section key={category}>
                <h2 className="text-lg font-bold mb-4 pb-2 border-b border-slate-200">
                  {category}({list.length}語)
                </h2>
                <dl className="space-y-4">
                  {list.map((w) => (
                    <div key={w.id}>
                      <dt className="font-bold text-slate-700">{w.word}</dt>
                      <dd className="text-sm text-slate-500">{w.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
        </div>
      </div>
    </main>
  );
}
