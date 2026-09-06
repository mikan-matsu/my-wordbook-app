import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  Word: a
    .model({
      id: a.id().required(),
      word: a.string().required(),
      meaning: a.string().required(),
      category: a.string(),
      del_flg: a.integer(),
      supplement: a.string(),
      example: a.string(),
      description: a.string(),
      status: a.integer().required(),
      requiresLogin: a.boolean(),
    })
    .identifier(['id'])
    .secondaryIndexes((index) => [index('status').name('byStatus').queryField('wordsByStatus')])
    // 単語データの追加・編集・削除はCLI/コンソールから管理者が行う運用のため、
    // ブラウザに同梱される公開APIキーには読み取り権限のみを与える。
    // (キーはクライアントバンドルに含まれるため誰でも取得可能。write権限を
    // 与えたままだと第三者が全単語を書き換え・削除できてしまう)
    .authorization((allow) => [allow.publicApiKey().to(['read'])]),

  // ログインユーザー本人の学習進捗（覚えた/まだ、マイカテゴリ登録）。個人情報は持たず、Cognitoのsubのみをキーにする。
  WordProgress: a
    .model({
      id: a.id().required(),
      wordId: a.string().required(),
      learned: a.boolean().required(),
      inMyCategory: a.boolean(),
    })
    .identifier(['id'])
    .authorization((allow) => [allow.owner()]),

  // ログインユーザー本人が追加した単語（マイ単語）。本人にのみ表示される。
  MyWord: a
    .model({
      id: a.id().required(),
      word: a.string().required(),
      meaning: a.string().required(),
      description: a.string(),
    })
    .identifier(['id'])
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: {
      expiresInDays: 365,
    },
  },
});
// 補足: allow.owner() は userPool 認証モードで動作する。
// defineData は Auth リソースが backend に登録されると自動的に userPool を
// 追加の認可モードとして解決するため、ここでの明示指定は不要。
