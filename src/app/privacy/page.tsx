import Link from "next/link";

export const metadata = {
  title: "プライバシーポリシー | AWS WordCard",
  description: "AWS WordCard(ワードカード)のプライバシーポリシーです。取得する情報の範囲、Cookieの利用、Google Analytics・Google AdSenseの利用について説明しています。",
};

const LAST_UPDATED = "2026年9月6日";
const CONTACT_EMAIL = "contact.driftcraft@gmail.com";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white text-slate-800">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-sm text-blue-500 hover:underline">
          ← AWS WordCardに戻る
        </Link>

        <h1 className="text-2xl font-bold mt-6 mb-2">プライバシーポリシー</h1>
        <p className="text-sm text-slate-400 mb-10">最終更新日: {LAST_UPDATED}</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <p>
              本ポリシーは、Webアプリケーション「AWS WordCard」(以下「本サービス」)における、
              利用者情報の取り扱いについて定めるものです。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">1. 取得する情報</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Googleアカウントでログインする際、ログイン機能のために利用しているクラウドサービス(Amazon Web Services)にメールアドレスが保存され、ログイン中の画面表示にのみ使用します。氏名・生年月日・電話番号などが保存されることはありません。
              </li>
              <li>
                このメールアドレスを、本サービスが単語データや学習記録を管理するデータベースに保存することはありません。学習進捗(単語ごとの「覚えた」フラグ、マイカテゴリ登録状況)および利用者が自身で登録した「マイ単語」の内容は、メールアドレスとは別の匿名の利用者IDにのみ紐づけて保存し、メールアドレスと結び付けて管理することはありません。
              </li>
              <li>
                これらのデータは本人にのみ紐づき、他の利用者から参照されることはありません。
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">2. Cookie・アクセス解析について</h2>
            <p>
              本サービスは、サービス改善のためGoogle Analytics(GA4)を利用しており、Cookieを通じて匿名の利用状況データ(閲覧ページ、利用端末の種類など)を取得しています。
              これらの情報は個人を特定するものではありません。Google Analyticsの詳細については
              <a
                className="text-blue-500 hover:underline"
                href="https://policies.google.com/technologies/partner-sites"
                target="_blank"
                rel="noopener noreferrer"
              >
                Googleのポリシーと規約
              </a>
              をご確認ください。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">3. 広告について(Google AdSense)</h2>
            <p className="mb-2">
              本サービスは、第三者配信の広告サービスであるGoogle AdSenseを利用しています。
              Google等の第三者配信事業者は、Cookieを使用して、利用者が本サービスや他のサイトに過去にアクセスした際の情報に基づいて広告を配信することがあります。
            </p>
            <p className="mb-2">
              Googleが広告配信にCookieを使用することにより、利用者は本サービスや他のサイトへのアクセス情報に基づいて、Google等の第三者配信事業者が広告を配信することになります。
              このパーソナライズ広告は
              <a
                className="text-blue-500 hover:underline"
                href="https://adssettings.google.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Googleの広告設定
              </a>
              から無効にできます。
            </p>
            <p>
              広告配信に関する詳細は
              <a
                className="text-blue-500 hover:underline"
                href="https://policies.google.com/technologies/ads"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google広告ポリシー
              </a>
              をご確認ください。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">4. 第三者への提供</h2>
            <p>
              法令に基づく場合を除き、取得した情報を本人の同意なく第三者に提供することはありません。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">5. データの開示・削除</h2>
            <p>
              ログイン中の画面下部にある「利用データを削除してログアウト」から、学習進捗・マイ単語のデータおよびログイン情報をご自身で削除できます。
              それ以外に保存されている自分のデータの開示をご希望の場合は、下記のお問い合わせ先までご連絡ください。本人確認のうえ、対応いたします。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">6. 免責事項</h2>
            <p>
              本サービスに掲載する用語の説明については、可能な限り正確な情報を提供するよう努めていますが、その正確性・完全性を保証するものではありません。
              本サービスの利用により生じた損害について、一切の責任を負いかねます。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">7. ポリシーの変更</h2>
            <p>
              本ポリシーの内容は、必要に応じて予告なく変更されることがあります。変更後のポリシーは、本ページに掲載した時点で効力を生じるものとします。
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">8. お問い合わせ</h2>
            <p>
              本ポリシーに関するお問い合わせは、下記メールアドレスまでお願いいたします。
            </p>
            <p className="mt-2">
              <a className="text-blue-500 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
