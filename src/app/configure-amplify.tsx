'use client';

import { Amplify } from 'aws-amplify';
import awsExports from '../aws-exports';

// Amplifyをモジュールレベルで初期化（SSRセーフ）
Amplify.configure(awsExports, { ssr: true });

export default function ConfigureAmplifyClient() {
  return null;
}