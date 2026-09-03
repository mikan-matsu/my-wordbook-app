import { defineAuth, secret } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    // Cognitoの制約上、外部プロバイダのみの設定はできないためemailも有効化するが、
    // フロント側のUIはGoogleログインボタンのみを表示する。
    email: true,
    externalProviders: {
      google: {
        clientId: secret('GOOGLE_CLIENT_ID'),
        clientSecret: secret('GOOGLE_CLIENT_SECRET'),
        scopes: ['email'],
      },
      callbackUrls: [
        'http://localhost:3000/',
        'https://develop.d22seqgs51jtrz.amplifyapp.com/',
        'https://main.d22seqgs51jtrz.amplifyapp.com/',
        'https://develop.wordcard.link/',
        'https://wordcard.link/',
        'https://www.wordcard.link/',
      ],
      logoutUrls: [
        'http://localhost:3000/',
        'https://develop.d22seqgs51jtrz.amplifyapp.com/',
        'https://main.d22seqgs51jtrz.amplifyapp.com/',
        'https://develop.wordcard.link/',
        'https://wordcard.link/',
        'https://www.wordcard.link/',
      ],
    },
  },
});
